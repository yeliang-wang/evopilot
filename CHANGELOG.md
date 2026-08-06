# Changelog

All notable changes to EvoPilot are documented here.

This project follows a product-readiness changelog model: release entries should summarize user-visible capability, governance impact, validation evidence, and migration notes. Do not use local tests alone as release proof.

## Unreleased

No unreleased changes yet.

## 1.1.7 - 2026-08-06

### Added

- Added explicit GitHub source with GitLab CI bridge mode for connected projects while preserving GitHub-native and GitLab-native DevOps loops.
- Added `sourceMode`, `bridge.workflowRepository`, `gitlabRef`, `sourceProvider`, and `workflowProvider` evidence to project DevOps configuration and readiness projections.
- Added CLI bridge flags for `project devops set`, including `--source-mode external-source`, `--workflow-provider`, `--workflow-base-url`, `--workflow-repo`, `--workflow-project-id`, `--workflow-branch`, and `--gitlab-ref`.
- Added delivery execution coverage that triggers GitLab CI against the bridge workflow project and sends non-secret GitHub source variables such as `SOURCE_REPOSITORY`, `SOURCE_BRANCH`, `UPGRADE_BRANCH`, `COMMIT_SHA`, and `PULL_REQUEST_URL`.

### Changed

- Kept repository-native as the default DevOps source mode so existing GitHub Actions and GitLab CI projects keep their current behavior.
- Required a separate GitLab `devopsTokenRef` for bridge execution instead of falling back to the GitHub source token.
- Updated package versions, shared version fallbacks, installer defaults, OpenAPI metadata, Helm metadata, and release validation pointers to `1.1.7`.

### Validation

- `npm run build`
- `node --test tests/functional/project-devops.test.mjs`
- `npm run cli:test`
- `npm run check`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`

## 1.1.6 - 2026-08-05

### Added

- Added project-centric LLM usage projections through `GET /api/v1/projects/{projectId}/usage`.
- Extended `GET /api/v1/workspaces/{workspaceId}/usage` with workspace `llmUsage`, `projectsWithLlmUsage`, `loopsWithLlmUsage`, `topProject`, and per-project `providerModelUsage[]`.
- Added provider/model/profile grouping for Loop trace token usage so one connected project can show multiple actual LLM combinations over time.

### Changed

- Updated package versions, shared version fallbacks, installer defaults, OpenAPI metadata, Helm metadata, Dashboard image defaults, and release validation pointers to `1.1.6`.
- Documented Dashboard's server-projection boundary for project token usage: browsers must display EvoPilot projections, not calculate token totals locally.

### Validation

- `npm run build -w @evopilot/server`
- `node --test tests/functional/loop-runtime.test.mjs`
- `npm run cli:test`
- `npm run check`
- `npm run release:ready`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`

## 1.1.5 - 2026-08-05

### Changed

- Split the large control-plane runtime into a thin HTTP composition root, focused HTTP route modules, a file-backed storage boundary, and a transitional application helper boundary.
- Moved `FileStore` into `packages/server/src/storage/file-store/` and moved control-plane use-case helpers into `packages/server/src/application/control-plane-services.ts`.
- Split the CLI process entrypoint from the command runtime so `packages/cli/src/index.ts` stays a thin executable wrapper while command handling remains an HTTP adapter through `EvoPilotClient`.
- Tightened architecture verification so route prefixes cannot be re-inlined into the runtime, `FileStore` cannot return to the composition root, and line budgets guard server, route, storage, application, and CLI boundaries.
- Updated package versions, shared version fallbacks, installer defaults, OpenAPI metadata, Helm metadata, and release validation pointers to `1.1.5`.

### Documented

- Updated architecture and maturity docs to describe the storage/application/interface layering and the remaining transitional application and CLI command-runtime split targets.

### Validation

- `npm run verify:architecture`
- `npm run check`
- `npm run cli:test`
- `npm run release:ready`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`

## 1.1.4 - 2026-08-04

### Changed

- Updated POSIX and PowerShell installers so manifest-provided `packageSpec` / `tarballUrl` values can resolve `create-evopilot` from GitHub Release tarballs while public npm registry packages remain unpublished.
- Updated `installers/manifest.json`, package versions, shared version fallbacks, OpenAPI metadata, and `create-evopilot` defaults to `1.1.4`.
- Corrected README, distribution, self-hosting, CLI, package, release-management, open-source readiness, and maturity documentation to separate GitHub Release tarball-set installation from the later npm registry publication layer.
- Updated distribution readiness verification so local installer dry-run checks use the repository manifest before a release tag exists.

### Validation

- `npm run build`
- `npm run cli:test`
- `npm run verify:oss-governance`
- `npm run release:ready`
- `npm run verify:distribution`
- `npm run check`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`
- Post-publish only: `npm run verify:npm-registry -- --version 1.1.4`

## 1.1.3 - 2026-08-04

### Added

- Added `scripts/verify-npm-registry-publication.mjs` and `npm run verify:npm-registry` to prove exact-version public npm metadata, empty-project package installation, and `evopilot` / `create-evopilot` binary help output after npm publication.

### Changed

- Extracted release target defaults, ProofOps target planning, release scenario matrix handling, evidence summaries, active soak checks, release risk deduplication, and artifact type inference from the transitional control-plane runtime into `packages/server/src/runtime/release-targets.ts`.
- Updated shared package-boundary metadata and tightened `npm run verify:architecture` so the control-plane runtime must delegate release target helpers and remain under the updated line-count guard.
- Extended the npm package workflow so it verifies the public npm registry install path after publishing from a release tag.

### Documented

- Updated README, CLI, distribution, release-management, architecture, open-source readiness, and maturity docs to separate local distribution validation from post-publish public npm registry verification.

### Validation

- `npm run build -w @evopilot/server`
- `npm run verify:architecture`
- `npm run release:ready`
- `npm run verify:distribution`
- `npm run check`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`
- Post-publish: `npm run verify:npm-registry -- --version 1.1.3`

## 1.1.2 - 2026-08-04

### Added

- Added `scripts/immutable-rollback-runbook.mjs` for GitHub Release metadata resolution, pinned GHCR digest deployment, ECS health/readiness verification, Dashboard HTTP smoke, and rollback/forward drills.
- Added `npm run ecs:immutable-rollout` as the supported operator command for immutable ECS rollout automation.

### Changed

- Extended release readiness and production asset gates so immutable ECS rollout automation, evidence schema, and `--no-build` deployment behavior are verified before release.
- Updated package, installer, Helm, OpenAPI, and documentation version references to `1.1.2`.

### Documented

- Added immutable ECS rollout and rollback drill examples to the scripts guide and release-management runbook.
- Added v1.1.2 release notes covering the immutable rollout automation release.

### Validation

- `npm run build`
- `node --test tests/unit/immutable-rollback-runbook.test.mjs`
- `npm run verify:production-assets`
- `npm run release:ready`
- `npm run verify:distribution`
- `npm run check`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`

## 1.1.1 - 2026-08-04

### Changed

- Extracted runtime auth/config helpers from the transitional control-plane runtime into `packages/server/src/runtime/runtime-auth.ts`.
- Extracted loop executor adapter registry, policy-aware executor behavior, LLM executor prompt construction, and executor step evidence assembly into `packages/server/src/runtime/executor-adapters.ts`.
- Tightened architecture-boundary verification so the control-plane runtime must remain below `21600` lines and the new runtime modules stay focused.
- Updated shared package-boundary metadata so server runtime logs include runtime auth/config helpers and executor adapters.

### Documented

- Updated README, architecture docs, package-boundary docs, and the open-source maturity report for the new server runtime boundaries and the remaining `FileStore` / route-application extraction target.
- Updated installer, distribution, package, and product version references to `1.1.1`.

### Validation

- `npm run build -w @evopilot/server`
- `npm run build`
- `npm run verify:architecture`
- `npm run cli:test`
- `npm run check`
- `git diff --check`

## 1.1.0 - 2026-08-04

### Changed

- Moved the HTTP control-plane runtime from `packages/server/src/server.ts` into `packages/server/src/runtime/control-plane-runtime.ts`.
- Kept `packages/server/src/server.ts` as a thin compatibility adapter that re-exports the runtime boundary and preserves direct start.
- Extracted shared HTTP error/query helpers, Dashboard static asset serving, and file-backed storage primitives into focused server modules.
- Updated shared package-boundary metadata so server runtime logs describe the new control-plane runtime boundary.

### Documented

- Updated architecture and maturity docs to describe the runtime boundary, compatibility adapter, extracted HTTP/storage modules, and remaining `FileStore` / application use-case extraction target.

### Validation

- `npm run build -w @evopilot/server`
- `npm run verify:architecture`
- `npm run check`
- `git diff --check`

## 1.0.10 - 2026-08-04

### Changed

- Split the server package entrypoint into a thin startup adapter that delegates to `packages/server/src/server.ts`.
- Moved server-side API, store, goal, loop, release, and Dashboard projection contracts into `packages/server/src/model.ts`.
- Extracted reusable HTTP platform readiness, request logging, response writing, structured logging, route registry, and focused route modules under `packages/server/src/http/`.
- Moved built-in enterprise `HarnessTemplate` defaults into the harness-template domain module.

### Documented

- Updated architecture docs to describe the thin package entrypoint, transitional `server.ts` composition root, extracted HTTP helpers, route modules, and remaining deep extraction target.
- Added v1.0.10 release notes for the module-boundary cleanup release.

### Validation

- `npm run cli:test`
- `npm run check`
- `npm run verify:architecture`
- `npm run verify:distribution`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`

## 1.0.9 - 2026-08-03

### Added

- Added release manifest verification for the tagged self-host installer.
- Added `install.ps1` for Windows PowerShell one-command bootstrap.
- Added installer manifest checksums and release assets for `install.sh`, `install.ps1`, and `evopilot-<version>-install-manifest.json`.
- Added Helm service `extraPorts` rendering and a Helm template smoke check for API and Dashboard service exposure.

### Documented

- Updated README, self-hosting, distribution, release management, open-source readiness, and package installer docs for the P2 distribution entrypoints.
- Added v1.0.9 release notes covering installer manifest, PowerShell, Helm exposure, and artifact validation.

### Validation

- `npm run cli:test`
- `npm run check`
- `npm run verify:distribution`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`

## 1.0.8 - 2026-08-03

### Added

- Added npm distribution readiness for `@evopilot/contracts`, `@evopilot/client`, `@evopilot/cli`, and `create-evopilot`.
- Added `create-evopilot self-host --init-env` to generate a Docker Compose stack plus random local auth and database secrets for EvoPilot API, loop worker, code-upgrader, Postgres, and Dashboard.
- Added guarded `create-evopilot self-host --start`, which refuses to start when production placeholders remain unresolved.
- Added tagged `install.sh` for `curl -fsSL ... | bash` self-host bootstrap from GitHub Releases.
- Added a Helm chart at `charts/evopilot` for Kubernetes deployment and `values.production.example.yaml` for Secret-backed production installs.
- Added npm package publication workflow with provenance and release-tag validation.
- Added distribution verification for Helm chart structure, production values, local npm tarball install smoke, generated self-host stack files, and initialized `.env` output.

### Documented

- Added README CTA-style install entries for CLI, tagged installer, and Helm.
- Added the Distribution operations guide and updated self-hosting, release management, deployment, open-source readiness, and maturity docs for npm, installer, and Helm entry points.
- Clarified that Desktop installer and hosted Cloud trial are not published EvoPilot distribution surfaces in this version.

### Validation

- `npm run check`
- `npm run verify:distribution`
- `npm run release:ready`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`

## 1.0.7 - 2026-08-03

### Added

- Added a failure recovery matrix covering protected API rejection, source credential blockers, DevOps blockers, explicit LLM profile blockers, source closure repair actions, loop-worker retry, and fallback API base URLs.
- Added a read-only release readiness report that verifies version notes, changelog coverage, test-matrix docs, release workflows, PR artifacts, release artifact scripts, and `git diff --check`.
- Added CI workflows for failure recovery, release readiness, and PR review artifacts.

### Documented

- Added the test matrix operations guide and updated testing, release management, and docs index entries for failure recovery, release readiness, and PR artifacts.

### Validation

- `npm run check`
- `npm run test:failure-recovery`
- `npm run release:ready`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`

## 1.0.6 - 2026-08-03

### Added

- Added `@evopilot/contracts` as the shared package for API, CLI, runtime, version, stop-rule, and package-boundary metadata.
- Added `@evopilot/worker-runtime` as the packaged loop worker runtime, with `scripts/loop-worker.mjs` reduced to a thin launcher.
- Added `npm run verify:architecture` to verify package-boundary wiring and include it in `npm run check`.

### Documented

- Added package-boundary architecture documentation and updated README, architecture, loop runtime, scripts, and release-management docs for the new structure.

### Validation

- `npm run check`
- `npm run release:artifact`
- `npm run verify:release-artifact`
- `git diff --check`

## 1.0.5 - 2026-08-02

### Fixed

- Fixed immutable ECS compose defaults so the template keeps the `evopilot` project name and resolves the production env file from the repository root.
- Updated immutable deployment docs to use explicit project name, env file, and no-build rollout commands for pinned image digests.

### Validation

- `npm run release:artifact`
- `npm run verify:release-artifact`
- `npm run check`
- `git diff --check`

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
