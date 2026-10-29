import type { PluginButton, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { createRolePicker } from "./client/role-picker";
import { activeRole, pickRole, roleAlias, type OmpRole } from "./shared/roles";
import { listRolesRpc } from "./shared/rpc";

interface Agent {
  id: string;
  workspaceId?: string | null;
  provider: string;
  model?: string | null;
  runtimeInfo?: { model?: string | null; thinkingOptionId?: string | null } | null;
}

export default function contribute(client: PluginClientContext) {
  const lifetime = new AbortController();
  const pills = new Map<string, PluginButtonRegistration>();
  // The role picked last per agent. Roles that share a model are otherwise ambiguous.
  const picked = new Map<string, string>();
  // The role on each pill label, read by the popover when it opens.
  const actives = new Map<string, string | undefined>();
  let roles: OmpRole[] = [];

  const RolePicker = createRolePicker({
    roles: () => roles,
    active: (agentId) => actives.get(agentId),
    pick: (agentId, role) =>
      pickRole(picked, agentId, role, (text) => client.paseo.agents.ref(agentId).send(text)),
  });

  // Returns the pill label and records the active role for the popover.
  const label = (agent: Agent): string => {
    const model = agent.runtimeInfo?.model;
    // Paseo keeps its last thinking level when omp changes the model, for example
    // after `/switch`. The level is correct only while the model is the one that
    // Paseo set.
    const thinking = model === agent.model ? agent.runtimeInfo?.thinkingOptionId : undefined;
    const active = activeRole(roles, model, thinking, picked.get(agent.id) ?? roleAlias(agent.model));
    actives.set(agent.id, active);
    return active ?? "No role";
  };

  const render = (agent: Agent) => {
    if (lifetime.signal.aborted || agent.provider !== "omp" || !agent.workspaceId) return;
    const pill = pills.get(agent.id);
    const previous = actives.get(agent.id);
    const text = label(agent);
    // Update the label only: a behavior update closes an open popover.
    if (pill) return previous === actives.get(agent.id) ? undefined : pill.update({ label: text });
    const button: PluginButton = {
      title: "OMP role",
      icon: "UserCog",
      label: text,
      behavior: { kind: "popover", Content: RolePicker },
    };
    pills.set(
      agent.id,
      client.addComposerPill({ id: "omp-role", workspaceId: agent.workspaceId, agentId: agent.id, button }),
    );
  };
  const remove = (agentId: string) => {
    pills.get(agentId)?.remove();
    pills.delete(agentId);
    actives.delete(agentId);
  };

  // ponytail: roles load once, reload the plugin after a modelRoles change in config.yml.
  void client
    .rpc(listRolesRpc, {})
    .then(async (result) => {
      roles = result.roles;
      if (roles.length === 0) return;
      const { subscription } = await client.paseo.agents.list({ subscribe: {}, signal: lifetime.signal });
      subscription?.subscribe({
        snapshot: ({ entries }) => {
          for (const agentId of [...pills.keys()]) remove(agentId);
          for (const { agent } of entries) render(agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "upsert") return render(update.agent);
          remove(update.agentId);
          picked.delete(update.agentId);
        },
      });
    })
    .catch((error) => {
      if (!lifetime.signal.aborted) console.error("[omp-roles] Failed to load roles", error);
    });

  return () => {
    lifetime.abort();
    for (const agentId of [...pills.keys()]) remove(agentId);
  };
}
