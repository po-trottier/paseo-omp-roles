import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const listRolesRpc = defineRpc({
  name: "roles.list",
  input: z.object({}),
  output: z.object({
    roles: z.array(z.object({ name: z.string(), model: z.string(), thinking: z.string().nullable() })),
  }),
});
