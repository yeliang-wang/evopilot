# EvoPilot CLI

> Command-line access to an EvoPilot control-plane server for operators, CI jobs, release scripts, and AI agents.

The EvoPilot CLI is an HTTP client. It can run on macOS, Windows, Linux, WorkBuddy, Codex, Claude Code, or any environment that can execute Node.js commands and reach the EvoPilot server URL.

The CLI does not start EvoPilot locally and does not bypass server governance. RBAC, tenant/workspace scope, approvals, source-closure preflight, project DevOps, deployment gates, audit records, and release decisions are enforced by the EvoPilot server.

## AI Agent Entry

If you are WorkBuddy, Codex, Claude Code, CI, or another AI agent, read these first:

1. [AGENTS.md](AGENTS.md) - non-negotiable rules and stop conditions.
2. [quickstart.md](quickstart.md) - shortest safe command flow.
3. [automation.md](automation.md) - JSON fields, parse order, and report format.
4. [workflows.md](workflows.md) - scenario workflows.
5. [commands.md](commands.md) - full command reference.

For production incident handling and full end-to-end operating steps, read [AI Agent Runbook](../guides/ai-agent-runbook.md).

## Install

Production installation uses the published CLI package:

```bash
npm install -g @evopilot/cli
evopilot --version
```

From this repository, use the same CLI package without publishing:

```bash
npm install
npm run cli:build
npm run cli -- --version
```

The package requires Node.js 22 or later.

## Connect

Configure the target EvoPilot server and scope:

```bash
export EVOPILOT_SERVER="https://evopilot.example.com"
export EVOPILOT_API_TOKEN="<operator-or-admin-token>"
export EVOPILOT_TENANT="tenant-production"
export EVOPILOT_WORKSPACE="workspace-agent-products"
export EVOPILOT_ACTOR="workbuddy"
export EVOPILOT_CLI_CLIENT="workbuddy"
```

`EVOPILOT_BASE_URL` is also accepted as a server URL fallback. Command-line flags override environment variables and saved config:

```bash
evopilot --server "$EVOPILOT_SERVER" --token "$EVOPILOT_API_TOKEN" status --json
```

For username/password login:

```bash
evopilot auth login \
  --server "$EVOPILOT_SERVER" \
  --username "<user>" \
  --password "<password>"
```

The default saved config path is:

```text
~/.evopilot/config.json
```

Use `--config <file>` or `EVOPILOT_CONFIG` for short-lived agent sessions.

## Verify

Always verify the session before changing product state:

```bash
evopilot config show --json
evopilot status --json
```

Expected result:

- `status` is `READY`.
- `health.status` is `UP`.
- `ready.status` is `READY`.
- `api.schema` is `evopilot-version/v1`.
- `api.apiContractVersion` is `v1`.
- `summary` is present when the token is valid for the requested tenant/workspace.
- `llmUsage.summary.provider` and `llmUsage.summary.model` identify the LLM visible to the CLI.
- `llmUsage.summary.totalTokens`, `inputTokens`, `outputTokens`, and `creditsConsumed` show token usage.
- Exit code is `0`.

If `summary` is missing, the CLI reached public health endpoints but not an authenticated control-plane session. If the API Server cannot be reached, `status --json` still prints schema `evopilot-cli-status/v1` with `status=UNREACHABLE`, `stage`, `server`, `config`, `missingConfig`, `diagnosis.recommendedAction`, and `error.message`, then exits `2`. WorkBuddy should show that diagnostic to the operator and stop before project, target, source writeback, audit, or release commands.

## AI Agent Contract

WorkBuddy, Codex, Claude Code, CI jobs, and other agents should start with [AGENTS.md](AGENTS.md) and [quickstart.md](quickstart.md), then use this file as the complete CLI guide. The safe execution contract is:

1. Configure `EVOPILOT_SERVER`, `EVOPILOT_API_TOKEN`, `EVOPILOT_TENANT`, `EVOPILOT_WORKSPACE`, `EVOPILOT_ACTOR`, and `EVOPILOT_CLI_CLIENT`.
2. Run `evopilot status --json`.
3. When troubleshooting or preparing unattended automation, run `evopilot logging inspect --json`; an administrator may temporarily use `evopilot logging set --level debug --json` and then restore `info`.
4. For a new project, run `evopilot project onboard plan ... --json` before mutating state.
5. Store or repair server-side `tokenRef` values when the checklist asks for it.
6. Verify with `project preflight`, `project devops preflight`, and `project onboard verify`.
7. For GitHub/GitLab enterprise real loops, or whenever the project needs a non-default model, store the LLM key server-side, create an LLM profile, bind it to the project, and run `project llm preflight`.
8. Generate the project `ProjectHarnessProfile` DRAFT with `harness profile generate`, show it to the user, optionally validate/diff/apply edits, and activate only after confirmation.
9. Generate the Goal phase plan with `target plan`.
10. Show `plan.projectHarness` or `phasePlan.projectHarness`, `phasePlan.phases[]`, `phasePlan.targets[]`, and `editablePlan` to the user or operator; then export, review, optionally edit, diff, apply, and approve the Alpha -> Beta -> RC -> GA phase plan only after confirmation.
11. Run `target run`, `goal run`, or `loop run` with `--json`.
12. Stop on blockers, human gates, credential gaps, policy review, repair actions, `NO-GO`, `BLOCKED`, `FAILED`, timeouts, or max-step boundaries.
13. For troubleshooting, run `evopilot audit list --limit 50 --json`; the limit is applied by the server and returns newest records first.
14. Report the server-derived result, active harness profile version/digest, release verdict, IDs, LLM provider/model, token totals, and request IDs.

An agent must not parse human-readable output when `--json` is available, must not pass raw GitHub/GitLab tokens in daily wrapper commands, must not activate a `ProjectHarnessProfile` before showing it to the user or project owner, must not approve a phase plan before showing it to the user or project owner, and must not claim a stronger DevOps or release result than the server-returned `claimBoundary` and release decision.

Template harness maintenance is an administrator workflow, not a daily project execution step. Fresh installs include `python-enterprise-harness`, `java-ddd-service-harness`, `node-saas-control-plane-harness`, `go-middleware-harness`, `observability-apm-harness`, and `generic-management-software-harness`. Project onboarding automatically matches a published template from project context and the goal loop target; `--from-template` is only an explicit administrator or advanced override. Current built-ins are `@1.1.0` enterprise harness baselines with structured logs, exception tracking, trace correlation, SLO monitoring, alert routing, operational runbooks, language-specific diagnostics, and release evidence rules. Use `harness template inspect <id> --json` to read a template's `sourceReferences[]`, capabilities, runtime defaults, validation baseline, evidence contract, failure taxonomy, diagnostics, observability, governance, phase mapping, and changelog. Use `harness template upgrade --file <template.yaml> --changelog <text> --json` to publish a new template id or version. Reusing the same `id@version` requires `--force`; existing active project profiles keep their templateRef until a reviewed profile revision is generated or upgraded and activated.

When a command returns an error or blocker, use the response `requestId` to query structured logs. Harness events such as `harness-template.apply.rejected`, `project-harness-profile.validation.failed`, `project-harness-profile.generated`, `project-harness-profile.activated`, `goal-plan.project-harness-bound`, and `goal-plan.project-harness-missing` carry template/profile digest metadata and `diagnosis.recommendedAction`.

`--until` is only a wrapper stop policy. It is not a phase confirmation switch. All wrapper commands default to `--until terminal`; use `--until blocked-or-complete` only when the caller intentionally wants a narrower stop boundary, most commonly to stop a low-level `loop run` as soon as the LoopRun becomes `BLOCKED`.

## LLM And Token Visibility

Every wrapper command must expose LLM usage to both humans and AI agents. Use `--client workbuddy` or `EVOPILOT_CLI_CLIENT=workbuddy` when the command is invoked from WorkBuddy; macOS terminal sessions are labeled `mac-terminal` automatically when TTY detection is available.

For JSON output, agents must read:

```text
llmUsage.client.surface
llmUsage.summary.provider
llmUsage.summary.model
llmUsage.summary.totalTokens
llmUsage.summary.inputTokens
llmUsage.summary.outputTokens
llmUsage.summary.creditsConsumed
plan.projectHarness.profileId or phasePlan.projectHarness.profileId
plan.projectHarness.version or phasePlan.projectHarness.version
plan.projectHarness.compiledDigest or phasePlan.projectHarness.compiledDigest
llmUsage.process.responses[]
llmUsage.server.steps[]
```

`llmUsage.summary` is the command-level total. `llmUsage.process.responses[]` is the CLI-observed HTTP chain with `requestId` values. `llmUsage.server.steps[]` is the server-side Loop executor step list, including `loopId`, `iteration`, `nodeId`, `provider`, `model`, `inputTokens`, `outputTokens`, `totalTokens`, and `llmRequestId`.

Human-readable `target run`, `goal run`, `loop run`, and `project onboard` output includes an `LLM Usage` section plus inline token counts in recent `Steps`. Server HTTP logs include the same client surface and request-level LLM token delta under `metadata.client` and `metadata.llmUsage`.

Production metrics are enabled by default. When the API server has `EVOPILOT_DATA_ROOT`, LLM metrics are written to `EVOPILOT_DATA_ROOT/llm-metrics.jsonl` unless `EVOPILOT_LLM_METRICS_PATH` overrides it. Token counts are observability data and remain visible in logs; API tokens, GitHub/GitLab tokens, passwords, API keys, and credential refs remain redacted.

## Custom LLM Profiles

EvoPilot no longer assumes every project must use the server's global default LLM. A tenant/workspace can register public or private OpenAI-compatible models as server-side LLM profiles, bind one profile as a project default, and optionally override it for a single Goal/Loop run.

For GitHub/GitLab enterprise real loops, an explicit READY project default LLM profile or per-run `--llm-profile` is required. The server global default LLM is allowed for local/debug validation, but the server global default LLM is not sufficient for a real remote project because the run must be attributable to the user, tenant, workspace, and project.

The raw LLM API key must be stored on the EvoPilot server or in the tenant/workspace secret vault. Daily wrapper commands pass only `--llm-profile <id>`.

One-time setup from a trusted shell:

```bash
export LLM_API_KEY_MY_AGENT="<real-llm-api-key>"

evopilot secret set \
  --id LLM_API_KEY_MY_AGENT \
  --kind llm-key \
  --from-env LLM_API_KEY_MY_AGENT \
  --json

evopilot llm profile set my-agent-llm \
  --provider openai-compatible \
  --base-url https://llm.example.com/v1 \
  --model qwen2.5-coder-32b \
  --api-key-ref LLM_API_KEY_MY_AGENT \
  --json

evopilot llm profile preflight my-agent-llm --json
```

Bind the project default:

```bash
evopilot project llm set my-agent \
  --profile my-agent-llm \
  --require-llm-ready \
  --json

evopilot project llm inspect my-agent --json
evopilot project llm preflight my-agent --json
```

After the Alpha/Beta/RC/GA phase plan has been reviewed and approved, run with the project default LLM:

```bash
evopilot target run \
  --project my-agent \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and repair guidance for My Agent" \
  --max-steps 20 \
  --json
```

After the Alpha/Beta/RC/GA phase plan has been reviewed and approved, override the LLM for one run:

```bash
evopilot target run \
  --project my-agent \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and repair guidance with a private model" \
  --llm-profile my-agent-llm \
  --json
```

Resolution order is:

```text
run override --llm-profile -> project default LLM binding -> server global default LLM
```

`target run`, `goal run`, and `loop run` preflight the selected LLM by default. If the profile secret cannot be resolved or the provider probe fails, the CLI stops before Loop execution and reports `nextAction=store-llm-secret`, `configure-llm-profile`, or `repair-llm-provider`. `--require-llm-ready` remains useful in setup commands to make the readiness assertion explicit.

## Wrapper JSON Contract

Wrapper commands return a stable machine-readable envelope:

| Command | Schema | Use |
|---|---|---|
| `target run` | `evopilot-cli-goal-run/v1` | One-command release target execution. |
| `goal run` | `evopilot-cli-goal-run/v1` | Create, resume, or advance a GlobalGoal. |
| `loop run` | `evopilot-cli-loop-run/v1` | Run or resume one LoopRun. |
| `project onboard ...` | `evopilot-cli-project-onboard/v1` | Register a new project, preflight it, and configure native DevOps. It does not start Goal/Loop execution. |
| `project onboard plan` / `verify` | `evopilot-project-onboarding-checklist/v1` | Non-mutating or persisted project readiness checklist. |

Agents should read these paths before claiming success:

```text
schema
command
result.exitCode
result.status
result.nextAction
status.status
status.nextAction
status.chain
status.blockers
status.releaseDecision
status.targetPackages[]
status.phasePackages[]
steps[].requestId
steps[].llmUsage
llmUsage.summary.provider
llmUsage.summary.model
llmUsage.summary.inputTokens
llmUsage.summary.outputTokens
llmUsage.summary.totalTokens
llmUsage.summary.creditsConsumed
llmUsage.process.responses[].requestId
llmUsage.process.cumulative
llmUsage.server.steps[]
```

Use `requestId`, `goalId`, `loopId`, `releaseRunId`, and `releaseDecisionId` to line up CLI output with Dashboard state and production logs.

## Command Layers

| Layer | Commands | When To Use |
|---|---|---|
| Wrapper | `project onboard`, `target run`, `goal run`, `loop run` | WorkBuddy, CI, and operators need one command that advances until terminal, blocked, timeout, or max-step boundary. |
| Planning | `maturity standards list`, `maturity standards inspect`, `target plan`, `target plan export`, `target plan diff`, `target plan apply`, `target plan approve`, `goal phases`, `goal phase-package`, `goal target-package` | A user or AI agent needs to review or adjust the generated Alpha/Beta/RC/GA plan before execution and inspect target/phase package evidence. |
| Atomic | `project preflight`, `project devops preflight`, `goal plan`, `goal approve-plan`, `goal advance`, `source-closure preflight`, `release decisions`, `audit list`, `trace tree` | A wrapper stopped, an agent needs white-box inspection, or a human must approve a governed action. |

Wrappers compose atomic operations but remain server-governed. They do not approve human gates, bypass source credential preflight, bypass DevOps ownership, or fabricate release decisions.

## Maturity Ladder

The CLI does not ask users to choose a terminal maturity. `--objective` is a business outcome, for example "Enable tenant onboarding and lifecycle workflow visibility." EvoPilot treats GA as the governed terminal maturity and decomposes the objective through the fixed ladder:

```text
Alpha -> Beta -> RC -> GA
```

Each phase has a versioned server standard under `evopilot-default/v1`:

| Phase | Standard Focus |
|---|---|
| Alpha | Source readability, bootstrap/smoke path, architecture map, risk register, no release claim. |
| Beta | Passed Alpha package, core E2E evidence, repository-native CI, critical tests, basic docs, limited-trial risk closure. |
| RC | Passed Beta package, scope freeze, source closure, repeated native CI/CD, deploy health, rollback/repair, security and architecture review. |
| GA | Passed RC package, stability/soak, observability, runbook, release notes, user docs, security governance, architecture signoff, final `ReleaseDecision=GO`. |

The built-in standard set is versioned in `standards/maturity/evopilot-default/v1/`. Later versions can add or strengthen standards without changing the CLI contract. Users may add project-specific GoalTargets, required evidence, or review requirements, but they cannot delete Alpha/Beta/RC/GA or remove baseline criteria and still claim standard GA.

Inspect the active standards:

```bash
evopilot maturity standards list --json
evopilot maturity standards inspect ga --json
```

Each generated GoalTarget is constrained by the active standard's `plannerInstructions`, `targetSchema`, and `packageContract`. A GoalTarget is not `DONE` just because its LoopRun is `SUCCEEDED`; EvoPilot requires a `TargetEvidencePackage` with `status=GO`, and each phase requires a `PhasePackage` with a GO decision before the next phase can be considered passed.

## Fast Path

For an already registered project, generate the server-owned Alpha/Beta/RC/GA plan first:

```bash
evopilot target plan \
  --project <project-id> \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for this project" \
  --llm-profile <llm-profile-id> \
  --client workbuddy \
  --json
```

The plan command creates or reuses a project release target and GlobalGoal, then returns `evopilot-cli-target-plan/v1` with `terminalMaturity=ga`, `phasePlan.phases[]`, `phasePlan.targets[]`, and `editablePlan`.

Review and approve the generated Alpha -> Beta -> RC -> GA plan:

For WorkBuddy, Codex, Claude Code, or any digital-human workflow, pause here and present the generated phase plan to the user or project owner. Do not approve the plan until the user confirms it.

```bash
evopilot target plan export <goal-id> --format json > /tmp/evopilot-phase-plan.json
evopilot target plan diff <goal-id> --file /tmp/evopilot-phase-plan.json --json
evopilot target plan apply <goal-id> --file /tmp/evopilot-phase-plan.json --json
# STOP: show the phase plan to the user or project owner; continue only after explicit confirmation.
evopilot target plan approve <goal-id> \
  --confirmed-by "project-owner" \
  --confirmation "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan" \
  --json
```

The `--confirmed-by` and `--confirmation` values must come from a real user or project-owner confirmation after reviewing the displayed phase plan. WorkBuddy or another AI Agent must not fabricate these values or run approval as an automatic script step.

Then resume the wrapper:

```bash
evopilot target run \
  --project <project-id> \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for this project" \
  --max-steps 20 \
  --llm-profile <llm-profile-id> \
  --client workbuddy \
  --json
```

Before Goal/Loop execution, `target run`, `goal run`, and `loop run` check source writeback, repository-native DevOps for GitHub/GitLab projects, and selected LLM readiness by default. If the plan is not approved, `target run` stops at `PENDING_PLAN_APPROVAL` with `nextAction=approve-plan` and exit code `2`. The console prints a server-governed chain covering project, release target, GlobalGoal, Alpha/Beta/RC/GA phases, GoalTarget, LoopRun, source closure, deploy, release decision, evidence links, blockers, next action, LLM provider/model, command-level token totals, and step-level token usage.

Inspect package gates while the wrapper runs:

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase alpha --json
```

WorkBuddy should report `TargetEvidencePackage.status`, `PhasePackage.decision.status`, `blockers`, `loop.status`, source closure gate evidence, and `llmUsage` before saying a target or phase passed.

## First Project Checklist

For a new project, start with a non-mutating onboarding checklist. This is the recommended entrypoint for WorkBuddy, Codex, Claude Code, and CI agents because it returns `schema`, `status`, `nextAction`, `missingInputs`, `blockers`, and suggested commands before anything is registered:

Declare the DevOps execution boundary whenever the checklist or wrapper configures GitHub Actions or GitLab CI:

- `--execution-mode owned-repository`: EvoPilot writes to and runs CI/CD in the same repository.
- `--execution-mode read-only-public`: EvoPilot can inspect a public upstream, but it must not claim PR, merge, CI/CD, or release readiness.
- `--execution-mode fork-validated-pr`: EvoPilot writes to a fork or working repository, runs CI/CD there, and can only claim fork CI plus an upstream PR.
- `--execution-mode upstream-authorized`: EvoPilot uses maintainer credentials against the upstream repository and can claim upstream release readiness after preflight.

`--devops-owner` is the GitHub owner or GitLab namespace whose account runs the project DevOps. For open-source upstream work, set `--upstream-repo` to the public project and `--working-repo` to the writable fork.

Full writeback, PR/MR, CI/CD, merge, deploy, or release readiness requires a GitHub/GitLab execution principal owned by the operator, user, or organization. For a third-party open-source upstream, the operator must either fork the upstream into a writable account/organization and use `fork-validated-pr`, or provide maintainer-authorized credentials and use `upstream-authorized`. If no GitHub/GitLab account or group exists, use `read-only-public`; EvoPilot will not provide a default platform account or built-in generic DevOps runner.

```bash
evopilot project onboard plan github \
  --repo <owner>/<repo> \
  --id <project-id> \
  --branch main \
  --token-ref GITHUB_TOKEN_<PROJECT> \
  --execution-mode owned-repository \
  --devops-owner <owner> \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --ci-required-check test \
  --cd-workflow deploy-prod.yml \
  --deploy-environment production \
  --health-url https://<app>/health \
  --llm-profile <llm-profile-id> \
  --require-llm-ready \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for <project-id>" \
  --json
```

If `nextAction` is `store-secret`, `connect-github-account`, or `connect-gitlab-account`, store the token once on the EvoPilot server or in the current tenant/workspace secret vault after the correct GitHub/GitLab account, organization, group, service account, deploy token, or GitHub App principal exists:

```bash
evopilot secret set \
  --id GITHUB_TOKEN_<PROJECT> \
  --kind source-token \
  --from-env GITHUB_TOKEN_<PROJECT> \
  --json
```

After registration, verify the same checklist against persisted project state:

```bash
evopilot project onboard verify <project-id> --json
```

For a new GitHub project, onboard the project, bind server-side source credentials, configure GitHub Actions, and preflight both boundaries:

```bash
evopilot project onboard github \
  --repo <owner>/<repo> \
  --id <project-id> \
  --branch main \
  --token-ref GITHUB_TOKEN_<PROJECT> \
  --execution-mode owned-repository \
  --devops-owner <owner> \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --ci-required-check test \
  --cd-workflow deploy-prod.yml \
  --deploy-environment production \
  --health-url https://<app>/health \
  --llm-profile <llm-profile-id> \
  --json
```

After `project onboard verify` returns `READY_TO_RUN`, the checklist returns `nextAction=plan-target`. Generate or inspect the project harness profile first, activate only after user review, then use `target plan`, show the harness binding and Alpha/Beta/RC/GA plan to the user or project owner, approve only after explicit confirmation, and then run `target run`.

For a public upstream with a writable fork:

Precondition: create or use the operator-owned GitHub/GitLab account or organization first, fork the upstream into `--working-repo`, and make sure the `--token-ref` resolves to that principal on the EvoPilot server.

```bash
evopilot project onboard github \
  --repo apache/skywalking \
  --upstream-repo apache/skywalking \
  --working-repo my-org/skywalking-fork \
  --id skywalking-fork \
  --branch main \
  --token-ref GITHUB_TOKEN_SKYWALKING_FORK \
  --execution-mode fork-validated-pr \
  --devops-owner my-org \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --llm-profile <llm-profile-id> \
  --json
```

The JSON and human-readable output include `executionMode`, `repositoryOwner`, `devopsOwner`, `workflowRepository`, `credentialRef`, and `claimBoundary`. Agents must not claim more than the returned `claimBoundary`.

## Documentation

- [Agent Instructions](AGENTS.md) - WorkBuddy and AI-agent entry point.
- [Quickstart](quickstart.md) - shortest safe command flow.
- [Workflows](workflows.md) - one-command and end-to-end scenarios.
- [Commands](commands.md) - command groups and syntax.
- [Automation](automation.md) - WorkBuddy, Codex, Claude Code, and CI rules.
- [AI Agent Runbook](../guides/ai-agent-runbook.md) - production operating runbook for external agents.
