# Harness-Guided Governed Evolution Runtime

EvoPilot v5 keeps Harness-guided `Goal -> Loop -> Target` execution as its product core and upgrades how projects and lifecycles bind to it.

```text
Project Definition + GoalTarget
              |
              v
deterministic published-Harness match
   MATCHED / AMBIGUOUS / ABSTAINED
              |
              v
immutable HarnessBundle + open Lifecycle
   union obligations / intersect authority
              |
              v
HarnessExecutionBinding
              |
              v
start -> resume -> retry -> every Loop iteration
       exact binding revalidation
              |
              v
Candidate -> isolated acceptance -> exact-byte promotion
```

## Domain ownership

| Object | Owner | Role |
| --- | --- | --- |
| Harness assets and Catalog publication | evopilot-harness | Defines professional execution requirements. |
| Project Definition, GoalTarget, binding, Loop, evidence, recovery, acceptance and release decision | EvoPilot Runtime | Governs actual project evolution. |
| Lifecycle YAML | EvoPilot project configuration | Composes delivery stages without weakening Harness. |
| Evolution Expert | Independent package | Optional conversational projection over Runtime APIs. |
| Agent Host | Codex, WorkBuddy, or another Host | Presents tools and permissions. |
| Execution runtime | Configured provider/model/runner | Performs declared actions under Host permissions. |

DataRig, EvoPilot, and evopilot-harness live under `examples/projects/` as declarations. A new project uses exactly the same aggregate and APIs.

## Human decision economy

Automatic work includes validation, matching when unique, planning, deterministic mechanics repair, bounded safe retry, receipt-based resume, evidence aggregation, and drift checks. Humans decide only ambiguous/unknown business choices, irreversible external effects, uncertain mutations without proof, acceptance verdicts, and publication authority.
