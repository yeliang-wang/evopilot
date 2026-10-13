# Unified Expert core

The Expert is pure guidance served by the existing `evopilot_v01_guide` MCP tool; it has no process or business state store. The stable `v01` tool/skill identifiers remain compatible in v0.2.0.

`scenarios.ts` is the canonical catalogue of 27 v0.2 use cases: prerequisites, example requests, real operation names, expected results, preserved state, automated test bindings and required Desktop observations. `guide.ts` serves those IDs and the seven compatible guide groups. Read [all scenarios](../../docs/expert-scenarios.md) for the user-facing map.

Runtime owns projects, Goals, execution and decisions; Harness owns quality assets/evaluation; Ontology owns semantics and retained operations. Private Target/Loop documents link those native records without inventing new service APIs. Product schemas and service documentation govern payloads. Guide output never grants approval or release authority.

`acceptance.ts` validates external candidate-bound scenario evidence completeness and file hashes. Even COMPLETE returns `acceptance: NOT_EVALUATED`, `authority: false` and `releaseAuthorized: false`: a reviewer must compare actual product/Host observations against the scenario. Synthetic automated fixtures cannot establish real Desktop behavior.

Keep canonical and plugin-packaged Codex SKILL.md and agents/openai.yaml byte-identical. Tests enforce this distribution invariant separately from runtime behavior and real Host acceptance.
