# Agent-Native Lifecycle Control Plane

EvoPilot Runtime 6 keeps the Harness-guided `Goal -> Loop -> Target` core and turns project Pipelines into independently managed domain resources.

```text
ordinary human
    |
Agent Host + installed Evolution Expert bundle
    | MCP Human Interaction Protocol
    v
EvoPilot Runtime control-plane truth
    |-- ProjectDefinition
    |-- tenant/workspace Lifecycle Registry
    |-- read-only published Harness consumer
    |-- Goal / Target / Loop / recovery / evidence / release
    |
    +-- exact pendingExecution --> qualified external Agent Runtime
                                      |
                    normalized receipt / trajectory / usage / artifacts
```

## Domain ownership

| Domain | Owns | Must not own |
| --- | --- | --- |
| Agent Host | Conversation, tool presentation, human identity | Runtime state or project rules |
| Evolution Expert | Intent routing, questions, explanations, exact decision presentation | State, source execution, Harness choice, approval |
| Runtime | Project and Lifecycle registries, bindings, loops, evidence, recovery, acceptance and release state | General-purpose coding Agent or Harness publication |
| Lifecycle Registry | Immutable revisions, active pointer, diff, dependencies, usage, audit, archive/restore/rollback | Arbitrary executable code or secrets |
| External Agent Runtime | Bounded execution of one exact request | Planning, authority, hidden retries, control-plane state |
| `evopilot-harness` | Harness authoring, review, approval, Catalog/Registry and publication | EvoPilot project-loop execution |

Planning resolves a project, one active Lifecycle revision, and one eligible published immutable HarnessBundle. Composition is monotonic: a Lifecycle may add obligations but cannot remove Harness validators, evidence, constraints, capabilities, or authority stops. Every start, iteration, retry, and resume revalidates the immutable binding.

Project and Pipeline changes stay declarative when contracts remain compatible. Adding DataRig, EvoPilot, evopilot-harness, or an unknown project requires no repository-name branch. The frozen legacy Suite snapshots are test inputs only and never a Runtime fallback.
