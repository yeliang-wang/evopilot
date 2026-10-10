# EvoPilot Codex plugin 0.1.0

Explicitly use an existing EvoPilot Runtime from a Codex conversation. Plugin **0.1.0**, Runtime/MCP **6.3.3**, and Evolution Expert **2.3.1** are independently versioned. Current Desktop acceptance is pending operator verification; this is not full original R3 completion.

## Prerequisites

- macOS arm64, Node **24.14.x** (operator host: 24.14.0), and Codex CLI **0.162.0-alpha.2** for automatic registration. Other CLI versions leave a prepared installation.
- An already configured local Runtime 6.3.3 registered with the current user's launchd domain. Its plist must name its existing canonical executable Node binary and one `.mjs` launcher. Runtime must use a loopback HTTP endpoint and existing CLI credentials/LLM profiles.
- Canonical absolute paths without symlinks or group/world-writable parents. Private CLI configuration must be owned by the current user, single-link, mode `0600`, with exactly `server`, `token`, `tenant`, `workspace`, `actor`. Use existing private configuration locally; never paste it or tokens into chat.
- A verified public release payload containing the repository license and bundled public dependencies. Installation uses no npm network access and needs no test directory. The installer generates the installation descriptor and explicit-only `openai.yaml`; do not create duplicate source metadata.

## Verify and install

Obtain the artifact and its SHA-256 from the operator-verified GitHub release. Verify the hash **before extraction**, for example `shasum -a 256 /absolute/downloads/evopilot-plugin.tgz`, and compare the entire digest with the release's expected digest. Stop on mismatch. No public release URL is asserted here.

Extract into a user-owned directory with safe parents. Replace every placeholder below with a canonical absolute path. The destination must not exist and must not overlap the extracted source or referenced installation directories.

Use the separately preinstalled plugin Node **24.14.x** (24.14.0 below) for the installer and bridge; the generated `.mcp.json` command retains the installer's `process.execPath`. Registration retains the Runtime Node from the plist's exact `ProgramArguments`, with the plist, Node and launcher hashes pinned. The configured Runtime's supported Node **22.23.3** and launcher remain unchanged; the two Node paths need not match. No Node or dependency installation is implicit.

```sh
/absolute/plugin-node-24.14.0/bin/node /absolute/extracted/package/install.mjs \
  --destination /absolute/owned/plugins/evopilot-0.1.0 \
  --cli-config /absolute/private/runtime-cli.json \
  --plist /absolute/launchagents/runtime.plist \
  --runtime-package /absolute/runtime/node_modules/@evopilot/server/package.json \
  --codex /absolute/codex/bin/codex

/absolute/plugin-node-24.14.0/bin/node /absolute/extracted/package/install.mjs \
  --doctor /absolute/owned/plugins/evopilot-0.1.0
```

The installer validates and copies the payload, then uses public Codex marketplace/plugin commands. It verifies the exact `evopilot-plugin` marketplace root and `evopilot@evopilot-plugin` identity/version/source by reading lists back, while checking that unrelated installed entries remain unchanged. It never reads private Codex configuration.

## First conversation

After registration, select **EvoPilot** in Codex and submit a natural request such as “Use EvoPilot to inspect readiness and list my projects.” Alternatively submit `$evopilot` with your instruction. Selection alone does not activate a workflow. The plugin starts its connection explicitly, reports truthful status, discovers official tools, and follows the bundled Expert guidance. There is no global MCP/CLI fallback.

Activation applies to the current conversation; ordinary chat is unaffected. The shared Runtime service persists and is reused across chats. This is opt-in routing, not tamper-proof Host enforcement. Owners retain approvals, execution state and credentials.

## Status and recovery

- `PLUGIN_REGISTERED`: both public registration replies and list readbacks were verified. This does not establish Desktop acceptance or Runtime readiness.
- `PREPARED_NOT_REGISTERED`: files were prepared, but registration was not performed because the CLI version, list schema or existing identity was unsuitable. Inspect public marketplace/plugin lists before deciding how to register; preparation alone is not installation success.
- `MATERIALIZED_VERIFIED`: doctor verified inventoried hashes, expected `0600`/`0700` public asset modes, private record protections and referenced pins, and read the public plugin list. It does not certify registration, Desktop operation or Runtime health.
- `INSPECT_CURRENT_PLUGIN_STATE`: a prior intent exists, or a registration reply/readback was missing, uncertain or inconsistent. Retain the destination and intent/result records; inspect public lists without replaying add commands. The installer does not automatically resume an uncertain registration.
- `UNSUPPORTED_HOST`, unsafe-path/mode errors or pin/hash mismatches: correct the reported prerequisite or obtain a verified payload. Do not weaken path protections or overwrite retained evidence. Doctor does not repair files.
- Workflow `SETUP_REQUIRED`: follow the returned `nextAction` using permitted setup tools and existing profiles. Unavailable adapters/services require inspection and an explicit start after repair. `UNKNOWN_OUTCOME_NO_REPLAY` requires inspecting owner state/receipts before any further mutation.

The operator reports that the full bridge to the daily Runtime passed with Runtime 6.3.3 PID reuse, 113 official tools and project-list HTTP 200; isolated launchd cold start and concurrent reuse also passed. Extracted-package validation of the installer correction with distinct Node paths and Desktop verification remain pending. Regression tests cover inactive child-process initialize/list/status and the packaged Expert link; they were added but not run in this bounded source edit.

Harness authoring, fresh whole-series installs/upgrades, private executor/collector distribution and implicit routing are outside this first release.
