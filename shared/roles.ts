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
 * runs, because several roles can share one model. Otherwise the thinking level
 * breaks the tie, then the order in config.yml.
 */
export function activeRole(
  roles: readonly OmpRole[],
  model: string | null | undefined,
  thinking: string | null | undefined,
  picked: string | undefined,
): string | undefined {
  const candidates = roles.filter((role) => role.model === model);
  if (picked && candidates.some((role) => role.name === picked)) return picked;
  return (candidates.find((role) => role.thinking === thinking) ?? candidates[0])?.name;
}

/**
 * Records `role` as the agent's pick and sends `/switch @role`. A failed send
 * restores the earlier pick, so the label does not claim a role that never ran.
 */
export async function pickRole(
  picked: Map<string, string>,
  agentId: string,
  role: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  const previous = picked.get(agentId);
  picked.set(agentId, role);
  try {
    await send(`/switch @${role}`);
  } catch (error) {
    if (picked.get(agentId) === role) {
      if (previous === undefined) picked.delete(agentId);
      else picked.set(agentId, previous);
    }
    throw error;
  }
}
