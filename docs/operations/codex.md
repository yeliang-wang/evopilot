# EvoPilot in Codex

The Codex plugin is an EvoPilot Runtime component with its own component version **0.1.0**. Its public release is [codex-plugin-v0.1.0](https://github.com/yeliang-wang/evopilot/releases/tag/codex-plugin-v0.1.0); see the [component README](../../plugins/evopilot/README.md) and [installer source](../../plugins/evopilot/install.mjs). Runtime/CLI/MCP **6.3.3**, Evolution Expert **2.3.1**, Harness **4.8.2**, and private local project extensions **1.0.1** remain unchanged.

## Administrator installation

Use macOS arm64 and a preinstalled plugin Node **24.14.x**. Automatic registration is tested with Codex CLI **0.162.0-alpha.2**; other versions leave a prepared installation. An already configured local Runtime **6.3.3**, registered in the current user's launchd domain, is required. Reuse its existing CLI configuration, credentials and LLM profiles. The installer checks the existing registration; it does not provision or start a Runtime.

The Runtime plist must reference its canonical executable Node binary and one `.mjs` launcher. The plugin Node and Runtime Node can differ: retain the configured Runtime's supported Node and launcher. Use canonical absolute paths with no symlinks or unsafe writable parents. Existing private CLI configuration must be user-owned, single-link, mode `0600`, with exactly `server`, `token`, `tenant`, `workspace`, and `actor`; the server must be loopback HTTP at `127.0.0.1` with an explicit port. Keep configuration and credentials local.

Obtain the bundled component tarball from the exact release above. Its SHA-256 is:

```text
369e3fb421b81624b5b79e24e95e5a102ab5aae9eb043808c5bdd322dd198393
```

Verify the entire digest **before extraction**, using the absolute path to the downloaded tarball:

```sh
shasum -a 256 /absolute/downloads/component-release.tgz
```

Stop on mismatch. Extract the verified tarball into a durable, user-owned source directory with safe parents. Use its `package/install.mjs`, repository license and bundled dependencies together; a source-only archive or an installer copied on its own is insufficient. Installation requires no npm download.

Use a durable destination such as `~/.local/share/evopilot/codex/releases/0.1.0`. Its parent must already exist and be safe; the destination itself must not exist or overlap the extracted source or referenced installation directories. Replace every example path below with a **canonical absolute path**, including the expanded home directory; do not pass a literal `~` or a relative path as an installer argument.

```sh
/absolute/plugin-node-24.14.0/bin/node /absolute/extracted/package/install.mjs \
  --destination /absolute/home/.local/share/evopilot/codex/releases/0.1.0 \
  --cli-config /absolute/existing/runtime-cli.json \
  --plist /absolute/existing/runtime.plist \
  --runtime-package /absolute/runtime/node_modules/@evopilot/server/package.json \
  --codex /absolute/codex/bin/codex

/absolute/plugin-node-24.14.0/bin/node /absolute/extracted/package/install.mjs \
  --doctor /absolute/home/.local/share/evopilot/codex/releases/0.1.0
```

The installer copies the validated payload and generates local bridge metadata. It pins the referenced Runtime files and retains the installer's Node for the bridge. It registers through public Codex commands, verifying marketplace `evopilot-plugin` and plugin `evopilot@evopilot-plugin`, their source and version, and unchanged unrelated entries. Keep the source, installation directory and existing configuration for diagnosis and recovery.

## User activation

Select **EvoPilot** in Codex and explicitly ask to start its connection, for example: “Use EvoPilot to start the connection, inspect readiness and list my projects.” Alternatively use `$evopilot` with that request. Selection alone does not activate the workflow: `evopilot_workflow_start` enables the bridge for the conversation, checks the existing process or starts the known configured service, and reports readiness before official tool use.

Ordinary chat need not opt in. The shared Runtime persists across chats. This is explicit conversation routing, with no claim of globally unbypassable Host enforcement. Runtime and other owners retain their approval, execution and credential responsibilities; connection success does not authorize project execution or release.

## Diagnosis and recovery

Inspect current public registration state with the existing Codex executable:

```sh
/absolute/codex/bin/codex plugin marketplace list --json
/absolute/codex/bin/codex plugin list --json
```

| Result | Meaning and next step |
| --- | --- |
| `PLUGIN_REGISTERED` | Registration replies and list readbacks matched. Runtime readiness and Desktop operation require separate observation. |
| `PREPARED_NOT_REGISTERED` | CLI version, list schema or existing identity prevented registration. An existing marketplace/plugin identity is a conflict, not permission to replace it. Inspect the lists before deciding the next action. |
| `MATERIALIZED_VERIFIED` | Doctor checked inventoried hashes, modes, referenced pins and read the public plugin list. It does not repair files or certify registration, Runtime health or Desktop behavior. |
| `INSPECT_CURRENT_PLUGIN_STATE` | Retain the destination and intent/result records. Inspect actual lists before retry; uncertain registration must not be replayed automatically. |
| `UNSUPPORTED_HOST`, path/mode or pin/hash errors | Inspect the reported prerequisite or changed input. Preserve protections and evidence; do not reset or overwrite the installation. |
| `SETUP_REQUIRED` | Inspect the returned `nextAction` and existing configuration/profiles. Repair only the identified prerequisite, then explicitly start when appropriate. |
| `UNKNOWN_OUTCOME_NO_REPLAY` | Inspect owner state and retained request receipts before any further mutation; a new start does not authorize redispatch. |

Retain prior component source, installation records, configuration and current daily data for recovery. This guide prescribes no destructive reset or restoration of old Suite/isolated acceptance data.

## Verification limits and maintenance scope

Publication and local component tests do not prove fresh Desktop verification. **Current fresh Desktop reinstallation and ordinary-chat repeat verification remain pending until separately recorded**, as does evidence for this round's local cleanup/new installation checks. Historical observations retain their original scope.

The user abandoned the incomplete Runtime 6.5 / Expert 2.4 / Harness 4.8.3 full-series upgrade. Historical targets, failure records and uncertain outcomes remain evidence or future references, with no automatic resumption. This maintenance creates no new Runtime, Expert or Harness release and no “Project Resources” product; private independent project extensions remain at 1.0.1.
