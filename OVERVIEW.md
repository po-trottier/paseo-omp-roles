Adds a role pill to the composer of each OMP (Oh My Pi) agent. The pill shows the active omp role, for example `smol`. Its popover lists every role in `modelRoles` of `~/.omp/agent/config.yml`, with the model, provider, and thinking level of each role.

A role in the popover sends `/switch @role` to the agent. omp changes the model for the current session only and does not write `config.yml`. omp also sets the thinking level of the role. A role without a level, for example `web: anthropic/claude-haiku-4-5`, keeps the current level, as in the omp CLI. The switch shows as a short user message and an omp reply in the timeline.

The pill finds the active role from the running model. Several roles can use the same model, so the pill prefers the role that you picked last. A pick stops when you set a different thinking level in Paseo. Then the pill uses the role with the same thinking level. A chat that starts from the Paseo model picker shows a role when its model and thinking level are the same as that role. If no role has the model and the thinking level, the pill shows `Custom` with a different icon. For example, `gpt-6.1-sol` at `low` is `Custom` when every role uses it at `high`.

Limits:

- The plugin reads only the global `config.yml`, not project `.omp/config.yml` files.
- It reads the roles when it starts. Reload the plugin after you change `modelRoles`.
- Paseo does not update the thinking level that it shows after omp changes it, for example after `/switch`. The Paseo thinking selector can show the old level, but omp runs the level of the role. While the model differs from the model that Paseo started or set, the pill ignores the thinking level and uses the first role in `config.yml` with that model. Another client, or the same client after a reload, does not know your last pick.
- The pill does not see a `/switch` that you type in the composer. If the model stays the same, the pill can show `Custom` or a different role until you pick the role in the popover. A pick of the role that the pill shows sends `/switch @role` again, so it applies the model and thinking level of the role again.
- Paseo starts a resumed agent on the model that Paseo set, not on the role that you picked. A role switch does not stay after the Paseo daemon restarts.
