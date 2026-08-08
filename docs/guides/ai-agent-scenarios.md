# AI Agent Scenario Coverage

> End-to-end scenario map for third-party AI agents that simulate a human operator, and for humans who need a task-oriented operating guide.

This guide sits between the quickstart and the command reference. It does not replace [CLI Agent Instructions](../cli/AGENTS.md), [CLI Automation](../cli/automation.md), [CLI Workflows](../cli/workflows.md), or [CLI Commands](../cli/commands.md). It tells an agent or human which path to follow, where to stop for review, and which server-derived fields prove completion.

## Reader Paths

For a third-party AI agent such as WorkBuddy:

1. Read [../cli/AGENTS.md](../cli/AGENTS.md).
2. Read [../cli/quickstart.md](../cli/quickstart.md).
3. Read [../cli/automation.md](../cli/automation.md).
4. Select one scenario from this file.
5. Use [../cli/commands.md](../cli/commands.md) only for exact command syntax.
6. Stop on every human gate, blocker, `nextAction`, `NO-GO`, `BLOCKED`, `FAILED`, timeout, or max-step boundary.

For a human operator:

1. Start with the scenario table below.
2. Open the linked workflow or runbook section only for the task you are performing.
3. Run the commands in order.
4. Review the DRAFT, phase plan, release evidence, or template evolution draft when the scenario says `Human review`.
5. Keep raw GitHub, GitLab, deploy, password, and LLM secrets out of daily command lines.

## Coverage Matrix

| Scenario | Primary reader | Entry docs | Main commands | Human review gates | Completion evidence |
|---|---|---|---|---|---|
| Connect to EvoPilot and verify readiness | Agent and human | [../cli/README.md](../cli/README.md), [../cli/quickstart.md](../cli/quickstart.md) | `config show`, `status`, `logging inspect` | None | `status=READY`, `health.status=UP`, `ready.status=READY`, authenticated `summary`, `requestId` |
| First-time owned repository to Goal Loop | Agent and human | [../cli/quickstart.md](../cli/quickstart.md), [../cli/workflows.md](../cli/workflows.md) | `project onboard plan`, `project onboard`, `project preflight`, `project devops preflight`, `project llm preflight`, `harness profile generate`, `target plan`, `target run` | ProjectHarnessProfile DRAFT, Alpha/Beta/RC/GA phase plan | `TargetEvidencePackage.status=GO`, `PhasePackage.decision.status=GO`, `releaseDecision.status=GO` |
| Already registered project continues a goal | Agent and human | [../cli/workflows.md](../cli/workflows.md), [ai-agent-runbook.md](ai-agent-runbook.md) | `project onboard verify`, `goal run`, `goal snapshot`, `goal target-package`, `goal phase-package` | Phase plan if `nextAction=approve-plan`; human gate if returned | Active target and phase package are `GO`; wrapper result includes LLM provider/model/tokens |
| Third-party public upstream with writable fork | Agent and human | [../cli/workflows.md](../cli/workflows.md), [ai-agent-runbook.md](ai-agent-runbook.md) | `project onboard plan github`, `project onboard github`, `project devops preflight`, `target plan`, `target run` | ProjectHarnessProfile DRAFT and phase plan | `claimBoundary=fork-ci-pr`; do not claim upstream merge or release |
| Read-only public repository | Agent and human | [../cli/workflows.md](../cli/workflows.md), [ai-agent-runbook.md](ai-agent-runbook.md) | `project onboard plan github --execution-mode read-only-public`, `project onboard github`, read-only inspection commands | None before analysis; stop before writeback | `claimBoundary=read-only-analysis`; no PR, CI/CD, deploy, release, or GA claim |
| Source-project driven HarnessTemplate evolution | Administrator agent and admin | [harness-template-evolution.md](harness-template-evolution.md), [../cli/automation.md](../cli/automation.md) | `harness evolve`, `harness template match`, `harness template evolution inspect` | Template evolution draft at `REVIEW_REQUIRED` | `evolutionId`, source digests, source coverage, validation, diff, `nextAction=review-approve-template-evolution` |
| Attachment, production-log, or EvoPilot-history driven template evolution | Administrator agent and admin | [harness-template-evolution.md](harness-template-evolution.md), [../cli/automation.md](../cli/automation.md) | `harness template evolution create`, `advance`, `approve`, `publish`, `impact` | Draft review before approval; impact review after publish | Published template digest, impact report, stale profile count, audit records |
| Project profile upgrade after template or policy change | Agent and human | [project-harness-onboarding.md](project-harness-onboarding.md), [../cli/quickstart.md](../cli/quickstart.md) | `harness profile upgrade` or `harness profile generate`, `validate`, `diff`, `apply`, `activate`, `target plan` | ProjectHarnessProfile DRAFT and plan binding | `summary.activeVersion`, matching `compiledDigest`, `plan.projectHarness.policyRefs[]` |
| Blocker repair and troubleshooting | Agent and human | [../cli/automation.md](../cli/automation.md), [../operations/troubleshooting.md](../operations/troubleshooting.md) | `audit list --limit 50`, `logging inspect`, `trace tree`, `trace events`, `release-run repair-candidates`, `release-run repair` | Human approval for repair, policy review, source closure, merge, or deploy | Same `requestId`, `loopId`, `releaseRunId`, and `releaseDecisionId` line up across CLI, audit, and logs |
| Release verdict inspection | Agent and human | [../cli/workflows.md](../cli/workflows.md), [../operations/release-management.md](../operations/release-management.md) | `release current`, `release decisions`, `target decision`, `goal final-report` | Release owner review when decision is not `GO` | `releaseDecision.status=GO`; local tests or CI alone are not enough |

## Scenario 1: Connect And Verify Readiness

Use this before any state-changing command.

```bash
evopilot config show --json
evopilot status --json
evopilot logging inspect --json
```

Agent parse order:

```text
schema
status
health.status
ready.status
summary
diagnosis.recommendedAction
requestId
llmUsage.summary.provider
llmUsage.summary.model
llmUsage.summary.totalTokens
```

Stop when `status=UNREACHABLE`, `summary` is missing, authentication fails, or `diagnosis.recommendedAction` asks for configuration repair.

Human completion check: the server URL, tenant, workspace, actor, and authenticated summary are visible and match the intended operating scope.

## Scenario 2: First-Time Owned Repository To Goal Loop

Use this when the operator controls the source repository and the CI/CD boundary.

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
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --json
```

Continue only when the checklist permits registration. Then run:

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
  --client workbuddy \
  --json

evopilot project onboard verify my-agent --json
evopilot project preflight my-agent --json
evopilot project devops preflight my-agent --json
evopilot project llm preflight my-agent --json
```

Human review: generate the project harness profile and stop.

```bash
evopilot harness profile generate \
  --project my-agent \
  --goal-loop-target "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --json

evopilot harness profile inspect default --project my-agent --version <harness-version> --json
evopilot harness profile diff default --project my-agent --version <harness-version> --json
```

Show the user:

```text
profile.sourceContent
profile.compiledContent
profile.validation
profile.diffFromActive
profile.generatedBy
profile.sourceDigest
profile.compiledDigest
profile.policyRefs
```

Activate only after confirmation:

```bash
evopilot harness profile activate default --project my-agent --version <harness-version> --json
```

Human review: generate the phase plan and stop.

```bash
evopilot target plan \
  --project my-agent \
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --client workbuddy \
  --json
```

Show the user:

```text
plan.projectHarness or phasePlan.projectHarness
phasePlan.phases[]
phasePlan.targets[]
editablePlan
```

Approve only after confirmation, then execute:

```bash
evopilot target plan export <goal-id> --format json > /tmp/my-agent-phase-plan.json
evopilot target plan diff <goal-id> --file /tmp/my-agent-phase-plan.json --json
evopilot target plan apply <goal-id> --file /tmp/my-agent-phase-plan.json --json
evopilot target plan approve <goal-id> --confirmed-by "project-owner" --confirmation "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan" --json

evopilot target run \
  --project my-agent \
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --client workbuddy \
  --max-steps 20 \
  --json
```

Completion requires:

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase <alpha|beta|rc|ga> --json
evopilot release decisions --project my-agent --target <target-id> --json
```

Do not claim completion from `LoopRun.status=SUCCEEDED` alone.

## Scenario 3: Continue An Existing Project Goal

Use this when project onboarding already exists.

```bash
evopilot project onboard verify my-agent --json
evopilot project preflight my-agent --json
evopilot project devops preflight my-agent --json
evopilot project llm preflight my-agent --json
```

If the active harness profile is missing, stale, or not bound to the current policy, return to Scenario 2's harness review steps.

Then run or resume the goal:

```bash
evopilot goal run \
  --project my-agent \
  --target my-agent-ga \
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --client workbuddy \
  --max-steps 20 \
  --json
```

Stop on `nextAction=approve-plan`, `human-approval`, `policy-review`, `repair`, `BLOCKED`, `FAILED`, or `NO-GO`.

## Scenario 4: Public Upstream With Writable Fork

Use this when EvoPilot can work in a fork, but the upstream owns merge and release authority.

```bash
evopilot project onboard plan github \
  --repo upstream-owner/upstream-repo \
  --upstream-repo upstream-owner/upstream-repo \
  --working-repo operator-org/upstream-repo-fork \
  --id upstream-repo-fork \
  --token-ref GITHUB_TOKEN_OPERATOR_FORK \
  --execution-mode fork-validated-pr \
  --devops-owner operator-org \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --llm-profile my-agent-llm \
  --json
```

The agent may claim fork CI and PR readiness only when the server returns:

```text
executionMode=fork-validated-pr
workflowRepository=operator-org/upstream-repo-fork
claimBoundary=fork-ci-pr
```

Do not claim upstream merge, upstream deployment, or upstream release completion.

## Scenario 5: Read-Only Public Repository

Use this when no writable GitHub/GitLab principal exists.

```bash
evopilot project onboard plan github \
  --repo owner/public-repo \
  --id public-repo-readonly \
  --execution-mode read-only-public \
  --objective "Analyze project readiness and identify blockers." \
  --json
```

Allowed conclusion:

```text
claimBoundary=read-only-analysis
```

Forbidden claims:

```text
PR ready
CI/CD ready
merged
deployed
release ready
GA
```

## Scenario 6: Source-Project HarnessTemplate Evolution

Use this when an administrator wants EvoPilot to learn from a historical or local project and produce a reviewable template draft.

```bash
evopilot harness evolve \
  --source-project ./legacy-cache-service \
  --goal "Create or evolve the harness for self-developed distributed cache products." \
  --json
```

The one-command wrapper may collect sources, auto-match a template, create or resume an evolution, advance it, and stop at review. It must not approve or publish without explicit administrator confirmation.

Show the administrator:

```text
evolution.evolutionId
evolution.autoMatch
evolution.analysisSummary.domainSignals
evolution.analysisSummary.gapClassifications
evolution.draft.template
evolution.draft.pack
evolution.draft.validation
evolution.draft.diffFromBase
evolution.draft.sourceCoverage
evolution.draft.generatedBy
nextAction
```

Stop at:

```text
status=REVIEW_REQUIRED
nextAction=review-approve-template-evolution
nextAction=confirm-template-match-or-override
```

## Scenario 7: Attachments, Logs, And EvoPilot History As Harness Sources

Use this when source knowledge comes from files, production logs, or previous EvoPilot runs.

```bash
evopilot harness template evolution create \
  --auto-match \
  --intent "Evolve the gateway harness from incident logs and previous goal loop evidence." \
  --source log=./prod-incident.log \
  --source evopilot-history=my-gateway:loop=<loop-id> \
  --file ./architecture-review.pdf \
  --file ./operating-model.docx \
  --note "Require requestId, traceId, errorCode, and nextAction in error logs." \
  --json

evopilot harness template evolution advance <evolution-id> --json
evopilot harness template evolution advance <evolution-id> --json
evopilot harness template evolution advance <evolution-id> --llm-profile platform-harness-llm --json
```

Review warnings matter. PDF extraction may be partial; production logs are redacted before persistence; Office documents are extracted through local document structure when possible.

Approval and publish are administrator-only:

```bash
evopilot harness template evolution approve <evolution-id> --confirmed-by <admin> --confirmation <text> --json
evopilot harness template evolution publish <evolution-id> --json
evopilot harness template evolution impact <evolution-id> --refresh --json
```

If `impactReport.staleProfileCount>0`, stop and create reviewed project profile upgrade drafts.

## Scenario 8: Project Profile Upgrade After Template Or Policy Change

Use this after a template evolution or tenant policy activation affects existing projects.

```bash
evopilot harness profile upgrade default \
  --project my-agent \
  --from-template <template-id> \
  --from-template-version <template-version> \
  --json
```

If the user edits the draft:

```bash
evopilot harness profile validate --project my-agent --file /tmp/my-agent-harness-profile.yaml --json
evopilot harness profile diff default --project my-agent --file /tmp/my-agent-harness-profile.yaml --json
evopilot harness profile apply --project my-agent --file /tmp/my-agent-harness-profile.yaml --json
```

Activate only after human review:

```bash
evopilot harness profile activate default --project my-agent --version <harness-version> --json
evopilot target plan --project my-agent --objective "Continue the approved business goal." --json
```

The plan must bind the active profile version, template ref, compiled digest, and current `policyRefs[]`.

## Scenario 9: Blocker Repair And Evidence Correlation

Use this when any wrapper returns a blocker or non-zero exit code.

```bash
evopilot audit list --limit 50 --json
evopilot trace tree <loop-id> --json
evopilot trace events <loop-id> --json
evopilot release-run repair-candidates --json
```

Only run repair commands when the server state and human instruction allow the action:

```bash
evopilot release-run repair <run-id> --execute --json
```

Report these IDs:

```text
requestId
projectId
goalId
loopId
releaseRunId
releaseDecisionId
auditId
```

The same IDs must line up across CLI JSON, audit output, trace output, and structured logs.

## Scenario 10: Release Verdict Inspection

Use this when a human or agent asks whether a target is complete.

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase <alpha|beta|rc|ga> --json
evopilot release current --json
evopilot release decisions --project <project-id> --target <target-id> --json
evopilot target decision <target-id> --project <project-id> --json
```

Completion requires:

```text
TargetEvidencePackage.status=GO
PhasePackage.decision.status=GO
releaseDecision.status=GO
llmUsage.summary.provider
llmUsage.summary.model
llmUsage.summary.totalTokens
requestId
```

Do not replace these fields with local tests, CI success, screenshots, or human-readable CLI output.

## Stop Conditions

An AI agent must stop and report the exact blocker when any command returns:

```text
nextAction
NO-GO
BLOCKED
FAILED
timeout
max-steps
max-iterations
human-approval
policy-review
repair
repair-project
repair-deploy-target
connect-github-account
connect-gitlab-account
configure-source-credentials
configure-devops
configure-llm-profile
store-llm-secret
PROJECT_HARNESS_PROFILE_POLICY_STALE
```

## Final Report Shape

Every third-party AI Agent simulation should finish with a server-derived report:

```text
scenario=<scenario-name>
schema=<wrapper-schema>
status=<server-status>
nextAction=<server-next-action>
projectId=<project-id>
executionMode=<mode>
claimBoundary=<boundary>
projectHarnessProfile=<profile-id-or-missing>
projectHarnessVersion=<version-or-missing>
projectHarnessDigest=<compiled-digest-or-missing>
goalId=<goal-id-or-empty>
activeTargetId=<target-id-or-empty>
loopId=<loop-id-or-empty>
targetPackage=<GO|NO-GO|PENDING>
phasePackage=<GO|NO-GO|PENDING>
releaseDecision=<GO|CONDITIONAL-GO|NO-GO|missing>
llmProvider=<provider>
llmModel=<model>
inputTokens=<n>
outputTokens=<n>
totalTokens=<n>
requestIds=<ids>
blockers=<blockers>
humanReview=<not-needed|pending|confirmed>
```

If any field is unavailable because the scenario stopped early, report it as missing and include the blocking `nextAction`.
