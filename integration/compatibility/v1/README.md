# Canonical compatibility v1

reference.mjs is the ONE canonical wire and small shared data helper module, byte-pinned by manifest.json. CONTRACT_REVISION remains 1.0.0 independently of specVersion v1. References retain exactly product/id/version/specVersion/digest/visibility; products are ontology|harness and versions are strict SemVer core. No product business engine belongs here.

Shared exports provide descriptor-safe finite acyclic JSON checks, stable serialization (sorted object keys, ordered arrays), SHA256 of serialized JSON, frozen clones and common envelope/provenance/dependency/extension validation. Accessors, symbols, cycles, nonfinite numbers and sparse arrays fail. Dependencies bind exact references; duplicates and private-to-public boundaries fail.

Source statuses are design-proposed/design-confirmed/source-observed/inferred/runtime-observed/human-reviewed/synthetic; none grants approval. Both forward and reverse provenance require exact explicit sources. No automatic promotion occurs.

Extensions are additive data. local.notes@1.0.0 validates annotation text and optional language; unknown optional extensions remain NOT_EVALUATED, unknown required ones are rejected. No caller-supplied arbitrary support registry or executable extension exists.

Independent children receive identical generated vendor bytes. In a source checkout, the operator runs `npm run build` separately, then tests; `node scripts/sync-contract.mjs --check` verifies pins without refreshing them. Products import only their own copies and own source.

Informational implementation status: the independent products provide persistent storage and retained operation receipts. Current E01–E19 and product/Host acceptance status is controlled by the separate exact candidate-bound report and its real evidence; see [report verification](../../../docs/testing.md). Without that report, no acceptance claim is made. This status text is not the normative manifest pin and grants no release authority.
