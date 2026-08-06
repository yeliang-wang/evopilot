# EvoPilot CLI Agent Instructions

This is the CLI entry point for WorkBuddy, Codex, Claude Code, CI jobs, and other AI agents.

Read this file first. Then read [quickstart.md](quickstart.md). Use [automation.md](automation.md) for JSON parsing rules, [workflows.md](workflows.md) for scenarios, [commands.md](commands.md) for reference, and [../guides/ai-agent-runbook.md](../guides/ai-agent-runbook.md) for production end-to-end operations.

## Non-Negotiable Rules

- Use `--json` for every command where JSON is available.
- Do not parse human-readable output for automation.
- Do not pass raw GitHub, GitLab, LLM, deploy, API, or password secrets in daily `target run`, `goal run`, or `loop run` commands.
- Store secrets on the EvoPilot server or tenant/workspace secret vault, then reference them through `tokenRef`, `apiKeyRef`, or an LLM profile id.
- Do not activate a generated `ProjectHarnessProfile` until the user or project owner has reviewed the DRAFT profile definition.
- Do not approve or publish a generated `HarnessTemplateEvolution` draft until an administrator has reviewed the source coverage, generated pack, validation, diff, and impact.
- Do not approve a phase plan until the user or project owner has reviewed it.
- Do not invent `--confirmed-by` or `--confirmation` values.
- Use `logging inspect --json` and response `requestId` / `correlation.*` fields for troubleshooting; only an administrator should temporarily raise logging to `debug`, and it should be restored to `info` after diagnosis.
- Do not claim source writeback, PR/MR, CI/CD, merge, deploy, release readiness, or GA beyond the server-returned `claimBoundary` and release decision.
- Stop when the server returns a blocker, `nextAction`, `NO-GO`, `BLOCKED`, `FAILED`, human approval, policy review, repair action, timeout, or max-step boundary.

## Required Reading Order

1. [quickstart.md](quickstart.md) - shortest safe flow.
2. [automation.md](automation.md) - fields to parse and stop conditions.
3. [workflows.md](workflows.md) - owned repository, forked upstream, GitLab, and low-level loop scenarios.
4. [commands.md](commands.md) - full command syntax.
5. [../guides/ai-agent-runbook.md](../guides/ai-agent-runbook.md) - production incident handling and end-to-end runbook.

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

`EVOPILOT_API_TOKEN` is an EvoPilot API bearer token. It is not a GitHub, GitLab, or LLM token.

## Safe Command Flow

```bash
evopilot status --json
evopilot logging inspect --json
evopilot project onboard plan github --repo owner/my-agent --id my-agent --token-ref GITHUB_TOKEN_MY_AGENT --execution-mode owned-repository --devops-owner owner --ci-workflow ci.yml --ci-required-check build --cd-workflow deploy-prod.yml --deploy-environment production --health-url https://my-agent.example.com/health --llm-profile my-agent-llm --json
evopilot project onboard github --repo owner/my-agent --id my-agent --token-ref GITHUB_TOKEN_MY_AGENT --execution-mode owned-repository --devops-owner owner --ci-workflow ci.yml --ci-required-check build --cd-workflow deploy-prod.yml --deploy-environment production --health-url https://my-agent.example.com/health --llm-profile my-agent-llm --client workbuddy --json
evopilot project onboard verify my-agent --json
evopilot project preflight my-agent --json
evopilot project devops preflight my-agent --json
evopilot project llm preflight my-agent --json
evopilot harness template list --json
evopilot harness policy list --json
evopilot harness profile generate --project my-agent --goal-loop-target "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --json
evopilot harness profile inspect default --project my-agent --version <harness-version> --json
evopilot harness profile diff default --project my-agent --version <harness-version> --json
```

EvoPilot automatically matches one built-in or administrator-published template from the project context and goal loop target. `--from-template` is only an explicit administrator or advanced override. Fresh installs include Python enterprise, Java DDD service, Node SaaS control-plane, Go middleware, observability/APM, and generic management-software baselines; current built-ins are `@1.1.0` enterprise harness baselines with structured logs, exception tracking, trace correlation, SLO monitoring, alert routing, operational runbooks, language-specific diagnostics, and release evidence rules. `harness template inspect <id> --json` exposes their `sourceReferences[]`, `failureTaxonomy`, `diagnosticsBaseline`, `observabilityBaseline`, and `governanceRules`. Administrator agents that maintain templates should read `harness-templates/public/README.md`, edit the target pack's `README.md`, `template.yaml`, `CHANGELOG.md`, and `examples/`, then use `harness template pack validate <path> --json` and `harness template pack publish <path> --json`.

Administrator agents can also run the server-governed template evolution lifecycle when template changes come from reviewable sources instead of direct pack editing:

```bash
evopilot harness template evolution create \
  --base-template python-enterprise-harness \
  --target-version 1.1.7 \
  --intent "Add stronger Python exception tracking and AI troubleshooting metadata." \
  --source github=fastapi/fastapi#master \
  --source url=https://opentelemetry.io/docs/languages/python/ \
  --file ./workspace-observability-notes.md \
  --note "Require requestId/traceId/errorCode/nextAction in error logs." \
  --json
evopilot harness template evolution advance <evolution-id> --json
evopilot harness template evolution advance <evolution-id> --json
evopilot harness template evolution advance <evolution-id> --llm-profile platform-harness-llm --json
```

Stop at `status=REVIEW_REQUIRED`. Show `evolution.draft.template`, `evolution.draft.pack`, `evolution.draft.validation`, `evolution.draft.diffFromBase`, `evolution.draft.sourceCoverage`, and `evolution.draft.generatedBy` to the administrator. Continue only with explicit confirmation:

```bash
evopilot harness template evolution approve <evolution-id> --confirmed-by <admin> --confirmation <text> --json
evopilot harness template evolution publish <evolution-id> --json
evopilot harness template evolution impact <evolution-id> --refresh --json
```

Template evolution does not silently rewrite active `ProjectHarnessProfile` versions. If `impactReport.staleProfileCount>0`, stop and create reviewed project profile upgrade drafts for affected projects before relying on the new template in goal planning. Full details are in [../guides/harness-template-evolution.md](../guides/harness-template-evolution.md).

Tenant/workspace `TenantHarnessPolicy` records are administrator-managed private constraints. Daily agents do not choose them manually; they should read `harness policy list --json` for awareness and confirm generated profiles include current `profile.policyRefs[]` when policies are active. If profile activation or goal planning returns `PROJECT_HARNESS_PROFILE_POLICY_STALE`, stop and regenerate or reapply the ProjectHarnessProfile against the active policy before continuing.

After `harness profile generate`, stop. Show `profile.sourceContent`, `compiledContent`, `validation`, `diffFromActive`, `generatedBy`, `sourceDigest`, `compiledDigest`, and `policyRefs` to the user or project owner. Report whether `generatedBy.evidence[]` contains `templateSelection=auto-match`, `templateSelection=previous-active-profile`, or `templateSelection=request-override`, and whether it contains `tenantPolicy=<policy>@v<version>`. If the user edits the harness, write the edited YAML/JSON to a file and run `harness profile validate`, `harness profile diff`, and `harness profile apply`; then use the `profile.version` returned by `apply` as `<harness-version>`. Activate only the reviewed version.

```bash
evopilot harness profile activate default --project my-agent --version <harness-version> --json
evopilot target plan --project my-agent --objective "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --client workbuddy --json
```

After `target plan`, stop. Show `plan.projectHarness` or `phasePlan.projectHarness`, including `policyRefs` when present, plus `phasePlan.phases[]`, `phasePlan.targets[]`, and `editablePlan` to the user or project owner. Continue only after explicit confirmation.

```bash
evopilot target plan export <goal-id> --format json > /tmp/my-agent-phase-plan.json
evopilot target plan diff <goal-id> --file /tmp/my-agent-phase-plan.json --json
evopilot target plan apply <goal-id> --file /tmp/my-agent-phase-plan.json --json
evopilot target plan approve <goal-id> --confirmed-by "project-owner" --confirmation "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan" --json
evopilot target run --project my-agent --objective "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --client workbuddy --json
```

## Authoritative Completion Gates

A successful local command or `LoopRun.status=SUCCEEDED` is not enough.

Completion requires server evidence:

```text
TargetEvidencePackage.status=GO
PhasePackage.decision.status=GO
releaseDecision.status=GO
llmUsage.summary.provider
llmUsage.summary.model
llmUsage.summary.totalTokens
requestId
```

Read packages explicitly:

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase alpha --json
evopilot release decisions --project <project-id> --target <target-id> --json
evopilot audit list --limit 50 --json
```

## GitHub And GitLab Projects

For enterprise real loops, the operator must provide a GitHub/GitLab execution principal:

- `owned-repository`: the same owner controls source writeback and CI/CD.
- `fork-validated-pr`: EvoPilot writes and runs CI/CD in an operator-owned fork, then prepares upstream PR evidence.
- `upstream-authorized`: a maintainer principal can write and run CI/CD in the upstream.
- `read-only-public`: public inspection only. Do not claim PR, merge, CI/CD, deploy, release readiness, or GA.

If the user has no GitHub/GitLab account, use `read-only-public` and stop before real loop execution.

## Report Format

In final agent output, report:

```text
schema=<wrapper-schema>
status=<server-status>
nextAction=<server-next-action>
projectId=<project-id>
projectHarnessProfile=<profile-id-or-missing>
projectHarnessVersion=<version-or-missing>
projectHarnessDigest=<compiled-digest-or-missing>
goalId=<goal-id>
activeTargetId=<target-id>
loopId=<loop-id>
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
```
