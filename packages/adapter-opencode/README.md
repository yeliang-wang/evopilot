# `@evopilot/adapter-opencode`

First-class OpenCode runtime adapter for EvoPilot's Open Lifecycle Harness. It
invokes an exact external OpenCode runtime through `opencode run --format json`,
normalizes its event stream into a digest-bound execution receipt, and persists
only redacted metadata required for safe request replay.

The adapter never uses OpenCode's automatic permission bypass flags. Lifecycle
YAML cannot change the executable, model, workspace, timeout, output limit, or
capability set bound in the reviewed `AgentRuntimeProfile`. Provider credentials
remain in the OpenCode or Host environment and are not written to Lifecycle
inputs, receipts, evidence, or logs.

OpenCode is an external runtime and is intentionally not embedded in EvoPilot.
Install and configure an exact OpenCode version separately, then construct the
adapter with `createOpenCodeExecutorAdapter`. A successful adapter result is
execution evidence only; it never grants approval, publication, or Release
authority.
