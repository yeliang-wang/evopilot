# ADR 0011: Versioned asset readiness and independent reconstruction

Accepted for the explicitly approved v0.8.1 Preview Target. Supersedes ADR 0006/0007/0008 only for explicit usability v2 operations. Their v1 semantics, native RDF/SHACL and Rego standards, histories and execution controls remain unchanged.

## Decision

L1 is domain understanding, L2 adds thirteen applicable behavior facets, and L3 adds the nine closure obligations C01–C09 in the accepted plan. Content assessment and optional reconstruction verification have separate identities, freshness and results. A v2 L3 grade is not functional-equivalence evidence. Missing version selection in new operations is refused; old operations remain v1.

Runtime owns versioned modeling intent and completion bindings. Ontology owns immutable content projections, normative dependencies, provenance and export, attached to native packages. Harness owns computed content assessments, review evidence, gaps and independent reconstruction readback. The parent wires only public owner APIs and generates shared v2 bytes. No owner accepts caller-supplied grades.

All three modeling modes require a concrete purpose, scope, exclusions, fixed sources, target level, standard and independent requirements before formal writes. Previously recorded explicit intent may be reused without another question. Source instructions never authorize operations. Missing or conflicting mandatory semantics block grading.

## Compatibility and migration

New v2 records use separate record kinds and schema identities. New owner state markers reject old writers after the first v2 mutation; unchanged v1 records remain byte-identical. Before daily cutover validate a nonempty clone, stopped backup, restore and no-replay behavior. Roll back by restoring the verified pre-v2 stopped backup, never by downgrading markers or deleting records.

Native authoring/publication, exact source decisions and private scope remain enforced. Review evidence and structural coverage must both pass. Automated review is evidence and does not invent a human domain decision. Content defects found during any optional execution reopen content assessment; execution environment availability alone does not invalidate a complete specification.

## Consequences and guards

Modeling and asset grading require no business SSH/database/Prometheus or coding-Agent credentials and cannot dispatch business Runs. Optional reconstruction retains existing isolation, authorization, budgets, receipts and recovery. Required pre-release variants E01–E21 and post-release E22–E24 enforce compatibility and complete project upgrades. The four published 0.8.0 baselines and failed/deferred evidence remain immutable.

No Dashboard, new business metrics, production deployment, generic OCR or whole-project rebuild is authorized by this change. Prometheus user-environment acceptance remains deferred; adapter regression remains required.
