# Example: EvoPilot Dashboard Goal Loop

## Purpose

Use the standalone Dashboard repository as a real project target to verify that browser workflows, CLI/API behavior, docs, smoke tests, and release evidence stay aligned.

## Project

Repository:

```text
https://github.com/yeliang-wang/evopilot-dashboard
```

Use one of these boundaries:

| Boundary | Meaning |
| --- | --- |
| `read-only-public` | Inspect public repository and produce analysis only. |
| `owned-repository` | Use owner credentials and repository-native CI/CD. |
| `fork-ci-pr` | Use an operator-owned fork and produce PR readiness evidence only. |

## Goal Loop Target

```text
Keep EvoPilot Dashboard aligned with EvoPilot API and CLI semantics while preserving a simple browser flow for project intake, harness review, loop execution, evidence review, and release decisions.
```

## CLI Flow

Read-only public analysis:

```bash
evopilot project onboard github \
  --id evopilot-dashboard \
  --repository-owner yeliang-wang \
  --repository evopilot-dashboard \
  --execution-mode read-only-public \
  --json
```

Owned repository operation:

```bash
evopilot project onboard github \
  --id evopilot-dashboard \
  --repository-owner yeliang-wang \
  --repository evopilot-dashboard \
  --execution-mode owned-repository \
  --token-ref GITHUB_TOKEN_EVOPILOT_DASHBOARD \
  --json
```

Generate and review the project harness:

```bash
evopilot harness profile generate \
  --project evopilot-dashboard \
  --goal-loop-target "Keep EvoPilot Dashboard aligned with EvoPilot API and CLI semantics while preserving a simple browser flow for project intake, harness review, loop execution, evidence review, and release decisions." \
  --json
```

The generated profile must be shown as a human-readable draft before activation. After approval:

```bash
evopilot harness profile activate default --project evopilot-dashboard --version <profile-version> --json

evopilot target plan \
  --project evopilot-dashboard \
  --objective "Keep EvoPilot Dashboard aligned with EvoPilot API and CLI semantics while preserving a simple browser flow for project intake, harness review, loop execution, evidence review, and release decisions." \
  --json
```

After owner approval:

```bash
evopilot target plan approve <goal-id> \
  --confirmed-by "dashboard-owner" \
  --confirmation "Approved Dashboard API compatibility and release evidence phase plan." \
  --json

evopilot target run \
  --project evopilot-dashboard \
  --objective "Keep EvoPilot Dashboard aligned with EvoPilot API and CLI semantics while preserving a simple browser flow for project intake, harness review, loop execution, evidence review, and release decisions." \
  --max-steps 20 \
  --json
```

## Expected Evidence

- Dashboard `npm run check` evidence.
- Static API contract evidence against EvoPilot OpenAPI.
- Production compatibility smoke evidence when a deployed API is available.
- Human-reviewed `ProjectHarnessProfile.yaml` draft and phase plan.
- Release decision or a clear blocker with `nextAction`.
