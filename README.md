# EvoPilot

> Evidence-driven self-evolution control plane for AI-agent products, with governed goals, auditable loops, human approval, release decisions, and immutable deployment artifacts.

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6%2B-3178c6)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/runtime-prod%20by%20default-1f7a8c)](#self-hosting-and-release)
[![Release](https://img.shields.io/badge/GA%20Release-v1.0.5-2ea043)](#release-status)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

[Quick Start](#quick-start) | [CLI](docs/cli/README.md) | [Self-Hosting](docs/operations/self-hosting.md) | [API](docs/api/README.md) | [Docs](docs/README.md) | [Changelog](CHANGELOG.md) | [Security](SECURITY.md)

EvoPilot helps teams operate AI-agent products as releasable software. It collects evidence from runtime events, traces, evaluations, CI/CD, source changes, LLM calls, and user feedback; turns that evidence into reviewable evolution opportunities; then governs goal planning, loop execution, source closure, delivery, and product-native `GO` / `NO-GO` release decisions.

It is not an agent runtime, prompt playground, or generic code generator. Agent runtimes do the work; EvoPilot governs whether a product should evolve and release.

## What You Can Do

| Area | What EvoPilot provides |
| --- | --- |
| Govern product evolution | Alpha -> Beta -> RC -> GA goal planning, human review, phase packages, blockers, and final reports. |
| Run auditable loops | Durable loop state, executor graphs, checkpoints, replay, worker leases, watchdog recovery, and timeline audit. |
| Bind project harnesses | `HarnessTemplate`, `TenantHarnessPolicy`, and `ProjectHarnessProfile` versions for project-specific runtime, validation, evidence, and governance rules. |
| Control source and delivery | Bounded code-upgrader execution, allowed paths, validation commands, source closure, CI/CD delivery, and deploy evidence. |
| Operate with API, CLI, and Dashboard | API server, agent-safe CLI JSON flows, and the standalone `yeliang-wang/evopilot-dashboard` browser console. |
| Publish release evidence | GitHub Release assets, source archive, SPDX SBOM, provenance, SHA256 checksums, GHCR image digest metadata, and ECS immutable compose templates. |

## Quick Start

Prerequisites:

- Node.js 22+
- npm

Run the API locally:

```bash
npm install
npm run build
npm run server:debug
```

Verify the server:

```bash
curl http://127.0.0.1:19876/health
curl http://127.0.0.1:19876/ready
```

Run the standalone Dashboard from the sibling repository:

```bash
cd ../evopilot-dashboard
EVOPILOT_API_BASE_URL=http://127.0.0.1:19876 npm run dev
```

Debug mode is for local development and UI validation. Production mode is the default for real operation and requires authentication plus configured LLM, source, and CI/CD credentials.

## CLI For AI Agents

The CLI is an HTTP client for remote EvoPilot API servers. WorkBuddy, Codex, Claude Code, CI jobs, and local terminals should use JSON output and stop on `nextAction`, blockers, approval gates, or `NO-GO` decisions.

```bash
export EVOPILOT_SERVER="https://evopilot.example.com"
export EVOPILOT_API_TOKEN="<operator-or-admin-token>"
export EVOPILOT_TENANT="tenant-production"
export EVOPILOT_WORKSPACE="workspace-agent-products"

evopilot status --json
evopilot target plan --project <project-id> --objective "<business objective>" --json
evopilot target run --project <project-id> --objective "<business objective>" --json
```

Start with [AGENTS.md](AGENTS.md), then use [docs/cli/AGENTS.md](docs/cli/AGENTS.md), [CLI Quickstart](docs/cli/quickstart.md), [CLI Automation](docs/cli/automation.md), and the [AI Agent Runbook](docs/guides/ai-agent-runbook.md).

## Self-Hosting And Release

For production, use the self-hosting and release-management docs rather than ad hoc local builds:

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

EvoPilot is **v1.0.5 GA** for the open-source product baseline. `v1.0.5` is an immutable ECS deployment patch over the original `v1.0.0` GA baseline.

Current phase: **Production Adoption and Public Trust Building**. Community scale, public case studies, and ecosystem reputation should grow through real deployments and sustained releases.

Release evidence:

- Latest release notes: [docs/releases/1.0.5.md](docs/releases/1.0.5.md)
- Release package evidence: [docs/reference/release-package.md](docs/reference/release-package.md)
- Production user E2E evidence: [docs/reference/production-user-e2e.md](docs/reference/production-user-e2e.md)
- Open-source readiness: [docs/reference/open-source-readiness.md](docs/reference/open-source-readiness.md)
- Open-source maturity report: [docs/reference/open-source-maturity-report.md](docs/reference/open-source-maturity-report.md)

The authoritative product verdict is exposed by:

```http
GET /api/v1/release/decisions
```

## Architecture

EvoPilot applies Loop Engineering to product evolution. For larger objectives, GlobalGoal decomposes one business goal into Alpha -> Beta -> RC -> GA phase targets before each target enters the governed loop runtime.

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

Common commands:

```bash
npm run build
npm run check
npm run cli:test
npm run release:artifact
npm run verify:release-artifact
git diff --check
```

Repository map:

| Path | Purpose |
| --- | --- |
| `packages/` | TypeScript product code: server, CLI, core, LLM, and adapters. |
| `scripts/` | Runtime workers, verification, release, soak, E2E, and maintenance scripts. |
| `harness-templates/` | Public HarnessTemplate knowledge packs and examples. |
| `standards/` | Alpha/Beta/RC/GA maturity standards and release baselines. |
| `runtimes/` | Runtime locks, SBOM, license, vulnerability, and code-upgrader assets. |
| `deploy/` | Docker Compose, ECS, and Kubernetes deployment assets. |
| `docs/` | User, API, deployment, architecture, testing, and release docs. |
| `tests/` | Unit, smoke, functional, and E2E tests. |

## Documentation

| Reader | Start here |
| --- | --- |
| New user | [Quick Start](docs/quickstart.md) |
| AI agent or CLI automation | [CLI](docs/cli/README.md), [CLI Automation](docs/cli/automation.md), [AI Agent Runbook](docs/guides/ai-agent-runbook.md) |
| Dashboard integrator | [Dashboard Integration](docs/guides/dashboard-integration.md) |
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

Governance verification:

```bash
npm run verify:oss-governance
```

## License

EvoPilot is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
