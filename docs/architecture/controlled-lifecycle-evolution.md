# Controlled Lifecycle Evolution Architecture

Runtime 6.1.0 adds a project-neutral domain over the v6 Agent-native Lifecycle control plane. It does not replace the Harness-guided Goal Target Loop: every experiment and resulting run continues to bind an externally published immutable HarnessBundle and a resolved Lifecycle revision.

## Ownership

| Owner | State and decisions |
| --- | --- |
| Runtime | Observations, classifications, successor proposals, experiment reports, active PolicyPack checks, activation decisions, monitoring decisions, receipts, audit, and durable resume. |
| Project resources | ProjectDefinition, Lifecycle, PolicyPack, GovernancePack, ActionProviderDefinition, EnvironmentBinding, ReleaseChannelBinding, SecretRef, HumanAuthorityRole, and AgentRuntimeProfile revisions. |
| Evolution Expert | Stateless progressive-disclosure guidance and presentation of Runtime MCP facts and exact decision frames. |
| External Agent Runtime | Executes only a qualified digest-bound pending request inside the declared sandbox and effects. |
| `evopilot-harness` | Harness reasoning, authoring, review, approval, Catalog publication, and immutable HarnessBundle authority. |
| Source Suite | Read-only provenance evidence only; never a Runtime dependency or fallback. |

## Invariants

- Project Pipeline revisions are independently versioned and normally require no Runtime or Expert release.
- Successor creation never mutates the active pointer.
- Activation changes only future planning; bound runs retain exact Lifecycle and HarnessExecutionBinding digests.
- Pairwise experiment aggregation requires identical governed context; mismatches remain stratified.
- Safe automatic activation requires an exact active declarative policy and every fail-closed predicate.
- Semantic and authority changes stop at a Runtime-owned digest-bound human decision.
- Rollback is deterministic, receipt-bound, idempotent, and cannot replay an uncertain mutation.
- Missing public capability creates a review-only generic Target; no project-specific Core branch is allowed.
- Tenant/workspace isolation, immutable provenance, SecretRef-only credentials, and external Harness authority remain mandatory.

The pure domain contracts live in `packages/core/src/controlled-lifecycle-evolution.ts`. Tenant/workspace persistence is in `packages/server/src/domains/governed-evolution/service.ts`; HTTP and MCP are adapters over the same semantics.
