# Token usage and execution limits

Runtime 6.3.1 reports input, output and total tokens when a provider or native Agent reports them. Users may supply their own LLM profiles; model pricing and monetary budgets are not product setup requirements. An acceptance campaign may separately track its own expenses without configuring a Runtime monetary cap.

## Native execution observations

`evopilot-agent-process-observation/v2` binds reported token usage to the exact request, adapter profile, route, invocation, process result and source observation. Its `usage` object contains `inputTokens`, `outputTokens`, `cachedInputTokens` and `tokenCoverage`. Complete coverage requires nonnegative integer input and output counts. Unavailable counts are null. Cached input is a subset of input, not an additional token total.

V2 results omit `cost`. Complete token-only receipts contribute to token totals even when no monetary amount exists. Mixed v1/v2 aggregates omit monetary totals unless every measured observation supplies a valid legacy amount. Missing tokens never become zero. Failed or uncertain dispatch usage remains visible without granting completion, retry or release authority.

Existing v1 monetary receipts are immutable and remain readable. New native adapters negotiate v2 through `processObservationSchema`; v1 adapters remain compatible. No project or Host-specific executor is built into this contract.

## Removed monetary behavior

`EVOPILOT_LLM_COST_PER_1K_TOKENS_USD` has no execution effect. New LLM steps do not infer `costUsd`. Legacy `maxCostUsd` and `maxBudgetUsd` inputs no longer create limits; newly emitted guardrails and schedules omit them. Retained cost-report endpoints present historical observations with status `OBSERVED` and never freeze evolution or participate in governance, readiness or rollout decisions.

Token count, elapsed time, changed-file, retry, source, RBAC, workspace and human decision requirements continue to apply. Removing monetary limits does not authorize a task or weaken its source restrictions.
