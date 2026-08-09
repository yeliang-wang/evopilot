# Package Boundaries

## Status

Accepted

## Purpose

EvoPilot is evolving from a working TypeScript workspace into a clearer control-plane platform. The product model already has strong domain concepts; the codebase must now make those boundaries visible to contributors, API clients, CLI automation, Dashboard integration, and runtime operators.

This document defines the current package boundary. It is intentionally narrower than the full target architecture so the migration can stay reversible and behavior-preserving.

## Current Workspace Boundary

| Package | Layer | Owns | Must not own |
|---|---|---|---|
| `@evopilot/contracts` | Contract | shared schema names, version constants, API/CLI/runtime boundary metadata | business decisions, HTTP transport, filesystem state |
| `@evopilot/core` | Domain | evidence models, evolution opportunities, release report primitives | HTTP routing, CLI parsing, server-side persistence |
| `@evopilot/server` | Interface / application / storage | package entrypoint, compatibility adapter, HTTP composition, focused HTTP route modules, application helper boundary, file-backed storage boundary, runtime auth/config helpers, executor adapters, release target helpers, RBAC, tenant/workspace scope, audit, API orchestration | CLI semantics, Dashboard-only state |
| `@evopilot/worker-runtime` | Runtime | loop worker polling, worker lease heartbeat, watchdog/start/resume API loop | release verdicts, approval bypasses, direct store access |
| `@evopilot/cli` | Interface adapter | thin process entrypoint, command runtime, agent-safe JSON output, stop-rule presentation | server-side policy decisions, direct store mutation |
| `@evopilot/client` | Adapter | HTTP request helper, request headers, response normalization | business workflow orchestration |

The source of truth for this package catalog is `packages/contracts/src/index.ts`. The repository check `npm run verify:architecture` verifies that the required packages and adapter wiring exist.

## Migration Rule

Move behavior only when a boundary is already named and testable.

1. Put shared names, schemas, status constants, and public boundary metadata in `@evopilot/contracts`.
2. Move reusable runtime behavior behind a package before changing the operating script. `scripts/loop-worker.mjs` now delegates to `@evopilot/worker-runtime`.
3. Keep `@evopilot/server` layered inside the package: `server.ts` stays a compatibility adapter, `runtime/control-plane-runtime.ts` owns request lifecycle, authentication handoff, logging, and route composition, `http/routes/*.ts` owns HTTP branches, `application/control-plane-services.ts` owns transitional use-case helpers, and `storage/file-store/` owns file-backed persistence.
4. Keep `@evopilot/cli` as an HTTP adapter. `src/index.ts` starts the process, while `src/commands/` owns command dispatch and response formatting without bypassing server decisions.
5. Add or update docs in the same change that changes package ownership.

## Current Transitional Hotspots

These files remain deliberately transitional:

| File | Current role | Next extraction target |
|---|---|---|
| `packages/server/src/index.ts` | Thin package entrypoint and direct-start adapter | HTTP routing, store layout, or application use cases |
| `packages/server/src/server.ts` | Thin compatibility adapter that re-exports the control-plane runtime and preserves direct start | any new HTTP routing, store layout, or application use cases |
| `packages/server/src/runtime/control-plane-runtime.ts` | Thin HTTP composition root for request lifecycle, logging, authentication, route-module dispatch, and startup wiring | new route branching, persistence layout, or application use-case logic |
| `packages/server/src/application/control-plane-services.ts` | Transitional application helper boundary for goal, loop, release, project readiness, LLM readiness, and source-closure use cases used by route modules and storage | HTTP request lifecycle, file path layout ownership, or CLI behavior |
| `packages/server/src/storage/file-store/index.ts` | File-backed store boundary for aggregate persistence, summaries, idempotency records, audit append/read, loop/goal/release/project storage, and JSON file hydration | HTTP status mapping, route authorization, Dashboard-only state, or CLI commands |
| `packages/server/src/runtime/runtime-auth.ts` | Runtime mode resolution, production configuration checks, env parsing, user/session token normalization, authorization, RBAC helper, and audit record construction | HTTP route branching, persistence layout, or release decisions |
| `packages/server/src/runtime/executor-adapters.ts` | Loop executor adapter registry, adapter policy result helpers, LLM executor prompt construction, and executor step output/evidence assembly | source release closure, project DevOps checks, store mutation, or HTTP concerns |
| `packages/server/src/runtime/release-targets.ts` | Release target defaults, ProofOps target plans, scenario matrix normalization/defaulting, release evidence summaries, active soak checks, release risk deduplication, and artifact type inference | HTTP routing, store mutation, executor invocation, or deployment side effects |
| `packages/server/src/model.ts` | Server-side API, store, goal, loop, release, and Dashboard projection contracts | route handlers, persistence side effects, or business execution |
| `packages/server/src/http/errors.ts` | HTTP error type plus shared query parameter validation helpers | route business decisions, auth, audit, or persistence |
| `packages/server/src/http/router.ts` | shared first-match route registry | route business decisions, auth bypasses, or store mutation |
| `packages/server/src/http/routes/*.ts` | Focused HTTP route modules for platform, auth, settings, read models, goals, read-only Harness Catalog projection, admin, loop runtime, loop lifecycle, target loops, release evidence, connectors, project management, delivery, review, evidence ingestion, rules, evaluation, release targets, maturity standards, audit, and history | direct filesystem layout, Dashboard-only state, or bypasses around RBAC/tenant/workspace/audit checks |
| `packages/server/src/http/platform-readiness.ts` | Health, readiness, and version response builders | broader route orchestration and auth/RBAC |
| `packages/server/src/http/request-logging.ts` | HTTP route grouping, correlation, diagnosis, client metadata, and redacted query helpers | server business decisions or audit persistence |
| `packages/server/src/http/response.ts` | JSON/text/event-stream writers plus response LLM usage metadata | route authorization, store mutation, or release decisions |
| `packages/server/src/http/server-logging.ts` | structured log settings, redaction, severity/category mapping, and active logging state | HTTP response bodies or business audit persistence |
| `packages/server/src/http/static-assets.ts` | Dashboard static asset serving for self-hosted deployments | API routing, auth, or release decisions |
| `packages/server/src/storage/json-files.ts` | Atomic JSON/text writes and filesystem-safe ids for file-backed stores | store aggregates, HTTP status mapping, or domain decisions |
| `packages/server/src/domains/harness-template/defaults.ts` | Legacy compatibility data used only when older stored records need hydration | HTTP routing, Harness lifecycle management, project-specific activation, or goal planning |
| `packages/cli/src/index.ts` | Thin process entrypoint that delegates to command modules | command handlers, HTTP request construction, output formatting, or server decisions |
| `packages/cli/src/commands/runtime.ts` | Transitional command runtime for parsing, dispatch, HTTP adapter calls, JSON/human output, and stop-rule presentation | direct server storage access or bypasses around server policy gates |
| `packages/core/src/index.ts` | shared evidence/evolution primitives | smaller domain modules once downstream imports are stable |

Do not split these files by mechanical line count alone. Extract a slice only when tests can verify the boundary and the resulting module owns a coherent product capability.

## OSS Code Modularity Reference

For code modularity benchmarking, use mature public repositories as structural references only. In the August 5, 2026 public OpenHands repository snapshot, the visible structure includes conventional project ownership surfaces such as `.github/`, `docs/`, `docker/`, `electron/`, `helm/`, `src/`, `tests/`, and multiple Playwright configurations. That is useful as an external signal for clear boundaries and test-routing depth; it is not a claim that EvoPilot is equivalent to OpenHands.

EvoPilot now has a verifiable comparison surface for the code-modularity dimension:

| Evidence | Location | Verification |
|---|---|---|
| Server entrypoint and compatibility adapter stay thin | `packages/server/src/index.ts`, `packages/server/src/server.ts` | `npm run verify:architecture` line budgets |
| Control-plane route domains are named modules | `packages/server/src/http/routes/*.ts` | required handler checks in `scripts/verify-architecture-boundaries.mjs` |
| Extracted route prefixes do not return to the composition root | `packages/server/src/runtime/control-plane-runtime.ts` | route-prefix guard in `scripts/verify-architecture-boundaries.mjs` |
| File-backed persistence is outside the composition root | `packages/server/src/storage/file-store/index.ts` | `class FileStore` absence/presence checks and line budgets in `scripts/verify-architecture-boundaries.mjs` |
| Application helper ownership is outside the composition root | `packages/server/src/application/control-plane-services.ts` | required application-boundary check and line budget |
| CLI entry stays a thin process wrapper | `packages/cli/src/index.ts`, `packages/cli/src/commands/runtime.ts` | CLI line budgets and command runtime checks |
| Remaining hotspots are explicit instead of hidden | this document | current transitional hotspot table |

Remaining code-modularity work is now narrower: split the large transitional application helper boundary into domain use-case modules and split the CLI command runtime into project, harness, goal, loop, source-closure, and release command modules as those surfaces change.

## Validation

Use:

```bash
npm run build
npm run verify:architecture
npm run cli:test
git diff --check
```

For release-impacting structural changes, use:

```bash
npm run check
npm run release:artifact
npm run verify:release-artifact
```
