# EvoPilot Documentation

EvoPilot documentation is organized by reader task. Start from the section that matches what you need to do.

## New Users

- [Quick Start](quickstart.md) - install, run locally, and verify the API.
- [Self-Hosting](operations/self-hosting.md) - run the API server, loop worker, code-upgrader, Postgres, and standalone Dashboard.
- [Distribution](operations/distribution.md) - GitHub Release CLI tarball, manifest-verified installers, Helm chart entry points, and post-publish npm verification.
- [Control Plane User Guide](guides/user-guide.md) - operate projects, credentials, goals, loops, releases, and audit through API/CLI semantics.
- [Published Harness Catalog](architecture/published-harness-catalog.md) - EvoPilot v3 read-only consumption of Harness definitions published by `evopilot-harness`.
- [Open Lifecycle Harness](guides/open-lifecycle-harness.md) - v4 development flow for declarative project lifecycles, interactive inputs, bounded authorization, and Agent-host execution.
- [Project Definitions](guides/project-definitions.md) - v5 project-neutral declarative onboarding and immutable adjustment.
- [Governed Resource Versioning](guides/resource-versioning.md) - independently versioned Packs, Providers, bindings, activation, diff, and rollback.
- [Suite Convergence Migration](guides/suite-convergence-migration.md) - exact latest Suite provenance, full capability disposition, shadow validation, and post-release Cutover boundary.
- [Evolution Expert](guides/evolution-expert.md) - ordinary-human conversational entry for Codex, Claude Code, WorkBuddy, generic Agents, and MCP Hosts.
- [Lifecycle Registry](guides/lifecycle-registry.md) - create, inspect, update, activate, deactivate, archive, restore, and roll back project Pipelines.
- [External Agent Runtime](guides/agent-runtime.md) - qualification, exact pending execution, receipts, effects, and recovery.
- [v6 Acceptance](operations/v6-acceptance.md) - exact installed-Candidate evidence and 100-percent completion semantics.
- [v5 Completion Assurance](operations/completion-assurance.md) - criterion-specific evidence, exact Candidate binding, impact closure, and 100% hard-gate semantics.

## AI Agents And CLI Automation

- [Repository Agent Instructions](../AGENTS.md) - root instructions for AI agents reading this repository.
- [CLI Agent Instructions](cli/AGENTS.md) - shortest WorkBuddy-safe reading path and non-negotiable CLI rules.
- [CLI Quickstart For AI Agents](cli/quickstart.md) - minimal production-safe command sequence.
- [CLI](cli/README.md) - install and connect the EvoPilot CLI to a remote control-plane server.
- [CLI Workflows](cli/workflows.md) - one-command Goal/Loop scenarios with plan approval, Alpha/Beta/RC/GA phase packages, project DevOps, and project LLM profile selection.
- [CLI Commands](cli/commands.md) - atomic command reference.
- [CLI Automation](cli/automation.md) - WorkBuddy, Codex, Claude Code, and CI usage rules.
- [AI Agent Scenario Coverage](guides/ai-agent-scenarios.md) - scenario matrix for third-party AI Agent simulation and human operators.
- [AI Agent Runbook](guides/ai-agent-runbook.md) - end-to-end production operating flow and failure handling.
- [Published Harness Catalog](architecture/published-harness-catalog.md) - Catalog configuration, dynamic reads, and `selectedHarness` evidence.

## API And Dashboard Integrators

- [API Reference](api/README.md) - HTTP API behavior, LLM profiles, governance semantics, and examples.
- [OpenAPI Schema](api/openapi.json) - machine-readable API contract.
- [Dashboard Integration](guides/dashboard-integration.md) - contract for standalone Dashboard clients.
- Dashboard UI operation docs live in `yeliang-wang/evopilot-dashboard` under `docs/`.
- [Evidence Ingestion](guides/evidence-ingestion.md) - runtime, trace, evaluation, release, and feedback evidence.
- [Source To GA](guides/source-to-ga.md) - example project flow from source evidence to release decision.

## Production Operators

- [Self-Hosting](operations/self-hosting.md) - 15 minute Docker Compose path and upgrade/backup boundaries.
- [Deployment](operations/deployment.md) - production deployment, ECS/Kubernetes, auth, persistence, and logging.
- [Distribution](operations/distribution.md) - GitHub Release tarball packages, tagged installers, Helm chart release paths, and public npm post-publish verification.
- [Release Management](operations/release-management.md) - versioning, release notes, tag rules, rollback, and public release checklist.
- [Remediation Campaigns](operations/remediation-campaigns.md) - durable bounded repair, receipts, replacement Candidate lineage, circuit breakers, and exact human stops.
- [Deployment Assets](../deploy/README.md) - committed Docker Compose and Kubernetes deployment assets, plus production host-local file boundaries.
- [Runtime Assets](../runtimes/README.md) - runtime locks, code-upgrader boundary, SBOM, license, vulnerability, and validation evidence.
- [Runtime Management](operations/runtime-management.md) - runtime locks, worker operation, and runtime checks.
- [Testing](operations/testing.md) - local, functional, E2E, and release validation commands.
- [Test Matrix](operations/test-matrix.md) - failure recovery, release readiness, PR artifacts, and release gate evidence.
- [Troubleshooting](operations/troubleshooting.md) - common incidents and diagnostic commands.

## Repository Operators

- [Engineering Scripts](../scripts/README.md) - production runtime, verification, release, soak, real-boundary E2E, and maintenance script map.
- [Selected Harness Binding](reference/selected-harness-binding.md) - evidence fields AI Agents must report after planning.

## Architects And Reviewers

- [Product Roadmap](roadmap/ROADMAP.md) - accepted Agentic Evolution milestones, version direction, and Roadmap Gate change control.
- [Architecture](architecture/README.md) - architecture entry point.
- [Continuous Evolution Control Plane](architecture/continuous-evolution-control-plane.md) - product control-plane model.
- [Package Boundaries](architecture/package-boundaries.md) - TypeScript workspace ownership, transitional hotspots, and verification rules.
- [Published Harness Catalog](architecture/published-harness-catalog.md) - split boundary between `evopilot-harness` publication and EvoPilot execution.
- [Open Lifecycle Harness Architecture](architecture/open-lifecycle-harness.md) - v4 lifecycle resources, Action Registry, decision economy, and Goal Loop bridge.
- [Harness-Guided Governed Evolution Runtime](architecture/harness-guided-governed-evolution-runtime.md) - v5 mandatory Harness binding, Lifecycle composition, recovery, and Host/runtime separation.
- [Suite Capability Convergence](architecture/suite-capability-convergence.md) - v5.1 DDD ownership, resource registry, provider, migration, and version boundaries.
- [Agent-Native Lifecycle Control Plane](architecture/agent-native-lifecycle-control-plane.md) - v6 DDD ownership across Host, Expert, Runtime, Lifecycle Registry, Harness, and external Agent Runtime.
- [Agent-Native Security Boundaries](security/agent-native-boundaries.md) - permissions, SecretRefs, authority, and fail-closed execution rules.
- [v6 Migration](migrations/v6-agent-native.md) - move from Suite-shaped operation to declaration-only project Pipelines without pre-release Cutover.
- [Action Providers](reference/action-providers.md) - typed external actions, qualification, SecretRefs, receipts, rollback, and authority intersection.
- [ADR 0003](architecture/adr/0003-harness-guided-governed-evolution-runtime.md) - accepted v5 architecture decision and product boundaries.
- [Legacy Codex Suite Transition](guides/legacy-suite-transition.md) - read-only pre-release snapshots, isolated independence proof, selective rerun, and separately authorized post-release Cutover.
- [v3 Lifecycle Compatibility](migrations/v3-lifecycle-compatibility.md) - evidence-preserving Alpha/Beta/RC/GA representation and rollback.
- [Loop Runtime](architecture/loop-runtime.md) - loop execution, continuity, and recovery.
- [ProofOps Target Loop Mode](architecture/proofops-target-loop-mode.md) - target-loop governance model.
- [Lifecycle](reference/lifecycle.md) - evidence-to-release lifecycle model.
- [Selected Harness Binding](reference/selected-harness-binding.md) - goal-plan evidence contract for the published Harness selected by EvoPilot.
- [Product Readiness](reference/product-readiness.md) - GA readiness review.
- [Open Source Maturity Report](reference/open-source-maturity-report.md) - public productization and top-tier gap assessment.
- [Production User E2E](reference/production-user-e2e.md) - production user validation evidence.
- [Release Package](reference/release-package.md) - SaaS GA release package.
- [EvoPilot v5.0.1 Completion-Recovery Notes](releases/5.0.1.md) - unreleased criterion-specific closure plan; Candidate, acceptance, and publication remain pending.
- [Evolution Expert v1.0.1 Completion-Recovery Notes](releases/evolution-expert-1.0.1.md) - unreleased independently versioned Expert implementation and later acceptance boundary.
- [EvoPilot v5.1.0 Suite Capability Convergence](releases/5.1.0.md) - superseded, unreleased implementation history retained for traceability.
- [Evolution Expert v1.1.0 Unified Host Entry](releases/evolution-expert-1.1.0.md) - superseded, unreleased Expert history retained for traceability.
- [EvoPilot v6.0.0 Agent-Native Lifecycle Control Plane](releases/6.0.0.md) - current unreleased implementation line.
- [Evolution Expert v2.0.0](releases/evolution-expert-2.0.0.md) - current unreleased MCP-first Host Integration Bundle line.
- [EvoPilot v5.0.0 Release Notes](releases/5.0.0.md) - published Harness-guided Runtime baseline and historical release facts; not proof of later-audited full-scheme completion.
- [EvoPilot v4.0.0 Release Notes](releases/4.0.0.md) - released Open Lifecycle Harness capabilities, distribution, migration, and completed acceptance.
- [EvoPilot v3.2.0 Deferred Candidate Notes](releases/3.2.0.md) - unpublished Bundle-consumer closure preserved as inherited v4 acceptance.
- [EvoPilot v3.1.0 Release Notes](releases/3.1.0.md) - multi-Catalog Harness Registry consumption and `selectedHarness` registry evidence.
- [EvoPilot v3.0.0 Release Notes](releases/3.0.0.md) - strict external Harness Catalog consumer boundary and `selectedHarness` goal-plan evidence.
- [EvoPilot v2.4.2 Release Notes](releases/2.4.2.md) - release-readiness closure, immutable ECS digest-only rollout hardening, and current distribution metadata.
- [EvoPilot v2.4.1 Release Notes](releases/2.4.1.md) - AI Agent scenario coverage, Harness evolution operating docs, CLI help consistency, and production asset verification notes.
- [EvoPilot v2.4.0 Release Notes](releases/2.4.0.md) - one-command Harness evolution, source-driven template review drafts, CLI/API contract, and Dashboard compatibility notes.
- [EvoPilot v2.2.0 Release Notes](releases/2.2.0.md) - Harness Knowledge Factory source coverage and independent template lifecycle release body.
- [EvoPilot v1.1.4 Release Notes](releases/1.1.4.md) - distribution-closure release body, GitHub Release tarball installer defaults, and npm registry publication boundary.
- [EvoPilot v1.1.3 Release Notes](releases/1.1.3.md) - release target boundary and npm registry verification release body and compatibility notes.
- [EvoPilot v1.1.0 Release Notes](releases/1.1.0.md) - control-plane runtime boundary release body and compatibility notes.
- [EvoPilot v1.0.10 Release Notes](releases/1.0.10.md) - code-structure and module-boundary cleanup release body and compatibility notes.
- [EvoPilot v1.0.9 Release Notes](releases/1.0.9.md) - distribution-entrypoint hardening release body and compatibility notes.
- [EvoPilot v1.0.8 Release Notes](releases/1.0.8.md) - distribution-expansion release body and compatibility notes.
- [EvoPilot v1.0.6 Release Notes](releases/1.0.6.md) - package-boundary and worker runtime release body and compatibility notes.
- [EvoPilot v1.0.5 Release Notes](releases/1.0.5.md) - immutable ECS deployment body and compatibility notes.
- [EvoPilot v1.0.4 Release Notes](releases/1.0.4.md) - immutable release artifact body and compatibility notes.
- [EvoPilot v1.0.3 Release Notes](releases/1.0.3.md) - publication hardening release body and compatibility notes.
- [EvoPilot v1.0.2 Release Notes](releases/1.0.2.md) - publication hardening release body and compatibility notes.
- [EvoPilot v1.0.1 Release Notes](releases/1.0.1.md) - publication hardening release body and compatibility notes.
- [EvoPilot v1.0.0 Release Notes](releases/1.0.0.md) - original GA baseline release body and compatibility notes.

## Examples And Comparisons

- [Examples](../examples/README.md) - example index for onboarding, source-to-GA, executor adapters, and GitHub workflows.
- [Source-To-GA Examples](../examples/source-to-ga/README.md) - end-to-end project onboarding, Harness Catalog selection, goal loop, and release decision scenarios.
- [Mainstream Loop Harness Alignment](examples/comparisons/mainstream-loop-harness-alignment.md) - alignment notes against mainstream loop-harness patterns.

## Runtime Artifacts

Source closure files generated by EvoPilot are runtime artifacts, not product manuals. Tracked examples live under `.evopilot/source-closures/` so the main documentation tree stays focused on user-facing docs.
