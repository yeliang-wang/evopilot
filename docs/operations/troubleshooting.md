# Troubleshooting

> Diagnose the failing layer before changing configuration. Start here after the [first-task check](../guides/first-task.md).

## Agent Host, MCP And Runtime

| Symptom | Check | Next action |
| --- | --- | --- |
| Expert commands are installed but the Host does not use the Expert | Is the generated Host adapter loaded in this session? | Follow [Host activation](../guides/agent-host-installation.md). Installing the npm CLI alone does not activate a Skill. Refresh the Host session after a configuration change. |
| The Host has no `evopilot` tools | Inspect its MCP server status and the exact executable, arguments and environment. | Use absolute installed paths. The Host launches `evopilot-mcp` through stdio; a local Runtime HTTP URL is not a stdio executable. Keep protocol stdout free of launcher logs. |
| MCP starts, but a tool reports connection refused | Is the separate EvoPilot Runtime listening at the configured server address? | Inspect the existing process/service owner and `EVOPILOT_SERVER`. Start or repair that service using its installation instructions; do not start another Runtime over the same data. |
| CLI works but Host tools fail authentication or scope checks | The CLI and Host may have different private configuration. | Compare server and tenant/workspace selection without printing credentials. The stock MCP entry reads its documented environment; it does not automatically inherit the CLI config file. Reuse a configured Host launcher or secret environment. |
| `evopilot-expert doctor` says `READY`, but Runtime work is blocked | Doctor checks the declared adapter contract, not a live Runtime or Host. | Ask Expert for actual setup protocol and Runtime readiness over MCP. Keep package compatibility and live readiness results separate. |
| Runtime returns `SETUP_REQUIRED` or `LLM_BLOCKED` | Read the current readiness reason and exact Profile/SecretRef binding. | Follow [LLM setup and repair](../guides/first-run-llm-readiness.md). Reuse valid configuration. A Host conversational model is not Runtime's workspace Profile. |
| An unchanged approved Profile has an old successful preflight | Check Runtime version and whether Profile, SecretRef and binding are unchanged. | Runtime 6.3.2 does not block merely because that evidence aged. Initial/replacement bindings still need fresh preflight; actual failed proof or configuration drift requires explicit repair. |
| Harness tools connect but no domain Bundle is available | A new Harness workspace is intentionally neutral. | Supply project knowledge in the independent Harness product. Consume a published Registry/Catalog and eligible immutable Bundle; never substitute an empty workspace or a test fixture for domain evidence. |
| Tools are visible but project execution or collection is unavailable | Inspect project-scoped semantic execution capabilities, executor qualification and collector configuration. | Follow [external execution prerequisites](../guides/agent-runtime.md). The stock Runtime has neither a semantic executor nor a business collector; installing MCP does not create them. |
| Another Host has a generated adapter but lacks an installation or acceptance result | Separate adapter generation, Host installation and live qualification. | Use the [support matrix](../guides/agent-host-installation.md#host-support-matrix). Do not infer WorkBuddy or other Host acceptance from Codex evidence. |

For administrator diagnosis with the existing private CLI connection:

```bash
evopilot status --json
evopilot runtime readiness --json
evopilot logging inspect --json
evopilot audit list --limit 50 --json
```

Retain `requestId`, correlation fields, the failing operation and current
`nextAction`. Share redacted diagnostics, not tokens, passwords, raw configuration
or provider keys. A stock package has no universal cross-product `doctor` that
proves Host installation, model access, executor qualification and business acceptance.

## Interrupted Or Uncertain Work

After a timeout, disconnect or process restart, read the same run and its exact
pending request or retained receipt before taking another action. An unknown
write outcome does not authorize redispatch. For semantic execution, use the
matching `inspect`, `stageReceipt`, `completionReceipt`, `phaseReceipt` or
`goalReceipt` read documented in the [command reference](../cli/commands.md#project-semantic-execution-630-source-development).
Do not clear claims, generate a new idempotency key, or repeat a write merely to
obtain a response. Once the actual state is known, follow Runtime's scoped next
action. A business-validation result and a Harness-validation result are separate;
`DUAL_VALIDATED_NOT_COMPLETED` is not a completed Goal or a release decision.

## API

| Symptom | Likely Cause | Action |
|---|---|---|
| `401` | Missing or invalid token | Check `Authorization: Bearer <token>` and configured users/tokens. |
| `403` | Role or tenant/workspace scope mismatch | Check role, tenant, workspace, and actor headers. |
| `409` | Business guardrail blocked the action | Read the response body, blockers, `nextAction`, and audit trail. |
| `releaseDecision` is missing | Release evidence has not been submitted | Use release evidence APIs or CLI release commands. |

## CLI

| Symptom | Meaning | Action |
|---|---|---|
| `target run` exits `2` | Goal did not reach terminal completion | Inspect JSON `result`, `steps`, `nextAction`, and `status.blockers`. |
| `project onboard` stops at `connect-github-account` or `connect-gitlab-account` | Writable GitHub/GitLab writeback or project DevOps has no resolvable operator-owned execution principal | Connect or create the account/org/group/service principal, fork or authorize the repository when needed, store the server-side tokenRef, then rerun `project onboard plan` and `project preflight`. |
| `project preflight` returns `READ_ONLY` | Public repository can be inspected but cannot be written | Continue only for `read-only-public` analysis; do not claim PR, CI/CD, merge, deploy, or release readiness. |
| CLI exits with `DevOps ownership is ambiguous` | A GitHub/GitLab DevOps command did not declare who owns CI/CD execution | Add `--execution-mode` and `--devops-owner`; for open-source upstream work also add `--upstream-repo` and `--working-repo`. |
| `project devops preflight` blocks on `devops-owner` | The declared DevOps owner does not match the workflow repository namespace | Inspect `executionMode`, `devopsOwner`, `workflowRepository`, and `claimBoundary`; repair the project DevOps config before running a target wrapper. |
| `status --json` returns `status=UNREACHABLE` | The CLI cannot connect to the configured EvoPilot API Server | Read `server`, `config.path`, `missingConfig`, `diagnosis.recommendedAction`, and `error.message`; repair `EVOPILOT_SERVER`, network/proxy/DNS, server process, or auth config before continuing. |
| `status --json` has no `api` object | The CLI reached a server that does not expose `/api/v1/version` | Verify the deployed EvoPilot version before running wrapper commands. |
| `audit list --limit <n> --json` is needed for WorkBuddy troubleshooting | Production audit logs can be large | Use `--limit 50` or another positive limit; EvoPilot applies the limit on the server and returns newest records first. |
| `llmUsage.summary.provider` or `llmUsage.summary.model` is missing after a wrapper run | No LLM step ran, or the server did not return loop-level usage evidence | Inspect `llmUsage.server.steps[]`, `llmUsage.process.responses[]`, and server logs by `requestId` before claiming completion. |
| WorkBuddy runs are not distinguishable from terminal runs in logs | The CLI caller did not set a client surface | Set `EVOPILOT_CLI_CLIENT=workbuddy` or pass `--client workbuddy`; then check HTTP logs under `metadata.client.surface`. |
| `goal run` stops at `human-approval` | Server governance requires manual approval | Review evidence and rerun with approved recovery path. |
| `loop run` stops at `policy-review` | Release/source policy blocked automation | Inspect source closure and release run policy blockers. |
| `--timeout` reached | Wrapper stop boundary was reached; the last effect may need reconciliation | Inspect the existing run, exact request and receipts first. Continue only from confirmed state; a longer timeout is not permission to replay an uncertain mutation. |

## Dashboard

Dashboard 页面级操作和数字人排障入口在 `yeliang-wang/evopilot-dashboard/docs/operations/troubleshooting.md`。本节只覆盖 EvoPilot API 与 Dashboard 集成边界。

| Symptom | Likely Cause | Action |
|---|---|---|
| Dashboard loads but API data is empty | API base URL or proxy is wrong | Check `public/config.js`, Vite proxy, or Nginx `/api` proxy. |
| Login succeeds locally but fails in production | Token/user config differs | Check production `EVOPILOT_USERS` and `EVOPILOT_TOKENS`. |
| Workflow graph shows pending release | No authoritative release decision exists | Read `/api/v1/release/decisions`. |
| Custom Dashboard disagrees with CLI | UI is deriving state client-side | Use `run-status`, `snapshot`, `graph`, and release decisions from the API. |

## Validation Commands

```bash
npm run check
node -e 'JSON.parse(require("fs").readFileSync("docs/api/openapi.json", "utf8")); console.log("openapi ok")'
npm run cli -- status --json
# If nextAction=approve-plan, stop and show the phase plan to the user or project owner before approval.
npm run cli -- target run --project <project-id> --objective "..." --client workbuddy --max-steps 1 --json
```
