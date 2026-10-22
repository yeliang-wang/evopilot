# EvoPilot 0.7.0 Preview in Codex

The composed Preview exposes one unified Expert. Each installation uses an MCP server namespace derived from its configuration path (`evopilot_<path-hash>`); stable tool names start with `evopilot_v01_`. Those names do not identify the product version. Runtime owns the Codex integration; it is not a fourth product.

After [installation and registration](installation.md), select **EvoPilot v0.7 Preview** for this candidate and inspect the exact installed identity. On first use the Expert inspects and guides explicit Workspace initialization or attachment before activation. A configured Workspace can be activated for the current chat without a second enable question. Activation checks the shared daemon and starts it if absent. Normal work uses the Expert rather than CLI commands.

Inspect the returned session identity, activation state and verified running connection identity, including installation, component versions and workspace. Each chat has its own adapter and activation flag; another chat's daemon does not activate this chat. This native per-chat binding is integration behavior, not tamperproof Host enforcement. Ordinary chats leave the Expert off (`allow_implicit_invocation: false`).

## Passive discovery and active work

Inspect may perform passive authenticated health inspection. JSON-RPC initialize, ping, tools/list, guide and workspace_inspect create no Workspace or control state. The explicitly requested workspace_initialize tool creates project/state data and a binding but leaves the session inactive. Product requests, capabilities, dispatch, reconcile and project operations require current-session activation. Deactivation clears only this chat's flag; closing the chat or EOF does not stop the shared daemon.

The Expert first reads capabilities and scoped owner state, then selects forward/reverse modeling, Harness quality, execution feedback, online observation or reviewed response. See [first journeys](first-journey.md). Native validation needs no LLM callback. The parent composes deterministic native validators and the bounded installed collector; it does not execute arbitrary coding or deployment. Legacy JSON authoring/classification mutations are retired. See [capabilities](capabilities.md) for current providers and limits.

## Adapter and recovery

The installer renders the installed MCP configuration with the current Node executable and managed absolute paths. Configuration is loaded lazily. `installationRoot` is `managedRoot/app`; guide `installedReferences` resolve from that directory, including product guides under `node_modules/@evopilot-next/`.

Requests use `{owner,envelope:{operation,scope,input,requestId?,expectedRevision?}}`, with owner `runtime`, `harness` or `ontology`. Mutations require exact request identity and revision. Dispatch and reconcile use `{args:{scope,id,requestId,expectedRevision}}`. Each owner validates payloads. Setup and maintenance accept explicit local paths through closed schemas; no tool accepts credentials, callback code or approval shortcuts.

Workspace project operations are `bind`, `inspect`, `drift`, `baseline.accept`, `campaign.write`, `campaign.inspect` and `template.upgrade`. A baseline pins selected authorized source files and Git revision without changing the source project. Source drift requires explicit review and does not rewrite published assets. Campaign COMPLETE means pinned criteria have evidence in the private ledger; it is not a native Runtime Goal completion or release authorization.

Backup, restore, migration and template upgrade take the shared maintenance lease, stop the authenticated daemon and deactivate the current session. Concurrent activation cannot restart services during maintenance. Migration returns verified new roots but does not silently rebind a chat or installation. See [recovery](recovery.md) for restore boundaries.

Transport is newline JSON-RPC with one in-flight request. Errors retain safe correlation without provider exception text or credentials. For UNKNOWN, inspect the owner's receipt and run or classification state; reconcile the exact request rather than redispatching.

Stale or mismatched connections require explicit [recovery](recovery.md). The adapter does not delete control evidence or stop unrelated daemons. Installation, registration and removal are documented in [installation](installation.md); technical composition is in [composition contracts](product-composition.md).
