# Source-To-GA Examples

These scenarios are designed for humans and AI Agents that need to learn the full EvoPilot operating model.

```text
Project Onboarding -> Harness Draft -> Owner Review -> Phase Plan -> Loop Execution -> Evidence -> Release Decision
```

## Scenarios

| Scenario | Boundary | Use When |
| --- | --- | --- |
| [Node API service](node-api-service-goal-loop.md) | Disposable or owned repository | You want a minimal service to validate source-to-GA behavior. |
| [EvoPilot Dashboard](evopilot-dashboard-goal-loop.md) | Owned repository or read-only public analysis | You want to verify Dashboard and CLI/API alignment. |

## Required Stop Points

AI Agents must stop and show output to a user or owner at:

- Generated `ProjectHarnessProfile` draft.
- Harness profile diff or edited profile.
- Alpha/Beta/RC/GA phase plan.
- Source closure approval.
- Release policy review.
- `NO-GO`, `BLOCKED`, `FAILED`, credential repair, LLM repair, or deploy repair.
