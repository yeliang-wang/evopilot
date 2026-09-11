# Agent-Native Recovery

Runtime persists Lifecycle revisions, active pointers, bindings, runs, pending executions, receipts, trajectories, evidence, recovery history, and audit outside Agent conversation history. Restart resumes from those objects.

Deterministic mechanics and proven transient or reversible failures may repair, retry, reconcile a matching receipt, and continue within declared budgets. Duplicate exact receipts are idempotent. A changed request, binding, idempotency key, effect set, or receipt is a conflict, not a retry.

Runtime stops only when an owning-human decision is required, state cannot be resolved safely, an effect is destructive or outside authority, or the recovery budget is exhausted. Evolution Expert presents the exact object, evidence, options, and consequences through MCP; it cannot manufacture the decision.

An operator can use HTTP, CLI, CI, or headless MCP for diagnostics and recovery if Expert is unavailable. This is an administrative path and must not be presented as a silent ordinary-human fallback.
