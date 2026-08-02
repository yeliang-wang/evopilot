# EvoPilot Documentation

EvoPilot documentation is organized by reader task. Start from the section that matches what you need to do.

## New Users

- [Quick Start](quickstart.md) - install, run locally, and verify the API.
- [Self-Hosting](operations/self-hosting.md) - run the API server, loop worker, code-upgrader, Postgres, and standalone Dashboard.
- [Control Plane User Guide](guides/user-guide.md) - operate projects, credentials, goals, loops, releases, and audit through API/CLI semantics.
- [Project Harness Onboarding](guides/project-harness-onboarding.md) - generate, review, activate, and evolve project-level harness profiles.
- [HarnessTemplate Evolution](guides/harness-template-evolution.md) - administrator lifecycle for evolving public harness templates from reviewable sources, draft validation, approval, publishing, and project impact.

## AI Agents And CLI Automation

- [Repository Agent Instructions](../AGENTS.md) - root instructions for AI agents reading this repository.
- [CLI Agent Instructions](cli/AGENTS.md) - shortest WorkBuddy-safe reading path and non-negotiable CLI rules.
- [CLI Quickstart For AI Agents](cli/quickstart.md) - minimal production-safe command sequence.
- [CLI](cli/README.md) - install and connect the EvoPilot CLI to a remote control-plane server.
- [CLI Workflows](cli/workflows.md) - one-command Goal/Loop scenarios with plan approval, Alpha/Beta/RC/GA phase packages, project DevOps, and project LLM profile selection.
- [CLI Commands](cli/commands.md) - atomic command reference.
- [CLI Automation](cli/automation.md) - WorkBuddy, Codex, Claude Code, and CI usage rules.
- [AI Agent Runbook](guides/ai-agent-runbook.md) - end-to-end production operating flow and failure handling.
- [Public Harness Template Packs](../harness-templates/public/README.md) - human-readable administrator-maintained HarnessTemplate knowledge packs.
- [HarnessTemplate Evolution](guides/harness-template-evolution.md) - source-to-draft-to-publish CLI/API lifecycle for administrator template upgrades.

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
- [Release Management](operations/release-management.md) - versioning, release notes, tag rules, rollback, and public release checklist.
- [Deployment Assets](../deploy/README.md) - committed Docker Compose and Kubernetes deployment assets, plus production host-local file boundaries.
- [Runtime Assets](../runtimes/README.md) - runtime locks, code-upgrader boundary, SBOM, license, vulnerability, and validation evidence.
- [Runtime Management](operations/runtime-management.md) - runtime locks, worker operation, and runtime checks.
- [Testing](operations/testing.md) - local, functional, E2E, and release validation commands.
- [Troubleshooting](operations/troubleshooting.md) - common incidents and diagnostic commands.

## Repository Operators

- [Engineering Scripts](../scripts/README.md) - production runtime, verification, release, soak, real-boundary E2E, and maintenance script map.
- [Public Harness Template Packs](../harness-templates/public/README.md) - human-readable administrator-maintained HarnessTemplate knowledge packs.

## Architects And Reviewers

- [Architecture](architecture/README.md) - architecture entry point.
- [Continuous Evolution Control Plane](architecture/continuous-evolution-control-plane.md) - product control-plane model.
- [Project Harness Profile](architecture/project-harness-profile.md) - project-level harness control-plane profile lifecycle and storage model.
- [Loop Runtime](architecture/loop-runtime.md) - loop execution, continuity, and recovery.
- [ProofOps Target Loop Mode](architecture/proofops-target-loop-mode.md) - target-loop governance model.
- [Lifecycle](reference/lifecycle.md) - evidence-to-release lifecycle model.
- [Project Harness Profile Schema](reference/project-harness-profile-schema.md) - YAML/JSON source format and compiled control-plane contract.
- [Product Readiness](reference/product-readiness.md) - GA readiness review.
- [Open Source Maturity Report](reference/open-source-maturity-report.md) - public productization and top-tier gap assessment.
- [Production User E2E](reference/production-user-e2e.md) - production user validation evidence.
- [Release Package](reference/release-package.md) - SaaS GA release package.
- [EvoPilot v1.0.5 Release Notes](releases/1.0.5.md) - current immutable ECS deployment body and compatibility notes.
- [EvoPilot v1.0.4 Release Notes](releases/1.0.4.md) - immutable release artifact body and compatibility notes.
- [EvoPilot v1.0.3 Release Notes](releases/1.0.3.md) - publication hardening release body and compatibility notes.
- [EvoPilot v1.0.2 Release Notes](releases/1.0.2.md) - publication hardening release body and compatibility notes.
- [EvoPilot v1.0.1 Release Notes](releases/1.0.1.md) - publication hardening release body and compatibility notes.
- [EvoPilot v1.0.0 Release Notes](releases/1.0.0.md) - original GA baseline release body and compatibility notes.

## Examples And Comparisons

- [Examples](../examples/README.md) - example index for onboarding, source-to-GA, executor adapters, and GitHub workflows.
- [Source-To-GA Examples](../examples/source-to-ga/README.md) - end-to-end project onboarding, harness review, goal loop, and release decision scenarios.
- [Mainstream Loop Harness Alignment](examples/comparisons/mainstream-loop-harness-alignment.md) - alignment notes against mainstream loop-harness patterns.

## Runtime Artifacts

Source closure files generated by EvoPilot are runtime artifacts, not product manuals. Tracked examples live under `.evopilot/source-closures/` so the main documentation tree stays focused on user-facing docs.
