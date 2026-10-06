# Install EvoPilot in an Agent Host

This guide describes connecting an Agent Host to **Runtime 6.3.3**, **Evolution Expert 2.3.1**, and **Harness 4.8.2**. It covers a local Codex installation using Node.js 22.14.0 or newer. The first result is an authenticated, read-only Runtime response; running a project has additional prerequisites in [Your first task](first-task.md).

Before installing these exact versions, check [current publication and acceptance limits](../releases/current-release.md). Source documentation can precede public package promotion.

## Choose the starting point

| Your starting point | Next step |
| --- | --- |
| Runtime already runs and this Host already connects | Keep its MCP launcher, Runtime credentials, workspace and LLM binding. Check the Expert Skill, then follow [the first task](first-task.md). |
| Runtime already runs, but this Host is new | Obtain the existing installation's launcher or connection settings from its operator. Install the packages and connect stdio below. |
| No Runtime exists | An operator first follows [Self-Hosting](../operations/self-hosting.md) to start the service and provision Runtime access. Then return here. Installing Expert or the MCP adapter alone does not start Runtime. |

Reuse existing configuration. A valid Runtime 6.3.3 workspace LLM binding does not require another key, preflight or rebind merely because time has passed or the Host restarted. Inspect its current state first; only a reported setup or repair action requires more work. See [readiness continuity](first-run-llm-readiness.md#initial-freshness-and-continued-use).

## Understand the connections

```text
Codex + Evolution Expert Skill
    -- MCP stdio --> @evopilot/adapter-mcp
    -- local HTTP from that adapter --> EvoPilot Runtime (127.0.0.1:19876)

Codex -- separate MCP stdio --> evopilot-harness mcp serve
EvoPilot Runtime -- published Registry/Catalog reads --> Harness artifacts
```

Expert is a Skill and guidance package, not another server process. The EvoPilot MCP adapter is the local executable that translates Host tool calls to Runtime's authenticated API. `http://127.0.0.1:19876` is that API address, not a Streamable HTTP MCP endpoint; do not put it in Codex's MCP `url` field. The Harness MCP server is a separate producer interface. Runtime consumes published Harness artifacts; it does not gain Harness authoring authority through Expert.

## Install the packages

For a fresh installation, the operator runs:

```bash
node --version
npm install --global @evopilot/evolution-expert@2.3.1 @evopilot/adapter-mcp@6.3.3 @evopilot/harness@4.8.2
node -p 'process.execPath'
npm root --global
evopilot-expert version
evopilot-expert doctor codex 6.3.3
```

Record the absolute Node path and global package root printed above. These commands install client packages; an existing managed installation should retain its pinned package paths and launcher. `doctor` checks declared compatibility only: its `READY` is not a live Runtime-readiness result. The CLI prints JSON without a `--json` flag.

## Activate the generated Codex Skill

The npm package contains `generated/codex/SKILL.md`, `adapter.json` and `bundle.json`. Installing npm bytes does not put them in Codex's Skill search path. For a **new** user-level Skill directory:

```bash
expert_package="$(npm root --global)/@evopilot/evolution-expert"
expert_skill="$HOME/.agents/skills/evopilot-evolution-expert-codex"
if [ -e "$expert_skill" ] || [ -L "$expert_skill" ]; then
  printf '%s\n' 'An Expert Skill already exists; keep it and inspect its version before an explicit upgrade.'
else
  mkdir -p "$HOME/.agents/skills"
  cp -R "$expert_package/generated/codex" "$expert_skill"
fi
```

Keep all three files together. The generated Skill's name is `evopilot-evolution-expert-codex`. Select it in the Host's Skill picker; in Codex CLI/IDE, mention `$evopilot-evolution-expert-codex` explicitly. If it is not discovered, restart Codex and check for a disabled Skill entry. [Official Codex Skill guidance](https://learn.chatgpt.com/docs/build-skills) describes discovery and invocation.

The bundle's `host://.../install`, `doctor` and related entries are lifecycle metadata, not shell commands or a working one-click installer. Expert 2.3.1 has no `evopilot-expert install` command. Updating the npm package does **not** refresh a copied Skill: review the new generated bundle, back up the existing directory, and replace that directory only as an explicit Expert upgrade. Runtime state stays in Runtime.

## Connect Runtime over stdio

If the operator has already supplied a managed MCP launcher, keep it: its private credential loading and scope are part of the existing installation. Configure its exact absolute Node/script paths instead of replacing it with a new credential flow.

For a new direct adapter entry, merge this illustrative block into `~/.codex/config.toml`; preserve all unrelated settings and any existing `evopilot` entry. Replace every `/absolute/...` path and scope value with the installation's actual values:

```toml
[mcp_servers.evopilot]
command = "/absolute/path/to/node"
args = ["/absolute/npm-root/@evopilot/adapter-mcp/dist/stdio.js"]
env_vars = ["EVOPILOT_API_TOKEN"]

[mcp_servers.evopilot.env]
EVOPILOT_SERVER = "http://127.0.0.1:19876"
EVOPILOT_TENANT = "your-existing-tenant"
EVOPILOT_WORKSPACE = "your-existing-workspace"
EVOPILOT_ACTOR = "your-registered-actor"
```

`EVOPILOT_API_TOKEN` is the existing **EvoPilot Runtime** credential, not an LLM key or the Host's login. The operator makes it available to the Host process through its established protected launch environment; `env_vars` forwards an available variable, it does not create or retrieve one. A desktop app launched from the Dock may not inherit terminal exports. In that case use the existing trusted launcher or have the operator configure that launch environment, without putting secrets in the TOML example or chat. Tenant/workspace and actor headers do not override Runtime membership or permissions. [Official Codex MCP settings](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) documents stdio configuration.

The adapter reads these environment variables. It does **not** read the CLI's `EVOPILOT_CONFIG` file or automatically load `.env`; a working CLI connection is therefore not proof that a newly added MCP process has authentication. Keep provider credentials server-side in the existing Profile/SecretRef.

Restart the Host after changing its MCP configuration. Check that the `evopilot` server connects and exposes `evopilot_llm_setup_protocol` and `evopilot_runtime_readiness_inspect`, then perform the read-only task below. A tools list alone does not prove the second hop to Runtime works.

## Connect Harness separately

Harness owns authoring, review, versioning and publication. If Runtime already has an operator-configured published Registry, reuse it. A local Harness MCP connection is useful for explicitly requested producer work; it does not publish a Catalog or configure Runtime's Registry automatically.

For Codex, obtain installed-version instructions without changing its configuration:

```bash
evopilot-harness agent bootstrap --host codex --workspace /absolute/path/to/harness-workspace --json
```

Bootstrap returns `adapter.path` for the packaged Codex `SKILL.md`. Load it as the Harness Digital Expert instructions; for persistent discovery, copy that file into a new `~/.agents/skills/evopilot-harness-digital-expert/SKILL.md`, preserving an existing Skill for an explicit upgrade. This is a separate Skill from Evolution Expert. Follow its exact Engine-owned presentation instructions during producer work.

Configure the returned MCP command as a separate stdio server. For the global package installation above, the absolute-path form is:

```toml
[mcp_servers.evopilot-harness]
command = "/absolute/path/to/node"
args = ["/absolute/npm-root/@evopilot/harness/src/index.mjs", "mcp", "serve", "--transport", "stdio", "--workspace", "/absolute/path/to/harness-workspace"]
```

Keep that mutable workspace outside the installed package and application source. Bootstrap is read-only guidance, not installation or classification. Its `status: READY` can coexist with `llmInitialization.status: NOT_CONFIGURED`; it does not prove model readiness. Harness model setup belongs to its own workspace and does not automatically reuse Runtime's governed Profile or the Host's conversational model. Preserve any existing configuration and follow the installed Harness setup instructions only when producer model operations are needed.

Harness's managed `agent install`, `status`, `upgrade`, `repair` and `uninstall` lifecycle targets **WorkBuddy**, not Codex. A generated Codex adapter and a manual stdio configuration do not make `agent install --host codex` supported. The WorkBuddy preview command is:

```bash
evopilot-harness agent install --host workbuddy --workspace /absolute/path/to/harness-workspace --json
```

An unapplied plan returns `CONFIRMATION_REQUIRED` and exit code 2; apply only the reviewed plan's exact `--confirm` digest. WorkBuddy 5.x support also depends on its managed Node runtime directory: global npm installation alone does not populate that independent runtime. The installer synchronizes it only when the selected runtime root already has a `package.json`. The `--host-home` parameter selects its configuration root (otherwise `WORKBUDDY_CONFIG_DIR`, then `~/.workbuddy`); `--runtime-root` selects the managed Node workspace (otherwise `<host-home>/binaries/node/workspace`). Inspect the returned plan before confirming it. Do not apply a WorkBuddy config file to Codex. Installer success still reports `liveSessionVerified: false`.

Before Runtime plans a Goal, its operator must configure `EVOPILOT_HARNESS_REGISTRY_CONFIG` to a Registry whose enabled Catalogs contain eligible published immutable Bundles. Installing the Harness npm package or listing its tools is insufficient. See [Harness Registry](../cli/quickstart.md#2-prepare-harness-catalog) and the [Harness project](https://github.com/yeliang-wang/evopilot-harness).

## Host support matrix

These columns describe different claims. A packaged adapter is guidance; an installer changes Host configuration; live acceptance verifies an exact Host and artifact combination.

| Host | Expert 2.3.1 generated bundle | Setup path | Current release's live Host acceptance |
| --- | --- | --- | --- |
| Codex | `generated/codex` | Copy/activate Skill and configure stdio explicitly; Harness bootstrap supplies manual instructions | Verified within the published Codex-only scope, reusing existing credentials |
| Claude Code | `generated/claude-code` | Host-specific Skill/MCP setup by an integration operator | Not claimed |
| WorkBuddy | `generated/workbuddy` | Expert bundle setup is separate from Harness's WorkBuddy-only installer | Not claimed |
| Generic Agent | `generated/generic-agent` | Integration author implements and qualifies the declared capabilities | Not claimed |
| Generic MCP | `generated/generic-mcp` | Integration author binds MCP guidance and required Host capabilities | Not claimed |

OpenCode's external execution adapter is a separate Runtime role; it is not a sixth packaged Expert Host bundle. All five bundles require structured results, MCP, human-decision presentation, Runtime-state resume and Host-native secure input. `doctor` verifies those declarations, not their live implementation. Native credential entry/submission/cancellation were excluded from the current release acceptance. A fresh installation must have an appropriate setup integration or administrator-provisioned Runtime configuration; do not infer secure-input support from this table. See [Host integration limits](expert-host-integration.md).

## Verify and continue

Follow [Your first task](first-task.md). Success means the Host uses the installed Skill, receives Runtime-owned setup/readiness responses, and reports the exact state and next action. It does not register a project, call a model, execute source changes, or claim a completed Goal.
