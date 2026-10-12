# Canonical compatibility v1

reference.mjs is the ONE canonical wire and small shared data helper module, byte-pinned by manifest.json. CONTRACT_REVISION remains 1.0.0 independently of specVersion v1. References retain exactly product/id/version/specVersion/digest/visibility; products are ontology|harness and versions are strict SemVer core. No product business engine belongs here.

Shared exports provide descriptor-safe finite acyclic JSON checks, stable serialization (sorted object keys, ordered arrays), SHA256 of serialized JSON, frozen clones and common envelope/provenance/dependency/extension validation. Accessors, symbols, cycles, nonfinite numbers and sparse arrays fail. Dependencies bind exact references; duplicates and private-to-public boundaries fail.

Source statuses are design-proposed/design-confirmed/source-observed/inferred/runtime-observed/human-reviewed/synthetic; none grants approval. Both forward and reverse provenance require exact explicit sources. No automatic promotion occurs.

Extensions are additive data. local.notes@1.0.0 validates annotation text and optional language; unknown optional extensions remain NOT_EVALUATED, unknown required ones are rejected. No caller-supplied arbitrary support registry or executable extension exists.

Independent children receive identical generated vendor bytes. The operator runs npm run build separately, then tests; sync-contract --check verifies pins without refreshing them. This source edit does not generate vendors. Products import only their own copies and own source. E01–E19, persistent operations and release authority remain pending.
