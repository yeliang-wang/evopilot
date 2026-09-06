# Migrate the v3 Maturity Ladder

EvoPilot v4 does not reinterpret historical Alpha, Beta, RC, or GA evidence. Existing plans remain readable and authoritative under their v3 schemas.

The compatibility definition [`v3-alpha-beta-rc-ga.yaml`](../../lifecycles/compatibility/v3-alpha-beta-rc-ga.yaml) represents the old order explicitly. A migration creates a new `LifecycleBinding` that references the existing Goal and Target identifiers and records before/after digests. It must not edit historical Goal plans, approvals, release actions, evidence packages, or Harness Catalog assets.

Safe migration procedure:

1. export and digest the existing goal, targets, phase packages, approvals, release actions, and evidence;
2. resolve `v3-alpha-beta-rc-ga@1.0.0` with the existing project and release target;
3. bind the same published immutable HarnessBundle used by the goal plan;
4. record a separate digest-bound plan authorization for the compatibility run;
5. resume through `evopilot.goal-loop@1` requests while retaining the original identifiers in receipts;
6. verify authority and evidence equivalence before accepting the representation.

Rollback deletes or archives only the new compatibility `LifecycleRun` representation. It restores no files and rewrites no v3 state because the original state was never mutated. Publication and release authority remain exactly as recorded in v3.
