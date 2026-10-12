# Local process topology

M0 verified the technical direction below. The final Runtime, Harness and Ontology engines are not implemented by this M1 foundation. E01–E19 remain PENDING; in particular E14–E16 require the final real candidate.

Codex currently starts a separate stdio adapter for each conversation. Runtime will explicitly start or reuse a shared detached loopback service for the canonical workspace. Harness and Ontology are loaded on demand and protect their own transactions and locks. The parent distributes compatibility material and has no business state. Imports, initialization and capability inspection must not mutate business state.

Readiness must bind the exact product identity, version and canonical workspace path before reuse. Private authentication material must never appear in health responses. Startup failures must be bounded and actionable; an unknown PID must never be killed. Diagnose stale locks using ownership and process evidence instead of deleting them blindly. After an uncertain response, read the retained receipt before any retry; uncertainty does not authorize redispatch.

M0 evidence includes distinct MCP processes in two real Codex conversations, read-only inspection followed by explicit activation, zero product operations, shared-service concurrency, receipt and restart checks, and detached starter exit. A portable contract was exercised by two consumers under Node permissions denying original source reads. An offline three-submodule clone was verified. These feasibility results are not release authority or final product E2E completion.

See [M0 evidence descriptors](../../governance/m0.json) and the [frozen reference contract](../../integration/compatibility/v1/README.md).
