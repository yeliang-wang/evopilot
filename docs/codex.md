# EvoPilot 0.1.1 Preview in Codex

The composed Preview exposes one unified Expert and the `evopilot_v01_preview` MCP namespace. Tool names start with `evopilot_v01_`. Runtime owns the Codex integration; it is not a fourth product.

After [installation and registration](installation.md), select **EvoPilot v0.1 Preview** and submit an EvoPilot task. That activates the current chat without a second enable question, checks the shared local daemon and starts it if absent. You can also say “Enable EvoPilot v0.1 Preview for this chat.” Normal work then uses the Expert rather than CLI commands.

Inspect the returned session identity, activation state and verified running connection identity, including installation, component versions and workspace. Each chat has its own adapter and activation flag; another chat's daemon does not activate this chat. This native per-chat binding is integration behavior, not tamperproof Host enforcement. Ordinary chats leave the Expert off (`allow_implicit_invocation: false`).

## Passive discovery and active work

Inspect may perform passive authenticated health inspection. Initialize, ping, tools/list and guide need no live connection and create no workspace or control state. Pure information and guide requests remain passive. Product requests, capabilities, dispatch and reconcile require current-session activation. Deactivation clears only this chat's flag; closing the chat or EOF does not stop the shared daemon.

The Expert first reads capabilities and scoped owner state, then selects forward modeling, reverse modeling, Harness quality or Runtime handoff. See [four first journeys](first-journey.md). Native asset work needs no LLM callback. Advanced classification and legacy Catalog resolution need trusted SDK providers. Runtime execution remains unavailable/inspect-only until its executor is wired; see [capabilities](capabilities.md).

## Adapter and recovery

The installer renders the installed MCP configuration with the current Node executable and managed absolute paths. Configuration is loaded lazily. `installationRoot` is `managedRoot/app`; guide `installedReferences` resolve from that directory, including product guides under `node_modules/@evopilot-next/`.

Requests use `{owner,envelope:{operation,scope,input,requestId?,expectedRevision?}}`, with owner `runtime`, `harness` or `ontology`. Mutations require exact request identity and revision. Dispatch and reconcile use `{args:{scope,id,requestId,expectedRevision}}`. Each owner validates operational payloads. Tools accept no credentials, connection paths, callback code or approval shortcuts.

Transport is newline JSON-RPC with one in-flight request. Errors retain safe correlation without provider exception text or credentials. For UNKNOWN, inspect the owner's receipt and run or classification state; reconcile the exact request rather than redispatching.

Stale or mismatched connections require explicit [recovery](recovery.md). The adapter does not delete control evidence or stop unrelated daemons. Installation, registration and removal are documented in [installation](installation.md); technical composition is in [composition contracts](product-composition.md).
