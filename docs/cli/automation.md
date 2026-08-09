# EvoPilot CLI Automation

This guide is for WorkBuddy, Codex, Claude Code, other AI agents, and CI jobs that automate EvoPilot through `evopilot ... --json`.

## Contract

- Use JSON output whenever available.
- Do not parse human-readable CLI output for automation.
- Treat EvoPilot API responses as authoritative.
- Stop on `nextAction`, blockers, `NO-GO`, `BLOCKED`, `FAILED`, human approval, timeout, or max-step boundaries.
- Never pass raw GitHub, GitLab, LLM, deploy, API, or password secrets to daily `target run`, `goal run`, or `loop run` commands.
- Harness lifecycle is not automated through EvoPilot. Use `evopilot-harness` before this flow to publish a usable Harness Catalog directory.
- Only EvoPilot release decisions can justify release readiness claims.

## Harness Catalog Precondition

EvoPilot must be started with at least one published Catalog directory when Harness selection is required:

```bash
EVOPILOT_HARNESS_CATALOG_DIR=/path/to/evopilot-harness/published
```

The directory must contain `CATALOG.md`. EvoPilot reads it dynamically during planning and returns `plan.selectedHarness`.

If `plan.selectedHarness` is missing, stop and report:

```text
nextAction=publish-or-configure-harness-catalog
```

Do not attempt to publish or evolve Harness definitions with EvoPilot CLI/API.

## Minimal Automation Flow

```bash
evopilot status --json
evopilot project onboard plan github --repo owner/my-agent --id my-agent --token-ref GITHUB_TOKEN_MY_AGENT --execution-mode owned-repository --devops-owner owner --llm-profile my-agent-llm --json
evopilot project onboard verify my-agent --json
evopilot project preflight my-agent --json
evopilot project devops preflight my-agent --json
evopilot project llm preflight my-agent --json
evopilot target plan --project my-agent --objective "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --json
```

Parse:

```text
result.goalId
result.phasePlan
result.plan.selectedHarness
result.llmUsage.summary
result.requestId
```

Stop and show the phase plan plus selected Harness evidence to the project owner. Continue only with explicit confirmation:

```bash
evopilot target plan approve <goal-id> \
  --confirmed-by project-owner \
  --confirmation "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan" \
  --json

evopilot target run \
  --project my-agent \
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --json
```

## LLM Profile Rules

Enterprise project loops must use a READY project LLM profile or run-level `--llm-profile`. The global default LLM is for local/debug validation only.

## Goal Plan Approval Rules

automation must not invent owner confirmation. `target plan approve` requires real `--confirmed-by` and `--confirmation` values after the owner reviews `selectedHarness` and the phase plan.

## Fields To Preserve

Always report:

```text
requestId
correlation.goalId
correlation.projectId
llmUsage.summary.provider
llmUsage.summary.model
llmUsage.summary.inputTokens
llmUsage.summary.outputTokens
llmUsage.summary.totalTokens
selectedHarness.harnessId
selectedHarness.version
selectedHarness.catalogId
selectedHarness.catalogDigest
selectedHarness.entryDigest
selectedHarness.selectionReasons
TargetEvidencePackage.status
PhasePackage.decision.status
releaseDecision.status
```

## Stop Conditions

Stop on these values or equivalent non-2xx responses:

```text
nextAction=plan-target
nextAction=approve-plan
nextAction=publish-or-configure-harness-catalog
nextAction=configure-source-credentials
nextAction=configure-devops
nextAction=configure-llm-profile
nextAction=human-approval
status=BLOCKED
status=FAILED
releaseDecision=NO-GO
status=UNREACHABLE
diagnosis.recommendedAction
```

## Completion Check

After execution:

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase ga --json
evopilot release decisions --project my-agent --target <target-id> --json
evopilot audit list --limit 50 --json
```

Do not claim completion without GO evidence, request IDs, token usage, and selected Harness digest evidence.
