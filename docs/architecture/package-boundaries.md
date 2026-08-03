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
| `@evopilot/server` | Interface / composition root | HTTP routing, RBAC, tenant/workspace scope, audit, API orchestration | CLI semantics, Dashboard-only state |
| `@evopilot/worker-runtime` | Runtime | loop worker polling, worker lease heartbeat, watchdog/start/resume API loop | release verdicts, approval bypasses, direct store access |
| `@evopilot/cli` | Interface adapter | command parsing, agent-safe JSON output, stop-rule presentation | server-side policy decisions, direct store mutation |
| `@evopilot/client` | Adapter | HTTP request helper, request headers, response normalization | business workflow orchestration |

The source of truth for this package catalog is `packages/contracts/src/index.ts`. The repository check `npm run verify:architecture` verifies that the required packages and adapter wiring exist.

## Migration Rule

Move behavior only when a boundary is already named and testable.

1. Put shared names, schemas, status constants, and public boundary metadata in `@evopilot/contracts`.
2. Move reusable runtime behavior behind a package before changing the operating script. `scripts/loop-worker.mjs` now delegates to `@evopilot/worker-runtime`.
3. Keep `@evopilot/server` as the HTTP composition root while extracting domain modules behind stable interfaces.
4. Keep `@evopilot/cli` as an HTTP adapter. It may format stop rules and JSON summaries, but it must not reimplement server decisions.
5. Add or update docs in the same change that changes package ownership.

## Current Transitional Hotspots

These files remain deliberately transitional:

| File | Current role | Next extraction target |
|---|---|---|
| `packages/server/src/index.ts` | HTTP composition root plus legacy route/application orchestration | `packages/server/src/http`, `application`, `domains`, and `infra` modules |
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
