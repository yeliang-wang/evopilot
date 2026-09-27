# Evolution Expert Changelog

All notable changes to the independently versioned `@evopilot/evolution-expert` package are documented here. Runtime and Expert versions are compatible by declared ranges; they are not released in lockstep.

## Unreleased

### 2.3.0 Semantic Convergence (source development)

- Reject nested raw credential fields in typed Lifecycle answers before MCP
  invocation, consistently with project and governed guidance.
- Added persisted observation classification/readback and immutable successor
  inspection guidance for controlled lifecycle evolution and restart recovery.
- Fixed remaining governed guidance requests losing their bodies at public MCP:
  observations, successors, experiments, monitoring, inventory, planning, run
  creation and recovery now use finite field projection. Runtime continues to
  validate stored bindings, policy, scope and authority. Read-only LLM guidance
  also rejects transport overrides, and new intents cannot fall back to raw input.
- Help/tutorial and supplied acceptance, Cutover and release context now render
  valid non-authorizing interaction messages. Recovery collects explicit budget
  and effect facts before calling Runtime. Source-process tests cover persistence,
  missing bindings, permission refusal and response loss without replay.

- Added finite Runtime-owned semantic onboarding, compatibility, gap, authoring,
  execution and recovery guidance in one Core v3 and five generated adapters.
- Defaulted public self-checks to Runtime 6.3.0 while preserving explicit legacy
  6.2.0 non-semantic compatibility and retaining the 2.2.1 recovery obligations.
- Projected the maintained Host Integration and artifact verifiers to 2.3.0/6.3.0.
  Exact artifact, Host and series acceptance remain pending; no publication claim.
- Fixed English `deactivate lifecycle` being routed to activation by substring
  matching. Activation and deactivation retain separate Runtime tools and exact
  decision requirements; bilingual per-operation source regressions cover both.
- Fixed flat Lifecycle SDK inputs losing their body fields at the public stdio
  MCP boundary. Finite projection separates route/query fields from `payload`
  and rejects undeclared fields without transferring authority to the adapter.
- Added explicit read-only Lifecycle diff, resolution and input-resolution
  guidance. Local process integration covers Runtime persistence, permissions,
  immutable existing-run bindings and uncertainty without automatic replay;
  installed Candidate and real Host acceptance remain pending.

- Fixed project-definition bodies being dropped by public stdio MCP. Added
  Runtime-owned discovery, list, inspect and diff guidance with finite inputs.
- Separated project rollback from revision registration. Explicit activation and
  rollback carry the reviewed definition digest, expected current definition and
  matching decision evidence; conflicts stop before changing the pointer.

- Added explicit Runtime project connection preflight, registration, scoped
  reads and readiness guidance after declarative setup. Nested credentials and
  scope overrides are refused before MCP; connection never implies a Goal run.

### 2.2.1

- Fixed public `doctor` and `compatibility` to use the generated adapter's complete capability declaration and default Runtime 6.2.0.
- Added fail-closed CLI checks for unsupported/malformed Runtime versions and unknown packaged Hosts; SDK Host extension remains supported.
- Corrected public release verification to Core v3, with accepted-byte equality, five-adapter CLI regression and tamper rejection.
- Added an Expert-only build path using the unchanged published Runtime contract. Candidate acceptance and publication are still pending.

### 2.2.0

- Added MCP-first first-run Runtime LLM readiness setup, status, degradation, repair, and v6.1 migration guidance.
- Refused raw credentials in conversation and required Host-native secure input with SecretRef-only Runtime operations.
- Distinguished Host LLM, Runtime governed LLM Profile, and external Agent Model across generated Host adapters.
- Raised Runtime compatibility to `>=6.2.0 <7.0.0` and Human Interaction Protocol to 2.2.

### 2.1.0

- Added guided read-only production-reference discovery and complete capability-disposition review for DataRig Suite 2.1.11 and future source snapshots.
- Added observation, gap classification, immutable Lifecycle successor, complete semantic diff, comparable Champion/Challenger, bad-case closure, safe activation, monitoring, deterministic rollback, and generic-primitive Target journeys.
- Kept policy-preauthorized automation distinct from semantic and authority decisions, with no inferred approval, mixed non-comparable evidence, Suite invocation, active-run rebinding, uncertain replay, or project-specific Core branches.
- Regenerated Codex, Claude Code, designated-human WorkBuddy, generic Agent, and generic MCP bundles from one Core for Runtime `>=6.1.0 <7.0.0`.

### 2.0.0

- Made Expert-over-MCP the ordinary-human entry for Runtime 6 while preserving administrative and machine recovery surfaces.
- Added complete Lifecycle Registry guidance and qualified external Agent Runtime progress/receipt explanation.
- Added generated Codex, Claude Code, designated-human WorkBuddy, generic Agent, and generic MCP Host Integration Bundles with package lifecycle metadata.
- Added protocol 2.0 compatibility, Runtime-state resume, exact authority presentation, and no direct source-execution or CLI/HTTP ordinary-human fallback.

### 1.1.0

- Added source Suite versus resource/Runtime/Expert/Harness version guidance.
- Added capability inventory, migration, shadow, Cutover-readiness, and rollback journeys generated from the same Agent-neutral Core.
- Preserved thin Host adapters, headless Runtime equivalence, and zero legacy Suite fallback.

## 1.0.1 - 2026-09-10

### Fixed

- Added executable version, compatibility doctor, side-effect-free tutorial, and Runtime interaction rendering commands.
- Added complete Codex, WorkBuddy, generic Host, and MCP install, verify, upgrade, rollback, removal, and clean-reinstall guidance.
- Bound project onboarding and adjustment to Runtime-owned discovery and impact objects instead of an Expert-owned form.
- Added exact completion-contract validation; Candidate and Host acceptance remain pending until separately authorized.

## 1.0.0 - 2026-09-08

### Added

- Added an Agent-neutral interactive Expert Core for guided project onboarding, Harness and Lifecycle explanation, Goal Target Loop progress, evidence inspection, recovery, acceptance readiness, and release readiness.
- Added generated Codex, WorkBuddy, generic Agent, and generic MCP adapters bound to the same Core and Runtime-owned Human Interaction Protocol.
- Added side-effect-free tutorials, contextual documentation routing, schema-driven questions, durable Runtime resume, and version-aware compatibility reporting.
- Added an independent private Candidate workflow, package-only SBOM and provenance, checksums, exact Target binding, and immutable Candidate handoff.
