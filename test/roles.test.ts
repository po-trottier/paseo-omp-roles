// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeRole, currentPick, parseModelRoles, pickRole, type RolePick } from "../shared/roles.ts";

const CONFIG = `theme: dark
modelRoles:
  default: anthropic/claude-opus-5-5:high
  slow: anthropic/claude-opus-5-5:xhigh
  plan: 'anthropic/claude-opus-5-5:xhigh'
  smol: nvhub/gcp/google/gemini-3.8-flash:low, openai/gpt-5-mini
  tiny: '@smol'
  hot: "@smol:high"
  web: anthropic/claude-haiku-4-5
  loop: '@loop'
statusLine:
  preset: default
`;

test("parses roles, first candidates, quotes, and aliases", () => {
  assert.deepEqual(parseModelRoles(CONFIG), [
    { name: "default", model: "anthropic/claude-opus-5-5", thinking: "high" },
    { name: "slow", model: "anthropic/claude-opus-5-5", thinking: "xhigh" },
    { name: "plan", model: "anthropic/claude-opus-5-5", thinking: "xhigh" },
    { name: "smol", model: "nvhub/gcp/google/gemini-3.8-flash", thinking: "low" },
    { name: "tiny", model: "nvhub/gcp/google/gemini-3.8-flash", thinking: "low" },
    { name: "hot", model: "nvhub/gcp/google/gemini-3.8-flash", thinking: "high" },
    { name: "web", model: "anthropic/claude-haiku-4-5", thinking: null },
  ]);
  assert.deepEqual(parseModelRoles("theme: dark\n"), []);
});

test("active role prefers the pick, then the same thinking level", () => {
  const roles = parseModelRoles(CONFIG);
  const opus = "anthropic/claude-opus-5-5";
  assert.equal(activeRole(roles, opus, "xhigh", "plan"), "plan");
  assert.equal(activeRole(roles, opus, "xhigh", undefined), "slow");
  // A model that a role uses, at a level that no role uses, is no role.
  assert.equal(activeRole(roles, opus, "low", undefined), undefined);
  assert.equal(activeRole(roles, opus, null, undefined), "default");
  assert.equal(activeRole(roles, "anthropic/claude-haiku-4-5", "low", undefined), "web");
  assert.equal(activeRole(roles, opus, "high", "smol"), "default");
  assert.equal(activeRole(roles, "other/model", "high", "default"), undefined);
});

test("a pick ends when the thinking level that Paseo shows changes", () => {
  const roles = parseModelRoles(CONFIG);
  const opus = "anthropic/claude-opus-5-5";
  // Picked `plan` from opus/high. Paseo still shows `high` after `/switch`.
  const picked = new Map<string, RolePick>([["a", { role: "plan", thinking: "high" }]]);
  assert.equal(activeRole(roles, opus, "high", currentPick(picked, "a", "high")), "plan");
  // Then `low` was set in Paseo: omp runs opus/low, which is no role.
  assert.equal(activeRole(roles, opus, "low", currentPick(picked, "a", "low")), undefined);
  assert.equal(picked.has("a"), false);
});

test("a pick holds while Paseo moves to the level of the role", () => {
  // Picked `vision` (high) from sol/low. Paseo shows low until the plugin sets high.
  const picked = new Map<string, RolePick>([["a", { role: "vision", thinking: "high", previous: "low" }]]);
  assert.equal(currentPick(picked, "a", "low"), "vision");
  assert.equal(currentPick(picked, "a", "high"), "vision");
  // After Paseo shows high, a later `low` from the Paseo selector ends the pick.
  assert.equal(currentPick(picked, "a", "low"), undefined);
  // A level that is neither the earlier one nor the role's ends the pick at once.
  picked.set("a", { role: "vision", thinking: "high", previous: "low" });
  assert.equal(currentPick(picked, "a", "xhigh"), undefined);
});

test("failed switch restores the earlier pick", async () => {
  const roles = parseModelRoles(CONFIG);
  const before = { role: "default", thinking: "high" };
  const picked = new Map<string, RolePick>([["a", before]]);
  const sent: string[] = [];
  await assert.rejects(
    pickRole(picked, "a", { role: "slow", thinking: "high" }, async (text) => {
      sent.push(text);
      throw new Error("offline");
    }),
    /offline/,
  );
  assert.deepEqual(sent, ["/switch @slow"]);
  assert.equal(picked.get("a"), before);
  assert.equal(activeRole(roles, "anthropic/claude-opus-5-5", "high", picked.get("a")?.role), "default");

  const empty = new Map<string, RolePick>();
  await assert.rejects(pickRole(empty, "a", { role: "slow", thinking: "high" }, async () => Promise.reject(new Error("x"))));
  assert.equal(empty.has("a"), false);

  await pickRole(picked, "a", { role: "plan", thinking: "high" }, async () => {});
  assert.equal(picked.get("a")?.role, "plan");
});
