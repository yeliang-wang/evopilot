# Agent-Native Security Boundaries

Runtime 6 uses deny-by-default boundaries:

- Lifecycle YAML is declarative and cannot contain arbitrary code, shell, hidden executable prompts, raw secrets, or unknown actions.
- Credentials are `SecretRef` identifiers. Values remain in the owning Host or credential system.
- External execution requires a qualified Agent Runtime, exact request digest, fixed sandbox, declared capabilities, and allowed effects.
- Returned effects must be a subset of the request. Receipt, request, binding, and idempotency identities must match exactly.
- Tenant/workspace identifiers scope Registry, runs, evidence, usage, and audit.
- Harness assets are read-only in EvoPilot; authoring and publication stay in `evopilot-harness`.
- Conversation, readiness, successful tests, or parameter entry never imply semantic, credential, database, production, destructive, acceptance, publication, or Release authority.

Automatic recovery is bounded to deterministic or proven safe/reversible classes. Unknown semantic choices, missing authority, unresolved external state, exhausted budgets, destructive effects, and uncertain mutations without a matching receipt stop at an exact human decision.
