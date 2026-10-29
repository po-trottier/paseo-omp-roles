import type { PluginButton, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { createRolePicker } from "./client/role-picker";
import { activeRole, currentPick, pickRole, roleAlias, roleLabel, type OmpRole, type RolePick } from "./shared/roles";
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
  const picked = new Map<string, RolePick>();
  // The role on each pill label, read by the popover when it opens.
  const actives = new Map<string, string | undefined>();
  // The thinking level that Paseo shows for each agent, kept with a new pick.
  const thinkings = new Map<string, string | null | undefined>();
  let roles: OmpRole[] = [];

  const RolePicker = createRolePicker({
    roles: () => roles,
    active: (agentId) => actives.get(agentId),
    pick: (agentId, role) => {
      // omp sets the level of the role on `/switch`. Paseo does not show that level
      // yet, so the pick holds on the earlier level until Paseo shows the new one.
      const level = roles.find((entry) => entry.name === role)?.thinking;
      const target = level && level !== "inherit" ? level : undefined;
      const shown = thinkings.get(agentId);
      const pick: RolePick = target ? { role, thinking: target, previous: shown } : { role, thinking: shown };
      return pickRole(picked, agentId, pick, (text) => client.paseo.agents.ref(agentId).send(text));
    },
  });

  // Returns the active role and records it for the popover.
  const resolve = (agent: Agent): string | undefined => {
    const model = agent.runtimeInfo?.model;
    const shown = agent.runtimeInfo?.thinkingOptionId;
    thinkings.set(agent.id, shown);
    // Paseo keeps its last thinking level when omp changes the model, for example
    // after `/switch`. The level is correct only while the model is the one that
    // Paseo set.
    const thinking = model === agent.model ? shown : undefined;
    const pick = currentPick(picked, agent.id, shown);
    const active = activeRole(roles, model, thinking, pick ?? roleAlias(agent.model));
    actives.set(agent.id, active);
    return active;
  };
  const render = (agent: Agent) => {
    if (lifetime.signal.aborted || agent.provider !== "omp" || !agent.workspaceId) return;
    const pill = pills.get(agent.id);
    const previous = actives.get(agent.id);
    const active = resolve(agent);
    // A chat whose model and thinking level match no role shows `Custom`.
    const look = active
      ? { title: "OMP role", icon: "UserCog", label: roleLabel(active) }
      : { title: "OMP role: none", icon: "UserRound", label: "Custom" };
    // Update the presentation only: a behavior update closes an open popover.
    if (pill) return previous === active ? undefined : pill.update(look);
    const button: PluginButton = { ...look, behavior: { kind: "popover", Content: RolePicker } };
    pills.set(
      agent.id,
      client.addComposerPill({ id: "omp-role", workspaceId: agent.workspaceId, agentId: agent.id, button }),
    );
  };
  const remove = (agentId: string) => {
    pills.get(agentId)?.remove();
    pills.delete(agentId);
    actives.delete(agentId);
    thinkings.delete(agentId);
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
