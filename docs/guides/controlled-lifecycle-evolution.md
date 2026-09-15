# Controlled Lifecycle Evolution

Runtime 6.1.0 can evolve a project's declarative Pipeline from exact execution evidence, evaluations, monitoring, and user feedback without turning a source Suite or project name into Runtime code. Evolution Expert 2.1.0 is the ordinary-human MCP interface; Runtime remains the only source of truth.

## Closed loop

```text
exact evidence or user feedback
  -> immutable Observation
  -> deterministic Gap Classification
  -> immutable Lifecycle Successor Proposal
  -> comparable Champion/Challenger experiment
  -> active PolicyPack decision
  -> future-run activation or exact human boundary
  -> declared health monitoring
  -> retain or idempotent rollback
```

An Observation binds the tenant, workspace, ProjectDefinition, LifecycleRevision, HarnessExecutionBinding, published HarnessBundle, GoalTarget, Runtime, Host, Provider, environment, authority, evaluator, scorer, and evidence digests. User conversation can supply a signal or explanation, but cannot supply approval.

Classification routes an ordinary project Pipeline change to a new independently versioned Lifecycle or governed resource. If the requirement cannot be represented with a project-neutral public primitive, Runtime creates a review-only Runtime or Expert Target proposal and blocks unsafe activation. It never creates a hidden DataRig, EvoPilot, Harness, package-manager, database, or Host branch.

## Comparison and decision

Champion and Challenger results are pairwise only when the governed task and every context digest are identical. Any mismatch is retained as stratified evidence with no mixed score or recommendation.

Automatic activation is allowed only when the exact active PolicyPack already preauthorizes the gap class and every predicate passes: backward compatibility, reversibility, no destructive or public effect, no new authority, no production/database/credential/acceptance/publication/release change, verified rollback, comparable Challenger evidence, bad-case closure, and canary evidence. The pointer change affects future planning only; active runs keep their original immutable bindings.

Semantic, policy, credential, database, production, destructive, acceptance, publication, deployment, and Release changes produce one digest-bound human decision frame. Readiness, successful tests, recommendations, and conversational agreement never become authority.

## Monitoring and rollback

Monitoring consumes ordered declared signals. A known degradation threshold can trigger a deterministic rollback to the retained Champion revision. The rollback uses an immutable decision digest and idempotency key; a duplicate is suppressed, while unknown health or an uncertain prior mutation stops for exact review. No active run is rebound.

## DataRig 2.1.11 reference

[`datarig-production-delivery-v1.json`](../../examples/governed-evolution/datarig-production-delivery-v1.json) is generated from the exact read-only DataRig Suite 2.1.11 inventory. It covers all 20 capability items and the digests of 90 critical plus 8 advisory files. [`datarig-production-delivery.yaml`](../../lifecycles/reference/datarig-production-delivery.yaml) is an independently versioned example Pipeline. Neither file invokes, modifies, synchronizes, disables, or retires the installed Suite.

Run the deterministic reference check with:

```bash
npm run production-reference:datarig-211:check
```

Compatible future revisions such as `datarig-production-delivery@1.0.1` change project resources only. Runtime or Expert versions change only when a genuinely project-neutral public contract or interaction behavior changes.
