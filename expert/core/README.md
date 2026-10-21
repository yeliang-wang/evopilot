# Unified Expert core

The Expert is pure guidance served by the existing `evopilot_v01_guide` MCP tool; it has no process or business state store. The stable `v01` tool/skill identifiers also serve the v0.6.0 candidate; inspect the installed identity to determine its actual version. Each installed MCP server namespace is derived from its configuration path, independently of these stable tool names.

`guide.ts` supplies 19 current journeys: five V06 response journeys, five V05 online journeys, three V04 feedback/review/recovery journeys and six V03 journeys for native standards, independent project scope, actual collection and complete acceptance. Their E2E bindings are explicit. `scenarios.ts` retains the historical catalogue of 27 v0.2 use cases. Requests for those IDs are marked `historicalReadOnly` and routed to the current guide; they do not enable retired JSON, classification or Catalog writes. Read [all scenarios](../../docs/expert-scenarios.md) for the user-facing map.

Runtime owns projects, Goals, execution and decisions; Harness owns quality assets, online evidence and reviewed response guidance/problems; Ontology owns semantics and the optional operations vocabulary. Private Target/Loop documents link those native records. The current response APIs validate exact campaign references without treating them as observations or approvals. Product schemas and service documentation govern payloads. Guide output never grants approval or release authority.

`acceptance.ts` validates external candidate-bound scenario evidence completeness and file hashes. Even COMPLETE returns `acceptance: NOT_EVALUATED`, `authority: false` and `releaseAuthorized: false`: a reviewer must compare actual product/Host observations against the scenario. Synthetic automated fixtures cannot establish real Desktop behavior.

Keep canonical and plugin-packaged Codex SKILL.md and agents/openai.yaml byte-identical. Tests enforce this distribution invariant separately from runtime behavior and real Host acceptance.

Use [native workflow](../../docs/native-workflow.md), [online Harness](../../docs/online-harness.md) and [response linkage](../../docs/response.md) for current work. The historical acceptance verifier remains separate; its 27-scenario denominator is not current release acceptance. The [v0.6 Target](../../governance/response-v06.json) requires its own exact candidate, cross-owner, recovery and real Host evidence.
