# Architecture

> EvoPilot is an API and CLI control plane for governed AI Agent product evolution.

## Product Split

```text
AI Agent / CI / Operator
        |
        v
EvoPilot CLI  --->  EvoPilot API Server  ---> Evidence / Audit / Release State
                         ^
                         |
                 EvoPilot Dashboard
```

EvoPilot owns the domain model and execution state. The Dashboard is a replaceable UI client that consumes the API.

## Package Boundaries

The current TypeScript workspace is split by control-plane responsibility:

| Package | Responsibility |
|---|---|
| `@evopilot/contracts` | Shared schema names, version constants, and API/CLI/runtime boundary metadata. |
| `@evopilot/core` | Evidence, evolution, delivery, and release domain primitives. |
| `@evopilot/server` | HTTP control-plane runtime, thin compatibility adapter, runtime auth/config helpers, executor adapters, RBAC, audit, tenant/workspace scope, and API orchestration. |
| `@evopilot/worker-runtime` | Loop worker polling, heartbeat, watchdog, and start/resume API loop. |
| `@evopilot/cli` | HTTP adapter CLI for agent-safe JSON and operator output. |
| `@evopilot/client` | HTTP request helper for CLI and integrations. |

See [Package Boundaries](package-boundaries.md) for ownership rules, transitional hotspots, and validation commands.

## Bounded Contexts

| Context | Responsibility |
|---|---|
| Project | Registered products, source credentials, workspace ownership |
| Harness Catalog Consumer | Read-only published Harness Catalog loading, automatic selected-Harness matching, and goal-plan digest evidence |
| Evidence | Runtime signals, trace/log/eval ingestion, evidence bundles |
| GlobalGoal | Goal decomposition into GoalTargets, progress, graph, timeline, final report |
| Loop Runtime | LoopRun execution, worker leases, sandbox proof, trace, events, replay |
| Source Closure | Writeback, review decision, merge/promotion gates |
| Release Governance | ReleaseTarget profiles and authoritative release decisions |
| CLI Adapter | Atomic commands and wrapper commands over the API |
| Dashboard Adapter | Visual workflow and operations UI over the API |

## Key Rule

The Dashboard can visualize and request actions, but only EvoPilot API state can decide what happened. Release conclusions come from release decisions, not UI inference.

Deep architecture notes remain in:

- [Continuous Evolution Control Plane](continuous-evolution-control-plane.md)
- [Package Boundaries](package-boundaries.md)
- [Published Harness Catalog](published-harness-catalog.md)
- [Harness Template Domain](harness-template-domain.md)
- [Loop Runtime](loop-runtime.md)
- [ProofOps Target Loop Mode](proofops-target-loop-mode.md)
