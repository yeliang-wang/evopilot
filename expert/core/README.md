# Unified Expert core

Maintain the pure scenario guide in `guide.mjs`. The parent MCP serves it through `evopilot_v01_guide`; Expert has no process or state store.

Scenarios: onboarding routes the user's intent; ontology-forward proposes a domain model; ontology-reverse derives from authorized evidence; harness-quality evaluates rules and missing evidence; runtime-handoff separates goal, pins, review, decision and dispatch; recovery reads receipts; retained-ontology routes advanced owning capabilities.

Runtime owns execution and decisions, Harness owns quality assets/evaluation, Ontology owns semantics and retained operations. Current child package schemas and service documentation govern payloads. A guide never grants approval or release authority.

Keep canonical and plugin-packaged Codex SKILL.md and agents/openai.yaml byte-identical. Plugin tests check this distribution invariant, not human decision validity or Host acceptance.
