# EvoPilot Engineering Scripts

This directory contains Node.js scripts that operate EvoPilot's control-plane lifecycle. They are intentionally tracked as product engineering assets, not hidden from GitHub language statistics. TypeScript remains the main product implementation language; these `.mjs` scripts provide runtime workers, release validation, production evidence collection, and maintenance entry points that need to run directly in Node.js, Docker, CI, ECS, or operator terminals.

## Production Runtime

| Script | npm command | Purpose |
|---|---|---|
| `loop-worker.mjs` | `npm run loop-worker` | Thin launcher for `@evopilot/worker-runtime`, which claims loop work, writes heartbeat leases, and advances claimable loops through the API server. |
| `internal-code-upgrader.mjs` | `npm run code-upgrader` | Built-in code-upgrader runtime that exposes the production code-upgrade boundary used by EvoPilot delivery flows. |

These scripts are part of the production service set. They run beside `evopilot-server` in Docker Compose and ECS deployments and must keep using server-governed APIs, scoped credentials, structured logs, and auditable request IDs.

## Verification

| Script | npm command | Purpose |
|---|---|---|
| `verify-production-assets.mjs` | `npm run verify:production-assets` | Verifies production-facing docs, OpenAPI, runtime assets, deployment references, and required repository assets. |
| `verify-open-source-governance.mjs` | `npm run verify:oss-governance` | Verifies Apache-2.0 governance files and public repository governance links. |
| `verify-architecture-boundaries.mjs` | `npm run verify:architecture` | Verifies package-boundary packages, runtime launcher delegation, and contracts wiring. |
| `verify-runtime-lock.mjs` | `npm run verify:runtime-lock` | Checks runtime lock, SBOM, license, vulnerability, and health endpoint metadata. |

Use these scripts before release-impacting documentation, runtime, deployment, or open-source packaging changes. `npm run check` calls the production asset, governance, and architecture checks after build and test.

## Immutable ECS Rollout

| Script | npm command | Purpose |
|---|---|---|
| `immutable-rollback-runbook.mjs` | `npm run ecs:immutable-rollout -- ...` | Resolves GitHub Release image metadata, deploys pinned GHCR digests to ECS when `--apply` is present, verifies `/health`, `/ready`, Dashboard HTTP smoke, and records container digest evidence. |

The script is safe by default: without `--apply`, it only resolves release metadata and prints the planned immutable image references. With `--apply`, it uses SSH and `deploy/ecs/compose.immutable.yaml` with `--no-build`, so production does not rebuild from a mutable checkout.

Deploy one release digest:

```bash
npm run ecs:immutable-rollout -- --version 1.1.7 --host root@8.153.72.80 --apply --json
```

Run a rollback and forward drill:

```bash
npm run ecs:immutable-rollout -- \
  --rollback-version 1.1.2 \
  --forward-version 1.1.7 \
  --host root@8.153.72.80 \
  --apply \
  --json
```

## Release, GA, And Soak

| Script | npm command | Purpose |
|---|---|---|
| `ga-soak.mjs` | `npm run release:soak:ga` | Runs GA soak validation. In active mode it requires live workload evidence and refuses fixture-only proof. |
| `loop-soak.mjs` | `npm run loop:soak` | Exercises durable loop execution, worker recovery, leases, and loop continuity behavior. |
| `release-matrix-project-loop.mjs` | `npm run release:soak:ga:active` through `ga-soak.mjs` | Drives active workload evidence for GA soak validation. |
| `ga-residual-scenarios.mjs` | direct Node entry | Exercises residual GA risk scenarios used by release governance checks. |

These scripts are release evidence producers. They must not downgrade to mock-only, fake, fixture-only, or chat-only proof when the result is used as production readiness evidence.

## Real-Boundary E2E

| Script | npm command | Purpose |
|---|---|---|
| `production-e2e.mjs` | `npm run test:e2e:production` | Runs a real production-chain E2E with live LLM, project registration, code upgrade, and CI/CD boundaries when the required environment is configured. |
| `real-llm-e2e.mjs` | `npm run test:e2e:real-llm` | Verifies real LLM integration, routing, trace metadata, and token accounting. |

These scripts can consume real provider credits, mutate external repositories, or trigger CI/CD. Run them only with explicit production test scope, configured secrets, and a reviewed target project boundary.

## Self-Evolution And Maintenance

| Script | npm command | Purpose |
|---|---|---|
| `evopilot-self-loop.mjs` | `npm run self-loop` | Registers EvoPilot itself as a governed target and optionally starts a self-loop when explicitly enabled. |
| `saas-ga-ladder-runner.mjs` | `npm run saas-ga:ladder` | Drives SaaS GA ladder scenarios through controlled target phases. |
| `postgres-business-store.mjs` | `npm run store:postgres:migrate`, `store:postgres:backup`, `store:postgres:restore` | Migrates, backs up, and restores Postgres-backed business store records. |

Maintenance scripts still operate through EvoPilot's control-plane contracts. They must not bypass RBAC, tenant/workspace scope, release policy, audit, or server-side credential references.

## Change Rules

- Keep script behavior aligned with `package.json` npm entries and Docker/ECS commands.
- Keep long-running runtime scripts structured-log friendly and include request, loop, worker, or release identifiers in failure output.
- Update this file when adding, renaming, or changing the operational role of a script.
- For docs-only script classification changes, run `git diff --check`, `npm run verify:production-assets`, and `npm run verify:oss-governance`.
- For runtime, delivery, worker, or release behavior changes, run targeted tests and `npm run check`.
