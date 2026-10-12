# ADR 0001: Isolated three-product EvoPilot 0.1

Status: accepted by the user in the implementation plan. Applies to the new project only; old repositories are unchanged.

Runtime owns projects, execution, decisions, credentials and audit. Harness owns delivery and quality standards, evaluation and immutable Harness packages. Ontology owns concepts, relationships, constraints, evidence mapping, semantic modeling, builds and immutable ontology packages. Harness consumes pinned ontology references read-only. All ontology producer surfaces formerly within Harness migrate to Ontology; shared or mixed modules require ownership-level extraction, not deletion by keyword.

The parent pins independent Git submodules, an Expert, a Codex plugin and compatibility contracts. It is not a fourth business service. Expert guides; Codex calls product MCP servers. Runtime may use a shared local service; Harness and Ontology start on demand. Initialization and discovery do not create business objects. Persistent operations use idempotency and version checks; unknown outcomes are inspected before any retry.

Actual user assets live outside source repositories in one workspace with public and private roots. Private project assets never enter published code or fixtures. Two product-owned specifications/v1 provide a minimum standard and controlled extensions; future validators retain pinned old semantics.

Compatibility: keep old installation and data read-only; imports preserve provenance and do not inherit approval. Current Codex only; no WorkBuddy scope. Local acceptance is distinct from future GitHub creation or release.
