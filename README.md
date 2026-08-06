# EvoPilot

> Evidence-driven self-evolution control plane for AI-agent products, with governed goals, auditable loops, human approval, release decisions, and installable distribution paths.

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6%2B-3178c6)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/runtime-prod%20by%20default-1f7a8c)](#self-hosting-and-distribution)
[![Release](https://img.shields.io/badge/GA%20Release-v1.1.7-2ea043)](#release-status)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

[Quick Start](#quick-start) | [Distribution](docs/operations/distribution.md) | [CLI](docs/cli/README.md) | [Self-Hosting](docs/operations/self-hosting.md) | [API](docs/api/README.md) | [Docs](docs/README.md) | [Changelog](CHANGELOG.md) | [Security](SECURITY.md)

EvoPilot helps teams operate AI-agent products as releasable software. It collects evidence from runtime events, traces, evaluations, CI/CD, source changes, LLM calls, and user feedback; turns that evidence into reviewable evolution opportunities; then governs goal planning, loop execution, source closure, delivery, and product-native `GO` / `NO-GO` release decisions.

It is not an agent runtime, prompt playground, or generic code generator. Agent runtimes do the work; EvoPilot governs whether a product should evolve and release.

## Start Here

| Entry | Use when | Command |
| --- | --- | --- |
| Install CLI | You already have an EvoPilot server and want the verified release package | `npm install -g https://github.com/yeliang-wang/evopilot/releases/download/v1.1.7/evopilot-contracts-1.1.7.tgz https://github.com/yeliang-wang/evopilot/releases/download/v1.1.7/evopilot-client-1.1.7.tgz https://github.com/yeliang-wang/evopilot/releases/download/v1.1.7/evopilot-cli-1.1.7.tgz` |
| Self-host now | You want the API, worker, code-upgrader, Postgres, and Dashboard together | `bash -c "$(curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v1.1.7/install.sh)"` |
| Kubernetes | You run EvoPilot on a cluster | `helm install evopilot ./charts/evopilot --namespace evopilot --create-namespace` |

Desktop installer, hosted Cloud trial, and public npm registry packages are not published EvoPilot surfaces yet. The supported public entry points are GitHub Release CLI tarballs, self-host installer, and Helm.

## What You Can Do

| Area | What EvoPilot provides |
| --- | --- |
| Govern product evolution | Alpha -> Beta -> RC -> GA goal planning, human review, phase packages, blockers, and final reports. |
| Run auditable loops | Durable loop state, executor graphs, checkpoints, replay, worker leases, watchdog recovery, and timeline audit. |
| Bind project harnesses | `HarnessTemplate`, `TenantHarnessPolicy`, and `ProjectHarnessProfile` versions for project-specific runtime, validation, evidence, and governance rules. |
| Control source and delivery | Bounded code-upgrader execution, allowed paths, validation commands, source closure, CI/CD delivery, and deploy evidence. |
| Track LLM usage by project | Server-projected provider/model/profile rows, token totals, latest loop tokens, and request IDs for connected projects and workspaces. |
| Operate with API, CLI, and Dashboard | API server, agent-safe CLI JSON flows, and the standalone `yeliang-wang/evopilot-dashboard` browser console. |
| Distribute and verify releases | Release package tarballs, self-host installer, Helm chart, source archive, SPDX SBOM, provenance, checksums, and GHCR image digest metadata. |

## Run From Source

For local development:

```bash
npm install
npm run build
npm run server:debug
curl http://127.0.0.1:19876/health
curl http://127.0.0.1:19876/ready
```

Run the standalone Dashboard from the sibling repository:

```bash
cd ../evopilot-dashboard
EVOPILOT_API_BASE_URL=http://127.0.0.1:19876 npm run dev
```

Debug mode is for local development and UI validation. Production mode is the default for real operation and requires authentication plus configured LLM, source, and CI/CD credentials.

See [Distribution](docs/operations/distribution.md) for release tarballs, installer, Helm, validation, public registry verification, and publishing details.

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

Do not treat a source checkout plus production build as immutable artifact deployment. That remains a valid source-ref rollout path, but it is weaker release evidence.

## Release Status

The latest published GitHub release is **v1.1.7 GA**, a GitHub source + GitLab CI bridge patch over the original `v1.0.0` GA baseline.

v1.1.7 keeps GitHub-native and GitLab-native loops unchanged, then adds explicit `sourceMode=external-source` support for projects that keep source in GitHub while running CI/Loop delivery through a GitLab CI workflow project.

Release evidence:

- Latest release notes: [docs/releases/1.1.7.md](docs/releases/1.1.7.md)
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
HarnessTemplate + TenantHarnessPolicy + ProjectHarnessProfile
                                      |
                                      v
                         GlobalGoal -> GoalTarget -> LoopRun -> Release Decision
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

Primary API surfaces include health/readiness, auth and users, projects and evidence, DevOps preflight, harness profiles, LLM profiles, global goals, loops, source closure, release decisions, and SaaS administration.

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

EvoPilot uses Apache License 2.0 and includes standard public-repository governance entry points:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [NOTICE](NOTICE)
- [LICENSE](LICENSE)
- [CHANGELOG.md](CHANGELOG.md)
- [GitHub Metadata](docs/reference/github-metadata.md)

Governance verification: `npm run verify:oss-governance`

## License

EvoPilot is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
