# Changelog

All notable changes to EvoPilot are documented here.

This project follows a product-readiness changelog model: release entries should summarize user-visible capability, governance impact, validation evidence, and migration notes. Do not use local tests alone as release proof.

## 1.0.4 - 2026-08-02

### Added

- Added immutable release artifact publishing for GA patch releases: release archive, SPDX SBOM, provenance, SHA256 checksums, and GHCR image digest metadata.
- Added tag-triggered GitHub Actions release artifact workflow.
- Added ECS immutable compose template that deploys a pinned image digest instead of building from a production checkout.

### Validation

- `npm run release:artifact`
- `npm run verify:release-artifact`
- `npm run check`
- `git diff --check`

## 1.0.3 - 2026-08-02

### Fixed

- Aligned CLI functional tests with the documented CI client-surface contract so GitHub Actions expects `ci` when `CI=true`.

### Validation

- `npm run cli:test`
- `npm run check`
- `git diff --check`

## 1.0.2 - 2026-08-02

### Fixed

- Hardened service-validation cleanup across POSIX process groups so Linux CI terminates shell-started validation services and their child processes.

### Validation

- `node --test tests/unit/internal-runtimes.test.mjs`
- `npm run check`
- `git diff --check`

## 1.0.1 - 2026-08-02

### Fixed

- Hardened service-validation cleanup in the built-in code-upgrader runtime so CI waits for spawned validation services to terminate cleanly on Linux runners.

### Validation

- `npm run check`
- `node --test tests/unit/internal-runtimes.test.mjs`
- `git diff --check`

## 1.0.0 - 2026-08-02

### Added

- GA Release V1.0 public product baseline for the EvoPilot control plane.
- Project harness lifecycle with `HarnessTemplate`, `TenantHarnessPolicy`, and project-scoped `ProjectHarnessProfile` review and activation gates.
- Built-in public HarnessTemplate knowledge packs for Python enterprise services, Java DDD services, Node SaaS control planes, Go middleware, observability/APM, and generic management software.
- Server-governed HarnessTemplate evolution lifecycle with source collection, LLM-assisted draft generation, administrator review, validation, publish, audit, and project impact reporting.
- Goal Loop governance across Alpha, Beta, RC, and GA phase targets.
- CLI-first automation entry points for WorkBuddy, Codex, Claude Code, CI jobs, and other AI agents.
- LLM profile selection, readiness preflight, provider/model visibility, and token usage reporting.
- Logging inspection, request/correlation IDs, evidence packages, release decisions, and production readiness references.

### Documented

- AI-agent-safe CLI entry points in `AGENTS.md` and `docs/cli/AGENTS.md`.
- Harness template evolution runbook in `docs/guides/harness-template-evolution.md`.
- ProjectHarnessProfile schema in `docs/reference/project-harness-profile-schema.md`.
- Production release evidence in `docs/reference/release-package.md` and `docs/reference/production-user-e2e.md`.
- Self-hosting path, public release management, version release notes, source-to-GA examples, and open-source maturity reporting.

### Validation

- `npm run cli:test`
- `npm run check`

## Unreleased

Track future changes here before tagging a release. Each entry should include validation commands and any required migration or operator action.
