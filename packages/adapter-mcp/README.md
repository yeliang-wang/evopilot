# `@evopilot/adapter-mcp`

Installable stdio MCP adapter for EvoPilot's server-governed Open Lifecycle Harness.
It exposes the same lifecycle operations as the HTTP API and adds no approval,
execution, or publication authority of its own.

Configure the Agent host with the `evopilot-mcp` command. Runtime connection and
identity values are read from `EVOPILOT_SERVER`, `EVOPILOT_API_TOKEN`,
`EVOPILOT_TENANT`, `EVOPILOT_WORKSPACE`, and `EVOPILOT_ACTOR`. Keep the token in the
host's secret environment; never place it in a Lifecycle YAML file or tool argument.
