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
| `@evopilot/server` | Interface / control-plane runtime | package entrypoint, compatibility adapter, HTTP routing, runtime auth/config helpers, executor adapters, RBAC, tenant/workspace scope, audit, API orchestration | CLI semantics, Dashboard-only state |
| `@evopilot/worker-runtime` | Runtime | loop worker polling, worker lease heartbeat, watchdog/start/resume API loop | release verdicts, approval bypasses, direct store access |
| `@evopilot/cli` | Interface adapter | command parsing, agent-safe JSON output, stop-rule presentation | server-side policy decisions, direct store mutation |
| `@evopilot/client` | Adapter | HTTP request helper, request headers, response normalization | business workflow orchestration |

The source of truth for this package catalog is `packages/contracts/src/index.ts`. The repository check `npm run verify:architecture` verifies that the required packages and adapter wiring exist.

## Migration Rule

Move behavior only when a boundary is already named and testable.

1. Put shared names, schemas, status constants, and public boundary metadata in `@evopilot/contracts`.
2. Move reusable runtime behavior behind a package before changing the operating script. `scripts/loop-worker.mjs` now delegates to `@evopilot/worker-runtime`.
3. Keep `@evopilot/server` as the HTTP interface boundary: `server.ts` stays a compatibility adapter, `runtime/control-plane-runtime.ts` owns the current control-plane wiring, and reusable HTTP, runtime-auth, executor-adapter, and storage helpers move behind stable modules.
4. Keep `@evopilot/cli` as an HTTP adapter. It may format stop rules and JSON summaries, but it must not reimplement server decisions.
5. Add or update docs in the same change that changes package ownership.

## Current Transitional Hotspots

These files remain deliberately transitional:

| File | Current role | Next extraction target |
|---|---|---|
| `packages/server/src/index.ts` | Thin package entrypoint and direct-start adapter | HTTP routing, store layout, or application use cases |
| `packages/server/src/server.ts` | Thin compatibility adapter that re-exports the control-plane runtime and preserves direct start | any new HTTP routing, store layout, or application use cases |
| `packages/server/src/runtime/control-plane-runtime.ts` | Current HTTP control-plane runtime plus remaining legacy route/application orchestration; runtime auth/config and loop executor adapter execution now delegate to focused modules | remaining route/application handlers, `FileStore`, and application use cases |
| `packages/server/src/runtime/runtime-auth.ts` | Runtime mode resolution, production configuration checks, env parsing, user/session token normalization, authorization, RBAC helper, and audit record construction | HTTP route branching, persistence layout, or release decisions |
| `packages/server/src/runtime/executor-adapters.ts` | Loop executor adapter registry, adapter policy result helpers, LLM executor prompt construction, and executor step output/evidence assembly | source release closure, project DevOps checks, store mutation, or HTTP concerns |
| `packages/server/src/model.ts` | Server-side API, store, goal, loop, release, and Dashboard projection contracts | route handlers, persistence side effects, or business execution |
| `packages/server/src/http/errors.ts` | HTTP error type plus shared query parameter validation helpers | route business decisions, auth, audit, or persistence |
| `packages/server/src/http/router.ts` | shared first-match route registry | route business decisions, auth bypasses, or store mutation |
| `packages/server/src/http/routes/*.ts` | Focused HTTP route modules for platform, auth, settings, and read-model projections | business decisions, direct filesystem layout, or Dashboard-only state |
| `packages/server/src/http/platform-readiness.ts` | Health, readiness, and version response builders | broader route orchestration and auth/RBAC |
| `packages/server/src/http/request-logging.ts` | HTTP route grouping, correlation, diagnosis, client metadata, and redacted query helpers | server business decisions or audit persistence |
| `packages/server/src/http/response.ts` | JSON/text/event-stream writers plus response LLM usage metadata | route authorization, store mutation, or release decisions |
| `packages/server/src/http/server-logging.ts` | structured log settings, redaction, severity/category mapping, and active logging state | HTTP response bodies or business audit persistence |
| `packages/server/src/http/static-assets.ts` | Dashboard static asset serving for self-hosted deployments | API routing, auth, or release decisions |
| `packages/server/src/storage/json-files.ts` | Atomic JSON/text writes and filesystem-safe ids for file-backed stores | store aggregates, HTTP status mapping, or domain decisions |
| `packages/server/src/domains/harness-template/defaults.ts` | Built-in enterprise HarnessTemplate defaults | HTTP routing, project-specific activation, or goal planning |
| `packages/cli/src/index.ts` | CLI command dispatcher plus legacy command handlers | `packages/cli/src/commands`, `runtime`, `output`, and `guards` modules |
| `packages/core/src/index.ts` | shared evidence/evolution primitives | smaller domain modules once downstream imports are stable |

Do not split these files by mechanical line count alone. Extract a slice only when tests can verify the boundary and the resulting module owns a coherent product capability.

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
