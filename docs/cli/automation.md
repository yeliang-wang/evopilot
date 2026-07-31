# EvoPilot CLI Automation

> Operating contract for WorkBuddy, Codex, Claude Code, CI jobs, and release automation.

Automation should treat EvoPilot as the system of record. The CLI submits server-governed requests and prints server state. It must not invent release conclusions, bypass approval gates, or treat local machine state as production state.

## Required Environment

```bash
export EVOPILOT_SERVER="https://evopilot.example.com"
export EVOPILOT_API_TOKEN="<operator-or-admin-token>"
export EVOPILOT_TENANT="tenant-production"
export EVOPILOT_WORKSPACE="workspace-agent-products"
export EVOPILOT_ACTOR="workbuddy"
export EVOPILOT_CLI_CLIENT="workbuddy"
export EVOPILOT_CONFIG="$PWD/.evopilot-agent-config.json"
```

Use a job-local `EVOPILOT_CONFIG` when an agent should not write to `~/.evopilot/config.json`.

## Machine Output

Automation must use `--json` and parse JSON fields:

```bash
evopilot status --json
evopilot llm profile preflight my-agent-llm --json
evopilot project onboard plan github --repo owner/my-agent --id my-agent --token-ref GITHUB_TOKEN_MY_AGENT --execution-mode owned-repository --devops-owner owner --ci-workflow ci.yml --ci-required-check build --cd-workflow deploy-prod.yml --deploy-environment production --health-url https://my-agent.example.com/health --llm-profile my-agent-llm --json
evopilot project onboard github --repo owner/my-agent --id my-agent --token-ref GITHUB_TOKEN_MY_AGENT --execution-mode owned-repository --devops-owner owner --ci-workflow ci.yml --ci-required-check build --cd-workflow deploy-prod.yml --deploy-environment production --health-url https://my-agent.example.com/health --llm-profile my-agent-llm --client workbuddy --json
evopilot project llm preflight my-agent --json
evopilot harness profile generate --project my-agent --goal-loop-target "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --json
evopilot harness profile inspect default --project my-agent --version <harness-version> --json
evopilot harness profile diff default --project my-agent --version <harness-version> --json
# STOP: show the ProjectHarnessProfile DRAFT to the user or project owner; continue only after explicit confirmation.
evopilot harness profile activate default --project my-agent --version <harness-version> --json
evopilot target plan --project my-agent --objective "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --client workbuddy --json
evopilot target plan export <goal-id> --format json > /tmp/my-agent-phase-plan.json
evopilot target plan diff <goal-id> --file /tmp/my-agent-phase-plan.json --json
# STOP: show the phase plan to the user or project owner; continue only after explicit confirmation.
evopilot target plan approve <goal-id> \
  --confirmed-by "project-owner" \
  --confirmation "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan" \
  --json
evopilot target run --project my-agent --objective "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --client workbuddy --json
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase alpha --json
```

Do not parse human-readable CLI output. Human output may change to improve operator readability.
If `evopilot status --json` returns `status=UNREACHABLE`, automation must report `diagnosis.recommendedAction`, `server`, `config.path`, `missingConfig`, and `error.message`, then stop. Do not continue to project registration, Goal/Loop execution, source writeback, audit, or release commands until the API Server connection is repaired.
When humans do read the console output, wrapper commands print the same core chain that Dashboard consumes: scope, project, release target, goal, workflow nodes, next action, evidence endpoints, recent steps, blockers, and `requestId` values for log lookup.

When WorkBuddy is simulating a human operator, it must pause after `target plan`, show `phasePlan.phases[]`, `phasePlan.targets[]`, and `editablePlan`, and wait for user confirmation before `target plan approve`. The required `--confirmed-by` and `--confirmation` values must reflect the real confirmation; automation must not invent them.

WorkBuddy must also pause after `harness profile generate`. It must show `profile.sourceContent`, `compiledContent`, `validation`, `diffFromActive`, `generatedBy`, `sourceDigest`, and `compiledDigest`, and it must wait for user confirmation before `harness profile activate`. If the user edits the profile, automation must run `harness profile validate`, `harness profile diff`, and `harness profile apply` before activation.

## Required Parse Order

For every `--json` command, automation should parse in this order:

1. `schema`
2. `result.exitCode` or process exit code
3. `status`, `result.status`, and `result.nextAction`
4. `diagnosis.code`, `diagnosis.recommendedAction`, and `error.message`
5. `status.blockers`, `blockers`, and `missingInputs`
6. IDs: `projectId`, `releaseTargetId`, `goalId`, `activeTargetId`, `loopId`, `releaseRunId`, `releaseDecisionId`, `requestId`
7. Execution boundary: `executionMode`, `devopsOwner`, `workflowRepository`, `credentialRef`, `credentialPrincipal`, `claimBoundary`
8. LLM boundary: `llm.profileId`, `llm.source`, `llm.provider`, `llm.model`, project LLM readiness, and run override `--llm-profile`
9. Project harness profile: `profile.status`, `profile.version`, `profile.sourceContent`, `profile.compiledContent`, `profile.validation`, `profile.diffFromActive`, `profile.generatedBy`, `profile.sourceDigest`, `profile.compiledDigest`, `summary.activeVersion`, and `summary.latestVersion`
10. Goal phase plan: `plan.projectHarness`, `phasePlan.projectHarness`, `phasePlan.phases[]`, `phasePlan.targets[]`, `editablePlan`, `status.nextAction`
11. Package gates: `status.targetPackages[]`, `status.phasePackages[]`, `TargetEvidencePackage.status`, `PhasePackage.decision.status`, `blockers`, and `llmUsage`
12. Release decision fields from EvoPilot release APIs, never local inference
13. `llmUsage.summary`, `llmUsage.process.responses[]`, and `llmUsage.server.steps[]`

Do not continue just because a command printed a workflow graph. Continue only when the JSON status and `nextAction` allow it.

Automation must also parse LLM/token visibility from wrapper commands:

```text
llmUsage.client.surface
llmUsage.summary.provider
llmUsage.summary.model
llmUsage.summary.totalTokens
llmUsage.summary.inputTokens
llmUsage.summary.outputTokens
llmUsage.summary.creditsConsumed
llmUsage.process.responses[].requestId
llmUsage.server.steps[].loopId
llmUsage.server.steps[].nodeId
llmUsage.server.steps[].totalTokens
```

`llmUsage.summary` is the command-level total. `llmUsage.process.responses[]` is the CLI-observed HTTP chain. `llmUsage.server.steps[]` is the server-side Loop executor usage. If a cost-sensitive automation run cannot find `provider`, `model`, or token totals, it must treat the run as incomplete evidence and report the missing fields.

Minimum success report for a wrapper command:

```text
schema=<wrapper-schema>
exitCode=<0-or-nonzero>
status=<server-status>
nextAction=<server-next-action>
projectId=<project-id>
projectHarnessProfile=<profile-id-or-missing>
projectHarnessVersion=<version-or-missing>
projectHarnessDigest=<compiled-digest-or-missing>
goalId=<goal-id-or-empty>
loopId=<loop-id-or-empty>
releaseDecisionId=<id-or-empty>
claimBoundary=<server-claim-boundary-or-empty>
llm=<provider/model>
tokens=<input/output/total>
requestIds=<comma-separated-request-ids>
```

If any LLM-backed run has `llm=not-visible` or `tokens=0/0/0` after it has executed an LLM step, report incomplete evidence.

## LLM Profile Rules

Automation must treat LLM configuration as a server-side project boundary, not as a CLI-local environment variable. A trusted operator stores the API key once, creates a profile, then binds the project:

```bash
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

evopilot project llm set my-agent \
  --profile my-agent-llm \
  --require-llm-ready \
  --json
```

Daily wrapper commands should pass only the profile id, and should run only after the Alpha/Beta/RC/GA phase plan has been reviewed and approved:

```bash
evopilot target run \
  --project my-agent \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for My Agent" \
  --llm-profile my-agent-llm \
  --client workbuddy \
  --json
```

Resolution order:

```text
run override --llm-profile -> project default LLM -> server global default LLM
```

For GitHub/GitLab enterprise real loops, the selected profile must be explicit through a READY project default or a run-level `--llm-profile`; the server global default LLM is not sufficient for user/project attribution.

If `llm profile preflight`, `project llm preflight`, or a wrapper LLM preflight returns `BLOCKED`, stop and report `nextAction`. Typical stop actions are:

```text
store-llm-secret
configure-llm-profile
repair-llm-provider
```

Automation must not pass raw LLM API keys in `target run`, `goal run`, `loop run`, or daily `project onboard` commands. It must report the selected profile id when available and must include `llmUsage.summary.provider`, `llmUsage.summary.model`, and token totals in the final run report.

`project onboard plan` and `project onboard verify` are the onboarding control surface for automation. Both print `evopilot-project-onboarding-checklist/v1`; the checklist contains machine-readable `steps`, `missingInputs`, `blockers`, `commands`, and `nextAction`. `plan` does not mutate project state. `verify` reads persisted project state and should return `READY_TO_RUN` with `nextAction=plan-target` before an agent claims that source writeback, repository-native DevOps, and project LLM readiness are ready for harness profile generation and phase planning.

For any GitHub/GitLab DevOps flow, automation must parse and persist these fields from onboarding or `project devops preflight`:

```text
executionMode
repositoryOwner
devopsOwner
workflowRepository
credentialRef
credentialPrincipal
claimBoundary
```

Do not infer them from the repository URL. A public upstream such as `apache/skywalking` may have DevOps executed by `my-org/skywalking-fork`; the correct release claim is only what `claimBoundary` states.

## Exit Codes

Treat non-zero exit codes as stop conditions.

Typical behavior:

- `0`: command succeeded and the server accepted the operation.
- `2`: command reached a governed stop boundary, blocker, failed preflight, timeout, max-step limit, or API error.

After a non-zero exit, inspect the JSON response before retrying.

`project onboard plan` may exit non-zero when the checklist is `BLOCKED`; this is still a valid response for agents. Parse the JSON and follow `nextAction` or `commands` instead of retrying blindly.

## Idempotency

Use `--idempotency-key` for mutating commands in CI or repeated agent loops:

```bash
evopilot goal create \
  --project my-agent \
  --target my-agent-ga \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for My Agent" \
  --idempotency-key "my-agent-ga-goal-2026-07-20" \
  --json
```

Mutating wrapper commands should use stable job or task identifiers when available.

## Project Harness Profile Rules

Automation must treat `ProjectHarnessProfile` as a governed project control-plane artifact. It is generated as a DRAFT, reviewed by the user or project owner, optionally edited, then activated explicitly:

```bash
evopilot harness profile generate \
  --project my-agent \
  --goal-loop-target "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --json

evopilot harness profile inspect default --project my-agent --version <harness-version> --json
evopilot harness profile diff default --project my-agent --version <harness-version> --json
# STOP: show the ProjectHarnessProfile DRAFT to the user or project owner; continue only after explicit confirmation.
evopilot harness profile activate default --project my-agent --version <harness-version> --json
```

If the user changes the DRAFT, write the edited source profile to YAML or JSON and repeat this loop before activation:

```bash
evopilot harness profile validate --project my-agent --file /tmp/my-agent-harness-profile.yaml --json
evopilot harness profile diff default --project my-agent --file /tmp/my-agent-harness-profile.yaml --json
evopilot harness profile apply --project my-agent --file /tmp/my-agent-harness-profile.yaml --json
```

After `apply`, use the returned `profile.version` as `<harness-version>` for activation.

First onboarding uses EvoPilot's automatically matched harness template, the goal loop target, and project context. Re-onboarding or project evolution reuses the previous active profile's template unless an administrator explicitly overrides it, and also includes the previous active profile. The agent must report whether `generatedBy.evidence[]` includes `templateSelection=auto-match`, `templateSelection=previous-active-profile`, or `templateSelection=request-override`, and whether it includes `previousActiveVersion=<n>` or `previousActiveVersion=none`.

Automation may proceed to `target plan` only after `harness profile activate` returns `status=ACTIVE` and `summary.activeVersion=<harness-version>`. `target plan` or `goal plan` must then expose `plan.projectHarness` or `phasePlan.projectHarness` with the same profile id, version, and compiled digest. If the binding is missing, stop and repair the harness activation.

## Goal Plan Approval Rules

Automation must treat the generated phase plan as a governed artifact. The normal path after harness activation is:

```bash
evopilot target plan --project my-agent --objective "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --client workbuddy --json
evopilot target plan export <goal-id> --format json > /tmp/my-agent-phase-plan.json
evopilot target plan diff <goal-id> --file /tmp/my-agent-phase-plan.json --json
evopilot target plan apply <goal-id> --file /tmp/my-agent-phase-plan.json --json
# STOP: show the phase plan to the user or project owner; continue only after explicit confirmation.
evopilot target plan approve <goal-id> \
  --confirmed-by "project-owner" \
  --confirmation "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan" \
  --json
evopilot target run --project my-agent --objective "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --json
```

`target run` stops with `result.exitCode=2` and `nextAction=approve-plan` when the plan is still pending. Agents should show the phase plan to the user, not retry blindly. No wrapper command may approve the generated Alpha -> Beta -> RC -> GA plan implicitly; approval must be an explicit `target plan approve` or `goal approve-plan` action with real `--confirmed-by` and `--confirmation` values after user or project-owner confirmation.

The plan must preserve Alpha, Beta, RC, and GA. Users may add project-specific GoalTargets or strengthen phase criteria, evidence, and review requirements. Removing baseline criteria or skipping a phase is blocked by the server and must be reported as a plan validation failure.

After a target is bound or advanced, inspect package gates before claiming progress:

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase <alpha|beta|rc|ga> --json
```

Automation must not treat `LoopRun.status=SUCCEEDED` as target completion by itself. A target passes only when `TargetEvidencePackage.status=GO`; a phase passes only when its `PhasePackage.decision.status=GO`.

## Stop Conditions

If a command returns any of these `nextAction` values, the agent must stop and report the blocker:

```text
approve-plan
plan-target
connect-github-account
connect-gitlab-account
human-approval
policy-review
configure-source-credentials
configure-llm
store-llm-secret
configure-llm-profile
repair-llm-provider
repair-project
repair-deploy-target
repair
```

The agent must also stop on:

```text
NO-GO
BLOCKED
FAILED
timeout
max-steps
max-iterations
```

Do not approve human gates, merge source, or deploy production changes unless the server state and the user's instruction explicitly allow that operation.

`connect-github-account` and `connect-gitlab-account` mean the project needs a user-owned or organization-owned SCM execution principal before writeback or repository-native DevOps can run. Do not retry the same wrapper command until the operator has connected the account/group and stored the tokenRef on the EvoPilot server or tenant/workspace secret vault.

## Token Rules

Do not pass raw GitHub or GitLab tokens in daily `target run`, `goal run`, or `loop run` commands.

Preferred pattern:

1. A production operator stores the real token in the EvoPilot server runtime or secret manager.
2. The token belongs to the GitHub/GitLab account, organization, group, service account, deploy token, or GitHub App principal that owns the target DevOps boundary.
3. The project stores only `tokenRef`.
4. The agent runs `project preflight` and `project devops preflight`.
5. The agent proceeds only when readiness is `READY`.

Example:

```bash
evopilot secret set \
  --id GITHUB_TOKEN_MY_AGENT \
  --kind source-token \
  --from-env GITHUB_TOKEN_MY_AGENT \
  --json

evopilot project credentials set my-agent \
  --token-ref GITHUB_TOKEN_MY_AGENT \
  --json

evopilot project preflight my-agent --json
```

If the result is `READ_ONLY` or `BLOCKED`, stop and ask the operator to repair server-side credentials.

For new projects, an agent can use the onboarding wrapper after the tokenRef exists:

```bash
evopilot project onboard plan github \
  --repo owner/my-agent \
  --id my-agent \
  --token-ref GITHUB_TOKEN_MY_AGENT \
  --execution-mode owned-repository \
  --devops-owner owner \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --cd-workflow deploy-prod.yml \
  --deploy-environment production \
  --health-url https://my-agent.example.com/health \
  --llm-profile my-agent-llm \
  --json
```

If the checklist returns `nextAction=store-secret`, run `secret set` from a trusted environment first. If it returns `nextAction=register-project`, continue with the mutating wrapper:

```bash
evopilot project onboard github \
  --repo owner/my-agent \
  --id my-agent \
  --token-ref GITHUB_TOKEN_MY_AGENT \
  --execution-mode owned-repository \
  --devops-owner owner \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --cd-workflow deploy-prod.yml \
  --deploy-environment production \
  --health-url https://my-agent.example.com/health \
  --llm-profile my-agent-llm \
  --json
```

After `project onboard verify my-agent --json` returns `READY_TO_RUN` and `nextAction=plan-target`, generate or inspect the project harness profile first. Activate the reviewed harness profile, then generate the phase plan with `target plan`, approve it after user review, and continue with `target run`.

## Native DevOps Rules

GitHub projects use GitHub Actions. GitLab projects use GitLab CI.

EvoPilot does not provide a default shared DevOps account or generic runner for third-party repositories. For a public upstream, use the operator's fork/account for `fork-validated-pr`, use maintainer credentials for `upstream-authorized`, or stay in `read-only-public`.

DevOps configuration commands must declare ownership:

```bash
evopilot project devops set my-agent \
  --provider github-actions \
  --execution-mode owned-repository \
  --devops-owner owner \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --cd-workflow deploy-prod.yml \
  --deploy-environment production \
  --health-url https://my-agent.example.com/health \
  --json
```

The CLI intentionally rejects ambiguous DevOps setup. If an agent sees a usage error that mentions DevOps ownership, regenerate the command with `--execution-mode` and `--devops-owner`; for public upstream work also include `--upstream-repo` and `--working-repo`.

Before a release wrapper:

```bash
evopilot project devops preflight my-agent --json
```

If the result is not `READY`, repair the project DevOps configuration before any enterprise real Goal/Loop run. Wrapper commands stop before execution when source writeback, native DevOps, or LLM readiness is blocked; do not run a release wrapper in a weaker mode and then claim end-to-end release readiness.

Claim rules by execution mode:

| executionMode | Agent May Claim | Agent Must Not Claim |
|---|---|---|
| `owned-repository` | Source writeback and native CI/CD in the owned working repository after READY preflight. | Third-party upstream release authority. |
| `read-only-public` | Repository inspection, analysis, blocker discovery. | PR, merge, CI/CD readiness, deployment, or release completion. |
| `fork-validated-pr` | Fork CI plus upstream PR readiness. | Upstream merge or upstream release completion. |
| `upstream-authorized` | Upstream writeback and release readiness after READY preflight. | Any action outside the token principal's permission scope. |

## Release Verdict Rules

Only EvoPilot release decisions can produce authoritative `GO`, `CONDITIONAL-GO`, or `NO-GO` conclusions:

```bash
evopilot release current --json
evopilot release decisions --project my-agent --target my-agent-ga --json
evopilot target decision my-agent-ga --project my-agent --json
```

Do not claim GA stable from:

- local tests alone
- CI success alone
- dashboard screenshots alone
- human-readable CLI text alone

## IDs To Record

Keep these IDs from JSON output when present:

```text
projectId
releaseTargetId
goalId
goalTargetId
loopId
sourceReleaseRunId
pipelineRunId
releaseDecisionId
auditId
requestId
```

These IDs are required for incident reports, release reviews, and replay.

## Incident Pack

When reporting a failed automation run, include:

- full CLI JSON output
- command line with secrets redacted
- exit code
- `EVOPILOT_SERVER`
- tenant/workspace/actor
- project and target IDs
- loop, release run, and release decision IDs
- relevant audit IDs
- production log `requestId` or `correlation` fields when available
- `llmUsage.summary` and any non-zero `llmUsage.server.steps[]`
- the CLI client surface, for example `workbuddy`, `mac-terminal`, `ci`, or `agent-or-script`

Do not include raw tokens, passwords, deploy secrets, or unredacted `Authorization` headers.

## Log Correlation

CLI wrapper output exposes `llmUsage.process.responses[].requestId` and recent `steps[].requestId`. EvoPilot structured logs expose the same request under `correlation.requestId`. When the CLI sends `--client workbuddy` or `EVOPILOT_CLI_CLIENT=workbuddy`, server logs also include caller metadata under `metadata.client` and request-level LLM token deltas under `metadata.llmUsage`.

Use `evopilot logging inspect --json` to check the active server logging level. Admin automation may temporarily run `evopilot logging set --level debug --json` while diagnosing a failed run, then restore `info`.

Harness control-plane logs use `category=harness`. Important events include `harness-template.applied`, `harness-template.apply.rejected`, `project-harness-profile.generated`, `project-harness-profile.validation.failed`, `project-harness-profile.applied`, `project-harness-profile.activated`, `project-harness-profile.upgrade-drafted`, `goal-plan.project-harness-bound`, and `goal-plan.project-harness-missing`. Parse `metadata.templateId`, `metadata.templateVersion`, `metadata.templateDigest`, `metadata.templateSelectionMode`, `metadata.templateSelectionReasons`, `metadata.profileId`, `metadata.profileVersion`, `metadata.sourceDigest`, `metadata.compiledDigest`, `metadata.validationBlockers`, `metadata.changedSections`, `errorCode`, and `diagnosis.recommendedAction` before asking a human to inspect raw logs.

Use these fields to prove that terminal CLI output, Dashboard state, and production server logs describe the same run.
