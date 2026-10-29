export interface OmpRole {
  name: string;
  model: string;
  thinking: string | null;
}

const THINKING: Record<string, true> = {
  off: true, minimal: true, low: true, medium: true, high: true, xhigh: true, max: true, auto: true, inherit: true,
};
const ALIAS = /^(?:@|pi\/)([\w-]+)$/;

function splitThinking(value: string): Omit<OmpRole, "name"> {
  const index = value.lastIndexOf(":");
  const level = value.slice(index + 1);
  return index > 0 && Object.hasOwn(THINKING, level)
    ? { model: value.slice(0, index), thinking: level }
    : { model: value, thinking: null };
}

/** Returns the role name of a `@role` or `pi/role` selector. */
export function roleAlias(selector: string | null | undefined): string | undefined {
  return ALIAS.exec(selector ?? "")?.[1];
}

/**
 * Reads `modelRoles` from omp `config.yml` text. Each role resolves to the first
 * candidate of its list, and `@role` aliases resolve to their target.
 */
export function parseModelRoles(yaml: string): OmpRole[] {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => /^modelRoles:\s*$/.test(line));
  if (start < 0) return [];
  const raw = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^\s+([\w-]+):\s*(.+?)\s*$/.exec(line);
    if (!match) break;
    raw.set(match[1]!, match[2]!.replace(/^(['"])(.*)\1$/, "$2"));
  }
  const resolve = (value: string, seen: string[]): Omit<OmpRole, "name"> | undefined => {
    const { model, thinking } = splitThinking(value.split(",")[0]!.trim());
    const alias = roleAlias(model);
    if (!alias) return { model, thinking };
    const target = raw.get(alias);
    if (target === undefined || seen.includes(alias)) return undefined;
    const resolved = resolve(target, [...seen, alias]);
    return resolved && { model: resolved.model, thinking: thinking ?? resolved.thinking };
  };
  return [...raw].flatMap(([name, value]) => {
    const resolved = resolve(value, [name]);
    return resolved ? [{ name, ...resolved }] : [];
  });
}

/**
 * Names the role whose model the agent runs. `picked` wins while its model still
 * runs, because several roles can share one model. A known `thinking` must then
 * equal the level of the role, and a role without a level accepts any level. An
 * unknown `thinking` (null or undefined) selects the first role in config.yml.
 */
export function activeRole(
  roles: readonly OmpRole[],
  model: string | null | undefined,
  thinking: string | null | undefined,
  picked: string | undefined,
): string | undefined {
  const candidates = roles.filter((role) => role.model === model);
  if (picked && candidates.some((role) => role.name === picked)) return picked;
  if (thinking == null) return candidates[0]?.name;
  return (
    candidates.find((role) => role.thinking === thinking) ?? candidates.find((role) => role.thinking === null)
  )?.name;
}

export interface RolePick {
  role: string;
  /** The thinking level that Paseo shows while the pick holds. */
  thinking: string | null | undefined;
  /** The level that Paseo showed before the pick, until Paseo shows `thinking`. */
  previous?: string | null | undefined;
}

/** Returns the role name with a capital first letter, for the UI only. */
export function roleLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Returns the role picked for the agent. The pick holds while Paseo shows the
 * level of the pick, or the earlier level until the new level arrives. Any
 * other level means that you set a new level in Paseo, so the pick ends.
 */
export function currentPick(
  picked: Map<string, RolePick>,
  agentId: string,
  thinking: string | null | undefined,
): string | undefined {
  const pick = picked.get(agentId);
  if (!pick) return undefined;
  if (thinking === pick.thinking) delete pick.previous;
  else if (!("previous" in pick) || thinking !== pick.previous) {
    picked.delete(agentId);
    return undefined;
  }
  return pick.role;
}

/**
 * Records `pick` as the agent's pick and sends `/switch @role`. A failed send
 * restores the earlier pick, so the label does not claim a role that never ran.
 */
export async function pickRole(
  picked: Map<string, RolePick>,
  agentId: string,
  pick: RolePick,
  send: (text: string) => Promise<void>,
): Promise<void> {
  const previous = picked.get(agentId);
  picked.set(agentId, pick);
  try {
    await send(`/switch @${pick.role}`);
  } catch (error) {
    if (picked.get(agentId) === pick) {
      if (previous === undefined) picked.delete(agentId);
      else picked.set(agentId, previous);
    }
    throw error;
  }
}
