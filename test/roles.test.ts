// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeRole, parseModelRoles, pickRole } from "../shared/roles.ts";

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

test("active role prefers the pick, then thinking, then config order", () => {
  const roles = parseModelRoles(CONFIG);
  const opus = "anthropic/claude-opus-5-5";
  assert.equal(activeRole(roles, opus, "xhigh", "plan"), "plan");
  assert.equal(activeRole(roles, opus, "xhigh", undefined), "slow");
  assert.equal(activeRole(roles, opus, "low", undefined), "default");
  assert.equal(activeRole(roles, opus, "high", "smol"), "default");
  assert.equal(activeRole(roles, "other/model", "high", "default"), undefined);
});

test("failed switch restores the earlier pick", async () => {
  const roles = parseModelRoles(CONFIG);
  const picked = new Map([["a", "default"]]);
  const sent: string[] = [];
  await assert.rejects(
    pickRole(picked, "a", "slow", async (text) => {
      sent.push(text);
      throw new Error("offline");
    }),
    /offline/,
  );
  assert.deepEqual(sent, ["/switch @slow"]);
  assert.equal(activeRole(roles, "anthropic/claude-opus-5-5", "high", picked.get("a")), "default");

  const empty = new Map<string, string>();
  await assert.rejects(pickRole(empty, "a", "slow", async () => Promise.reject(new Error("x"))));
  assert.equal(empty.has("a"), false);

  await pickRole(picked, "a", "plan", async () => {});
  assert.equal(picked.get("a"), "plan");
});
