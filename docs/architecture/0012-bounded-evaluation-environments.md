# ADR 0012: independently bounded evaluation environments

Status: accepted boundary correction; implementation and acceptance evidence remain required. Replaces ADR 0011 only for a newly reviewed evaluation phase. Generation/build authority and historical v1/v2 contracts retain their meanings. This is a v0.8 correction supporting mandatory whole-project behaviors, not a v0.9 analysis feature or a general remote execution platform.

## Decision

Add separate exact evaluation plan, authority and receipt types. A trusted installed resolver binds a completed reconstruction output to an independently fixed oracle and evaluation environment. A provider registration, caller-supplied JSON or valid signature alone does not admit execution. The owning Runtime must verify actual authority, scope, policy/version, exact source/output/dependency bindings and finite budgets before reserving a claim.

The generated program and the hidden oracle remain in separate contexts. Original implementation and previous generated solutions remain forbidden. During generation/build, the current policy continues to deny external services, unrelated local peers and host credentials. Authenticated model transport retains its separate preexisting trust boundary.

Evaluation is disabled by default. Its authority is an explicit union of two narrowly implemented dependency types; unknown types are rejected:

1. Owned supervisor: an exact current OS user/domain, derived per-workspace job label, canonical private root, pinned executable and candidate worker entry, exact plist digest, nonce, and inspect/bootstrap/bootout/reconcile allowlist. Broker calls contain structured parameters, never arbitrary executable/argv strings. Admission proves the label is absent or already belongs to the original exact claim; foreign jobs, status/plist drift, unrelated process signaling and implicit adoption fail closed. Supervisor-owned processes must remain sandboxed. A candidate must not use the supervisor to escape the evaluator's filesystem/network/credential restrictions. Do not enable this mode unless that containment is actually proven on the selected host.

2. Bound database: exact service/driver/route/namespace identity and private credential reference, an independent allowlist of fully scoped statements and bounded typed parameters, exclusively owned object identities, result/row/concurrency/time/connection limits and exact cleanup obligations. Secrets stay in the trusted broker. Candidate JDBC uses a declared, pinned transparent evaluation transport; reference and candidate must pass the same transport conformance checks. The broker may perform only the reviewed statements through the pinned upstream driver. It must not implement original DataRig business behavior or return prerecorded database answers. Metadata, schema, parameter, comment/quoting, multi-statement and route escapes fail closed. No arbitrary SQL forwarding, environment-wide shell, redirects, unrelated routes, privileges, users, CREATE/DROP DATABASE or preexisting-object adoption.

Keep supervisor and database modes distinct. A project requiring neither receives neither. Evaluation admission does not expand project scope or authorize source upload, production actions, assets or a software release.

## Evidence and recovery

Bind evaluation policy and environment/dependency manifests to the oracle, generation claim/receipt, exact output digest and each actual evaluation session. Record actual external access and owned effects; never attest full network denial after database access. Independent observations include outputs, persisted states, errors and side effects with the frozen denominator and tolerances. Incomplete cleanup, unknown usage, stale identity or partial observations cannot satisfy L3.

Reserve all resources before execution. Retain original claim/session IDs on transport loss or cancellation. Reconcile current owned jobs, exact statements/receipts and cleanup state without replaying generation or uncertain SQL. Unknown database outcomes are UNKNOWN, not assumed rollback. Exhausted budgets require a new exact reviewed plan; old usage is immutable. Cleanup can target only manifest-owned objects with matching claim provenance and must not adopt colliding objects.

## Owner boundaries and persistence

The parent generates additive shared TypeScript contracts and transport wiring. Runtime owns plans, claims, protected providers, budgets, cancellation and receipts. Harness checks fixed observations, negative controls and currentness; it cannot grant execution authority. Ontology maintains existing semantics and package boundaries. Assets do not embed credentials or an executable evaluator.

Use new versioned evaluation envelopes and owner state marker 9 when persisting new records. Marker 7/8 histories, v1/v2 JSON, source identities and prior grades remain immutable. Exact migration/backup/restore and explicit old-writer refusal are prerequisites to daily cutover. An old reader may inspect historical copies only where its existing contract supports that; it cannot silently drop new evidence.

## Alternatives

Dropping worker/database behavior would reduce the accepted whole-project denominator and is rejected. Running arbitrary generated software with current Host credentials or unrestricted network is rejected. A fully isolated OS/database deployment may satisfy the same goals later, but no available such deployment has been validated here; it must not be assumed to exist. A fake supervisor or canned JDBC response can calibrate a transport but cannot replace the mandatory actual integration acceptance.

## Delivery conditions

The explicit user decision accepted this boundary correction and its implementation. Apply the formal Roadmap correction and all guards. Prove both the OS containment and the statement/object gateway before real candidate evaluation. Prepare exact semantic candidates, original/candidate environment profiles, fixed oracles, object inventory, resource budgets and cleanup plan for one combined execution review. Require two independent complete reconstructions for each full project, preserve all earlier obligations, and obtain actual final acceptance and release evidence. This ADR does not declare any of those results complete.
