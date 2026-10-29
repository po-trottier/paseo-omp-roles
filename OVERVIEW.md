Adds a role pill to the composer of each OMP (Oh My Pi) agent. The pill shows the active omp role, for example `smol`. Its popover lists every role in `modelRoles` of `~/.omp/agent/config.yml`, with the model, provider, and thinking level of each role.

A role in the popover sends `/switch @role` to the agent. omp changes the model for the current session only and does not write `config.yml`. The switch shows as a short user message and an omp reply in the timeline.

The pill finds the active role from the running model. Several roles can use the same model, so the pill prefers the role that you picked last, then the role with the same thinking level, then the first role in `config.yml`.

Limits:

- The plugin reads only the global `config.yml`, not project `.omp/config.yml` files.
- It reads the roles when it starts. Reload the plugin after you change `modelRoles`.
- Paseo does not update the thinking level that it shows after omp changes the model.
