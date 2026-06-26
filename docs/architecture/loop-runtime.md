# EvoPilot Loop Runtime

## Status

Accepted

## Context

Loop Engineering requires more than a single agent call. EvoPilot must keep long-running tasks alive across iterations, validate each round independently, persist evidence and artifacts, decide whether to continue or stop, recover from worker interruption, and hand high-risk steps to human approval.

Loop Runtime is the continuity and execution substrate of EvoPilot's continuous evolution control plane. The product model is described in [continuous-evolution-control-plane.md](continuous-evolution-control-plane.md). In that model:

- Evidence Layer supplies runtime, evaluation, feedback, and delivery signals.
- Decision Layer decides opportunities, risks, release targets, and continuation.
- Execution Layer performs code upgrades, CI/CD, validation, and release actions.
- Governance Layer applies RBAC, approval, audit, watchdog, and stop policies.
- Continuity Layer is implemented by Loop Runtime state, timeline, evidence sets, artifacts, and heartbeat leases.

## Decision

EvoPilot owns a first-class `Loop Runtime` bounded context.

The runtime introduces:

- `LoopRun` as the durable long-task aggregate.
- `LoopIteration` as the per-round execution record.
- `LoopEvidenceSet` as independent validation output.
- `ExecutorGraph` as the explicit multi-executor orchestration model.
- `StopPolicy` and `RetryPolicy` as data, not hard-coded control flow.
- worker heartbeat leases and watchdog recovery.
- timeline, evidence, artifact, approval, and audit APIs.
- per-step sandbox workspace paths under `loop-workspaces`.
- standalone `loop-worker` and `loop-soak` scripts.
- Feishu and WeCom webhook adapters that create `LoopRun` entries through the same control plane.

Existing release, evolution, conversation, and target-loop entry points can remain product-specific surfaces, but the common execution substrate is `/api/v1/loops`.

Loop Runtime does not own the whole product decision. Evidence ingestion, opportunity discovery, governance policy, and release decision APIs remain product-control-plane concerns. Runtime loops coordinate executors and preserve long-task continuity so those product decisions can be carried through safely.

## Alternatives

Keep extending target-loop APIs directly.

This would keep short-term changes smaller, but every new scenario would duplicate state, approval, retry, and observability rules.

Adopt a generic external agent framework as the runtime.

This would improve general multi-agent scheduling, but EvoPilot needs product-native release governance, CI/CD evidence, approval, audit, and project lifecycle semantics. External frameworks can be executors, not the control plane.

## Consequences

EvoPilot can now model long tasks independently of a specific release or maturity target. Codex, IM adapters, schedules, runtime signals, evolution batches, and release goals can all create loop runs.

The runtime is still intentionally conservative: it does not pretend to execute arbitrary unsafe actions without approval, and it does not replace concrete executors such as code-upgrader or Jenkins. It records and governs their collaboration.

## Validation

Use:

```bash
npm run loop-runtime:check
npm run loop:soak
```

The gate verifies executor graph creation, loop creation, start/resume, approval blocking, timeline, evidence, artifacts, heartbeat lease, watchdog, repeated-failure blocking, conversation command loop creation, worker-driven loop advancement, sandbox workspace creation, and IM webhook loop creation.
