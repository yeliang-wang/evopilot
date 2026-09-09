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

## Executed binding invariant

For a Goal Target Loop, a plain Lifecycle binding is insufficient. Runtime
requires an immutable `HarnessExecutionBinding` and checks it at start, resume,
retry, and every Loop iteration. The check covers the exact Project Definition,
GoalTarget, Registry and Catalog, HarnessProfile, HarnessBundle and Components,
Lifecycle, Policy, Provider, Environment, Host, Runtime, authority, and evidence
digests. A missing binding, unpublished Bundle, altered executor, deleted
project version, or any digest drift fails before another action is dispatched.

## Recovery and learning

Every failed external stage enters the Runtime Recovery Controller. Transient,
deterministic, reversible, receipt-reconcilable failures continue within the
stage's retry budget. An unknown but safe recurring class produces a complete
Automation Rule proposal. The proposal is inert until one exact human decision
activates its digest; future equivalent failures may then recover automatically.
If the learned repair fails again, Runtime suspends that rule and records the
event. Authority-required, irreversible, or uncertain external effects never
become automatic through conversation.

## Project variation

Project discovery yields detected facts plus only unresolved typed questions.
The canonical YAML/JSON definition and its project-owned resources are
immutable by id/version. Adjustments create semantic impact reports and a new
version; activation and rollback move an auditable pointer for future work,
while active runs retain their original exact binding. Raw secrets are rejected
and only SecretRefs are persisted.

## Completion boundary

The original v5 scheme closes only through the digest-bound completion contract
documented in [Completion Assurance](../operations/completion-assurance.md).
Runtime/Expert version numbers, publication, aggregate PASS, or user statements
cannot replace criterion-specific evidence from one exact Candidate pair.
