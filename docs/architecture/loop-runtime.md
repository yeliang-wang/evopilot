# EvoPilot Loop Runtime

## Status

Accepted

## Context

Loop Engineering requires more than a single agent call. EvoPilot must keep long-running tasks alive across iterations, validate each round independently, persist evidence and artifacts, decide whether to continue or stop, recover from worker interruption, and hand high-risk steps to human approval.

The target product shape is:

- Sandbox: executor boundaries for LLM, code upgrade, CI, validation, approval, and release action.
- Context: durable loop state, artifacts, evidence, and cross-iteration timeline.
- Harness: API control plane, policies, approval, audit, and watchdog.
- Loop: repeated decision cycle with stop, retry, backoff, circuit breaker, and remediation decisions.

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
