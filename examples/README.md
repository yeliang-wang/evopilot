# EvoPilot Examples

These examples show how external users and AI Agents should evaluate EvoPilot without private context.

## Start Here

| Example | Purpose |
| --- | --- |
| `github-demo-projects/node-api/` | Minimal Node API project used for runnable evidence and workflow examples. |
| `github-workflows/` | GitHub Actions examples for EvoPilot target loops, release blockers, and CI failure repair. |
| `executor-adapters/` | Executor adapter contracts and evidence boundaries. |
| `simple-agent-project/profile.yaml` | Small project profile example. |
| `source-to-ga/` | End-to-end onboarding, harness review, goal loop, evidence, and release decision scenarios. |

## Rules

- Examples must not contain real tokens or deploy secrets.
- Examples should stop at EvoPilot approval gates instead of pretending a human confirmed them.
- When an example describes a real external repository, it must state the execution boundary: read-only, fork-validated PR, owned repository, or maintainer-authorized upstream.
