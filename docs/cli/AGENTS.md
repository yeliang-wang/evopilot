# EvoPilot CLI Agent Instructions

This is the CLI entry point for WorkBuddy, Codex, Claude Code, CI jobs, and other AI agents.

Read this file first. Then read [quickstart.md](quickstart.md). Use [automation.md](automation.md) for JSON parsing rules, [workflows.md](workflows.md) for scenarios, [commands.md](commands.md) for reference, and [../guides/ai-agent-runbook.md](../guides/ai-agent-runbook.md) for production end-to-end operations.

## Non-Negotiable Rules

- Use `--json` for every command where JSON is available.
- Do not parse human-readable output for automation.
- Do not pass raw GitHub, GitLab, LLM, deploy, API, or password secrets in daily `target run`, `goal run`, or `loop run` commands.
- Store secrets on the EvoPilot server or tenant/workspace secret vault, then reference them through `tokenRef`, `apiKeyRef`, or an LLM profile id.
- Do not approve a phase plan until the user or project owner has reviewed it.
- Do not invent `--confirmed-by` or `--confirmation` values.
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
evopilot project onboard plan github --repo owner/my-agent --id my-agent --token-ref GITHUB_TOKEN_MY_AGENT --execution-mode owned-repository --devops-owner owner --ci-workflow ci.yml --ci-required-check build --cd-workflow deploy-prod.yml --deploy-environment production --health-url https://my-agent.example.com/health --llm-profile my-agent-llm --json
evopilot project onboard github --repo owner/my-agent --id my-agent --token-ref GITHUB_TOKEN_MY_AGENT --execution-mode owned-repository --devops-owner owner --ci-workflow ci.yml --ci-required-check build --cd-workflow deploy-prod.yml --deploy-environment production --health-url https://my-agent.example.com/health --llm-profile my-agent-llm --client workbuddy --json
evopilot project onboard verify my-agent --json
evopilot target plan --project my-agent --objective "Enable tenant onboarding and lifecycle workflow visibility" --llm-profile my-agent-llm --client workbuddy --json
```

After `target plan`, stop. Show `phasePlan.phases[]`, `phasePlan.targets[]`, and `editablePlan` to the user or project owner. Continue only after explicit confirmation.

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
