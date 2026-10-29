import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listRoles } from "./server/roles";
import { listRolesRpc } from "./shared/rpc";

export default function contribute(server: PluginServerContext) {
  server.handle(listRolesRpc, listRoles);
  return () => {};
}
