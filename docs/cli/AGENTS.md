# EvoPilot CLI Agent Instructions

This is the CLI entry point for WorkBuddy, Codex, Claude Code, CI jobs, and other AI agents.

Read this file first. Then read [quickstart.md](quickstart.md). Use [automation.md](automation.md) for JSON parsing rules, [workflows.md](workflows.md) for command workflows, [../guides/ai-agent-scenarios.md](../guides/ai-agent-scenarios.md) for end-to-end scenario coverage, [commands.md](commands.md) for reference, and [../guides/ai-agent-runbook.md](../guides/ai-agent-runbook.md) for production operations.

## Non-Negotiable Rules

- Use `--json` for every command where JSON is available.
- Do not parse human-readable output for automation.
- Do not pass raw GitHub, GitLab, LLM, deploy, API, or password secrets in daily `target run`, `goal run`, or `loop run` commands.
- Store secrets on the EvoPilot server or tenant/workspace secret vault, then reference them through `tokenRef`, `apiKeyRef`, or an LLM profile id.
- Do not approve a phase plan until the user or project owner has reviewed it.
- Do not invent `--confirmed-by` or `--confirmation` values.
- Use `logging inspect --json` and response `requestId` / `correlation.*` fields for troubleshooting; only an administrator should temporarily raise logging to `debug`, and it should be restored to `info` after diagnosis.
- Do not claim source writeback, PR/MR, CI/CD, merge, deploy, release readiness, or GA beyond the server-returned `claimBoundary` and release decision.
- Stop when the server returns a blocker, `nextAction`, `NO-GO`, `BLOCKED`, `FAILED`, human approval, repair action, timeout, or max-step boundary.

## Harness Boundary

EvoPilot v3 is a Harness Catalog consumer only.

- `evopilot-harness` owns Harness lifecycle, evolution, review, versioning, and publication.
- EvoPilot reads one or more server-configured published Catalog directories through `EVOPILOT_HARNESS_CATALOG_DIR` or `EVOPILOT_HARNESS_CATALOG_DIRS`.
- EvoPilot exposes only read-only Catalog projection through API/Dashboard. The EvoPilot CLI does not expose `evopilot harness ...`.
- During `target plan` or `goal plan`, EvoPilot dynamically reads `CATALOG.md`, auto-matches a `PUBLISHED` Harness, and records `plan.selectedHarness`.
- If `plan.selectedHarness` is missing, stop and ask an administrator to publish a Harness with `evopilot-harness` or configure the server Catalog directory.

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

`EVOPILOT_API_TOKEN` is an EvoPilot API bearer token. It is not a GitHub, GitLab, Harness, or LLM token.

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
evopilot target plan --project my-agent --objective "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --client workbuddy --json
```

After `target plan`, stop. Show the returned `phasePlan` and `plan.selectedHarness` to the project owner.

Required Harness fields to report:

```text
selectedHarness.harnessId
selectedHarness.version
selectedHarness.domain
selectedHarness.catalogId
selectedHarness.catalogDigest
selectedHarness.entryPath
selectedHarness.entryDigest
selectedHarness.selectionReasons
```

Continue only after explicit confirmation:

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
selectedHarness.harnessId
selectedHarness.entryDigest
```

Read packages explicitly:

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase alpha --json
evopilot release decisions --project <project-id> --target <target-id> --json
evopilot audit list --limit 50 --json
```

## Report Format

In final agent output, report:

```text
schema=<wrapper-schema>
status=<server-status>
nextAction=<server-next-action>
projectId=<project-id>
selectedHarness=<harness-id>@<version>
selectedHarnessCatalog=<catalog-id>
selectedHarnessCatalogDigest=<digest-or-missing>
selectedHarnessEntryDigest=<digest-or-missing>
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
requestId=<request-id>
```
