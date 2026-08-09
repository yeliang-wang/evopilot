# EvoPilot

> Evidence-driven self-evolution control plane for AI-agent products, with governed goals, auditable loops, human approval, release decisions, and installable distribution paths.

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6%2B-3178c6)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/runtime-prod%20by%20default-1f7a8c)](#self-hosting-and-distribution)
[![Release](https://img.shields.io/badge/GA%20Release-v3.1.0-2ea043)](#release-status)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

[Quick Start](#quick-start) | [Distribution](docs/operations/distribution.md) | [CLI](docs/cli/README.md) | [Self-Hosting](docs/operations/self-hosting.md) | [API](docs/api/README.md) | [Docs](docs/README.md) | [Changelog](CHANGELOG.md) | [Security](SECURITY.md)

EvoPilot helps teams operate AI-agent products as releasable software. It collects evidence from runtime events, traces, evaluations, CI/CD, source changes, LLM calls, and user feedback; turns that evidence into reviewable evolution opportunities; then governs goal planning, loop execution, source closure, delivery, and product-native `GO` / `NO-GO` release decisions.

It is not an agent runtime, prompt playground, generic code generator, or Harness lifecycle manager. Harness definitions are authored, evolved, reviewed, versioned, and published by the independent `evopilot-harness` project. EvoPilot reads a configured Harness Registry and the published Catalog directories it points to, then records selected Harness evidence in goal plans.

## Start Here

| Entry | Use when | Command |
| --- | --- | --- |
| Install CLI | You already have an EvoPilot server and want the verified release package | `npm install -g https://github.com/yeliang-wang/evopilot/releases/download/v3.1.0/evopilot-contracts-3.1.0.tgz https://github.com/yeliang-wang/evopilot/releases/download/v3.1.0/evopilot-client-3.1.0.tgz https://github.com/yeliang-wang/evopilot/releases/download/v3.1.0/evopilot-cli-3.1.0.tgz` |
| Self-host now | You want the API, worker, code-upgrader, Postgres, and Dashboard together | `bash -c "$(curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v3.1.0/install.sh)"` |
| Kubernetes | You run EvoPilot on a cluster | `helm install evopilot ./charts/evopilot --namespace evopilot --create-namespace` |

Desktop installer, hosted Cloud trial, and public npm registry packages are not published EvoPilot surfaces yet. The supported public entry points are GitHub Release CLI tarballs, self-host installer, Helm, and GHCR images.

## What You Can Do

| Area | What EvoPilot provides |
| --- | --- |
| Govern product evolution | Alpha -> Beta -> RC -> GA goal planning, human review, phase packages, blockers, and final reports. |
| Run auditable loops | Durable loop state, executor graphs, checkpoints, replay, worker leases, watchdog recovery, and timeline audit. |
| Consume published Harnesses | Dynamically reads configured `evopilot-harness` Registry/Catalog roots, auto-matches a `PUBLISHED` Harness, and stores `selectedHarness` id/version/registry/catalog/entry digests in goal plans. |
| Control source and delivery | Bounded code-upgrader execution, allowed paths, validation commands, source closure, CI/CD delivery, and deploy evidence. |
| Track LLM usage by project | Server-projected provider/model/profile rows, token totals, latest loop tokens, and request IDs for connected projects and workspaces. |
| Operate with API, CLI, and Dashboard | API server, agent-safe CLI JSON flows, and the standalone `yeliang-wang/evopilot-dashboard` browser console. |
| Distribute and verify releases | Release package tarballs, self-host installer, Helm chart, source archive, SPDX SBOM, provenance, checksums, and GHCR image digest metadata. |

## Quick Start

For local development:

```bash
npm install
npm run build
EVOPILOT_HARNESS_REGISTRY_CONFIG=/path/to/evopilot-harness/harness-registry.yaml npm run server:debug
curl http://127.0.0.1:19876/health
curl http://127.0.0.1:19876/ready
```

Run the standalone Dashboard from the sibling repository:

```bash
cd ../evopilot-dashboard
EVOPILOT_API_BASE_URL=http://127.0.0.1:19876 npm run dev
```

To supply Harness definitions, publish them in `evopilot-harness` and point EvoPilot at the published directory:

```bash
cd ../evopilot-harness
evopilot-harness evolve --source-project /path/to/source-project --goal "Create or evolve the domain harness." --approve-and-publish --confirmed-by platform-admin --confirmation "Reviewed source coverage and generated pack." --json
evopilot-harness registry publish --catalog published --registry harness-registry.yaml --json
evopilot-harness registry validate --registry harness-registry.yaml --json

cd ../evopilot
EVOPILOT_HARNESS_REGISTRY_CONFIG=../evopilot-harness/harness-registry.yaml npm run server:debug
```

EvoPilot reads `harness-registry.yaml`, then each enabled Catalog's `CATALOG.md`, at use time. It does not import, mount, approve, publish, or evolve Harness definitions.

## CLI For AI Agents

The CLI is an HTTP client for remote EvoPilot API servers. WorkBuddy, Codex, Claude Code, CI jobs, and local terminals should use JSON output and stop on `nextAction`, blockers, approval gates, or `NO-GO` decisions.

```bash
export EVOPILOT_SERVER="https://evopilot.example.com"
export EVOPILOT_API_TOKEN="<operator-or-admin-token>"
export EVOPILOT_TENANT="tenant-production"
export EVOPILOT_WORKSPACE="workspace-agent-products"

evopilot status --json
evopilot target plan --project <project-id> --objective "<business objective>" --llm-profile <llm-profile-id> --json
evopilot target plan approve <goal-id> --confirmed-by "<project-owner>" --confirmation "<phase plan reviewed and approved>" --json
evopilot target run --project <project-id> --objective "<business objective>" --llm-profile <llm-profile-id> --json
```

`evopilot harness ...` commands are intentionally absent in v3. Use `evopilot-harness` for Harness lifecycle and evolution.

Start with [AGENTS.md](AGENTS.md), then use [docs/cli/AGENTS.md](docs/cli/AGENTS.md), [CLI Quickstart](docs/cli/quickstart.md), [CLI Automation](docs/cli/automation.md), and the [AI Agent Runbook](docs/guides/ai-agent-runbook.md).

## Self-Hosting And Distribution

For production, use the documented install and release paths rather than ad hoc local builds:

- [Distribution](docs/operations/distribution.md)
- [Self-Hosting](docs/operations/self-hosting.md)
- [Deployment](docs/operations/deployment.md)
- [Release Management](docs/operations/release-management.md)
- [Troubleshooting](docs/operations/troubleshooting.md)

Immutable ECS deployment uses the image reference recorded in the GitHub Release image metadata:

```bash
export EVOPILOT_IMAGE='ghcr.io/yeliang-wang/evopilot@sha256:<digest>'
docker compose -p evopilot --env-file .env.production -f deploy/ecs/compose.immutable.yaml up -d --no-build
```

For production Harness consumption, mount the Registry file and published Catalog directory into the container and set:

```bash
EVOPILOT_HARNESS_REGISTRY_CONFIG=/opt/evopilot-harness/harness-registry.yaml
```

## Release Status

The latest published GitHub release is **v3.1.0 GA**, the multi-Catalog Harness Registry consumer release.

v3.1.0 keeps EvoPilot's strict read-only Harness boundary and adds `EVOPILOT_HARNESS_REGISTRY_CONFIG`. `evopilot-harness` owns lifecycle and publication. EvoPilot consumes the Registry and published Catalog directories dynamically, auto-matches a Harness during planning, and records `selectedHarness` evidence without importing every Harness definition.

Release evidence:

- Latest release notes: [docs/releases/3.1.0.md](docs/releases/3.1.0.md)
- Release package evidence: [docs/reference/release-package.md](docs/reference/release-package.md)
- Production user E2E evidence: [docs/reference/production-user-e2e.md](docs/reference/production-user-e2e.md)
- Open-source readiness: [docs/reference/open-source-readiness.md](docs/reference/open-source-readiness.md)
- Open-source maturity report: [docs/reference/open-source-maturity-report.md](docs/reference/open-source-maturity-report.md)

The authoritative product verdict is exposed by:

```http
GET /api/v1/release/decisions
```

## Architecture

EvoPilot applies Loop Engineering to product evolution. GlobalGoal decomposes one business goal into Alpha -> Beta -> RC -> GA phase targets before each target enters the governed loop runtime.

```text
evopilot-harness
  lifecycle/evolution/review/publish
              |
              v
Harness Registry with enabled Catalog roots
              |
              v
Published Harness Catalog directory with CATALOG.md
              |
              v
EvoPilot runtime reads registry and catalog at use time
              |
              v
selectedHarness -> GlobalGoal -> GoalTarget -> LoopRun -> Release Decision
                                      |
                                      v
                         Sandbox -> Context -> Harness -> Loop
```

Key architecture docs:

- [Continuous Evolution Control Plane](docs/architecture/continuous-evolution-control-plane.md)
- [Loop Runtime Architecture](docs/architecture/loop-runtime.md)
- [ProofOps Target Loop Mode](docs/architecture/proofops-target-loop-mode.md)
- [Dashboard Integration](docs/guides/dashboard-integration.md)

## API

Primary API surfaces include health/readiness, auth and users, projects and evidence, DevOps preflight, read-only Harness Catalog projection, LLM profiles, global goals, loops, source closure, release decisions, and SaaS administration.

See [API Reference](docs/api/README.md) and [OpenAPI](docs/api/openapi.json).

## Development

```bash
npm run build
npm run check
npm run cli:test
npm run verify:distribution
npm run release:artifact
npm run verify:release-artifact
git diff --check
```

Repository map:

| Path | Purpose |
| --- | --- |
| `packages/contracts/` | Shared API, CLI, runtime, version, and package-boundary contracts. |
| `packages/client/` | HTTP client used by CLI and external integrations. |
| `packages/cli/` | Agent-safe HTTP adapter CLI. |
| `packages/create-evopilot/` | Self-host package used by the release installer to generate a complete Compose stack. |
| `packages/server/` | HTTP control-plane runtime, thin compatibility adapter, RBAC, tenant/workspace scope, audit, and server-side modules. |
| `packages/worker-runtime/` | Loop worker runtime package used by `scripts/loop-worker.mjs`. |
| `packages/adapter-*` | Source, DevOps, MCP, and code-upgrader connector adapters. |
| `charts/evopilot/` | Helm chart for API, worker, code-upgrader, Postgres, Dashboard, and Ingress. |
| `deploy/` | Docker Compose, ECS, and Kubernetes deployment assets. |
| `docs/` | User, API, deployment, architecture, testing, distribution, and release docs. |

Architecture boundaries are documented in [Package Boundaries](docs/architecture/package-boundaries.md) and verified with `npm run verify:architecture`.

## Documentation

| Reader | Start here |
| --- | --- |
| New user | [Quick Start](docs/quickstart.md), [Distribution](docs/operations/distribution.md) |
| AI agent or CLI automation | [CLI](docs/cli/README.md), [CLI Automation](docs/cli/automation.md), [AI Agent Runbook](docs/guides/ai-agent-runbook.md) |
| API integrator | [API Reference](docs/api/README.md), [OpenAPI](docs/api/openapi.json) |
| Production operator | [Self-Hosting](docs/operations/self-hosting.md), [Deployment](docs/operations/deployment.md) |
| Release maintainer | [Release Management](docs/operations/release-management.md), [Open Source Maturity Report](docs/reference/open-source-maturity-report.md) |
| Architect | [Architecture](docs/architecture/README.md) |

## Governance

Public trust and governance assets:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [NOTICE](NOTICE)
- [LICENSE](LICENSE)
- [CHANGELOG.md](CHANGELOG.md)
- [Open Source Readiness](docs/reference/open-source-readiness.md)
- [Open Source Maturity Report](docs/reference/open-source-maturity-report.md)
- [GitHub Metadata](docs/reference/github-metadata.md)
