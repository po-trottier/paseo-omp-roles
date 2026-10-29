import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseModelRoles } from "../shared/roles";

// ponytail: global config only, add <cwd>/.omp/config.yml when project roles matter.
export async function listRoles() {
  const text = await readFile(join(homedir(), ".omp", "agent", "config.yml"), "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    },
  );
  return { roles: parseModelRoles(text) };
}
