# EvoPilot

> Evidence-driven self-evolution control plane for AI-agent products, with governed goals, auditable loops, human approval, release decisions, and installable distribution paths.

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6%2B-3178c6)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/runtime-prod%20by%20default-1f7a8c)](#self-hosting-and-distribution)
[![Release](https://img.shields.io/badge/latest%20public-v5.0.1-2ea043)](#release-status)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

[Quick Start](#quick-start) | [Distribution](docs/operations/distribution.md) | [CLI](docs/cli/README.md) | [Self-Hosting](docs/operations/self-hosting.md) | [API](docs/api/README.md) | [Docs](docs/README.md) | [Changelog](CHANGELOG.md) | [Security](SECURITY.md)

EvoPilot helps teams operate AI-agent products as releasable software. It collects evidence from runtime events, traces, evaluations, CI/CD, source changes, LLM calls, and user feedback; turns that evidence into reviewable evolution opportunities; then governs goal planning, loop execution, source closure, delivery, and product-native `GO` / `NO-GO` release decisions.

It is not an agent runtime, prompt playground, generic code generator, or Harness Asset lifecycle manager. Harness definitions are authored, evolved, reviewed, versioned, and published by the independent `evopilot-harness` project. EvoPilot reads a configured Harness Registry and the published Catalog directories it points to, then uses an open product-delivery Lifecycle Harness to execute project goals against the selected immutable HarnessBundle.

## v6 Agent-Native Lifecycle Control Plane

The repository is implementing EvoPilot **v6.0.0 Agent-Native Lifecycle Control Plane** and Evolution Expert **v2.0.0**; v5.0.1 remains the latest public release until independent Candidate, acceptance, and release gates pass. The product core remains `Goal -> Loop -> Target`, guided by an exact published Harness and one active, immutable Lifecycle revision:

```text
Project Definition + GoalTarget -> published HarnessProfile -> immutable HarnessBundle
                                      + open Lifecycle -> governed Goal Target Loop
```

Runtime owns a tenant/workspace Lifecycle Registry with immutable YAML revisions, active pointers, semantic diff, dependencies, usage, audit, archive/restore, and rollback. DataRig, EvoPilot, evopilot-harness, and future projects are declarations—not privileged Engine profiles. Compatible project and Pipeline revisions can evolve without a Runtime or Expert release.

Evolution Expert is the ordinary-human entry and talks to Runtime only through MCP. It is independently installed into Codex, Claude Code, designated-human WorkBuddy, generic Agent, or generic MCP Hosts. Runtime never embeds a general-purpose coding Agent: it emits an exact `pendingExecution` to a qualified external Agent Runtime, validates the normalized receipt, and resumes from durable state.

Completion is a machine-enforced contract: all 253 current, inherited, and terminal Runtime/Expert criteria must have criterion-specific evidence for one exact installed Candidate pair; impact and `NO_REGRESSION` must pass, and failed, pending, stale, warning, generic, unmapped, or legacy-Suite invocation counts must be zero. See [v6 Acceptance](docs/operations/v6-acceptance.md).

EvoPilot Codex Suite 3.2.1 and DataRig Codex Suite 2.1.5 are frozen reference fixtures only. They are not Runtime dependencies, synchronization sources, or fallbacks. Existing installed Suites remain untouched; any real switch or retirement stays behind a separately approved post-release [Cutover](docs/guides/legacy-suite-transition.md).

## Start Here

| Entry | Use when | Command |
| --- | --- | --- |
| Install CLI | You already have an EvoPilot server and want the verified public package | `npm install -g @evopilot/cli@5.0.0` |
| Self-host now | You want the API, worker, code-upgrader, Postgres, and Dashboard together | `bash -c "$(curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v5.0.0/install.sh)"` |
| Kubernetes | You run EvoPilot on a cluster | `helm install evopilot ./charts/evopilot --namespace evopilot --create-namespace` |

Desktop installer and hosted Cloud trial are not published EvoPilot surfaces yet. The supported public entry points are the six exact-version npm packages, GitHub Release tarballs, the self-host installer, Helm, and GHCR images.

## What You Can Do

| Area | What EvoPilot provides |
| --- | --- |
| Govern product evolution | Tenant/workspace Lifecycle Registry CRUD over immutable human-readable YAML, risk-based authority gates, automatic deterministic stages, evidence closure, and final release decisions. |
| Run auditable loops | Durable loop state, executor graphs, checkpoints, replay, worker leases, watchdog recovery, and timeline audit. |
| Onboard any project declaratively | Discovery, immutable human-readable Project Definitions and resources, schema-driven questions, semantic impact, versioned activation/rollback, and no project-specific Runtime branches. |
| Converge Suite capabilities | Exact source provenance, 100% capability disposition, project-neutral governed resources, typed Action Providers, and zero hidden Suite fallback. |
| Recover and learn safely | Bounded automatic repair/retry/resume plus an Automation Registry where one reviewed proposal can automate future equivalent safe failures. |
| Repair across Candidates safely | Durable remediation campaigns preserve source/Candidate lineage, receipts, budgets, failed-first reruns, impact closure, full-matrix reruns, and exact human stop boundaries. |
| Consume published Harnesses | Dynamically reads configured `evopilot-harness` Registry/Catalog roots, matches published v3 Profiles, binds immutable Bundles, and stores the complete Profile/Component/Bundle digest closure in goal plans. |
| Control source and delivery | Bounded code-upgrader execution, allowed paths, validation commands, source closure, CI/CD delivery, and deploy evidence. |
| Track LLM usage by project | Server-projected provider/model/profile rows, token totals, latest loop tokens, and request IDs for connected projects and workspaces. |
| Operate through Agents | Evolution Expert over MCP is the ordinary-human surface; HTTP, CLI, CI, events, webhooks, and Dashboard remain administrator, machine, diagnostics, and recovery surfaces. |
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

Run the standalone Dashboard from the
[`yeliang-wang/evopilot-dashboard`](https://github.com/yeliang-wang/evopilot-dashboard)
sibling repository:

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

## Administrator And Machine CLI

The CLI is an HTTP client for remote EvoPilot API servers. In v6 it is for administrators, machines, diagnostics, and recovery—not the direct ordinary-human path. Ordinary users install the [Evolution Expert Host Integration Bundle](docs/guides/evolution-expert.md) in their Agent Host and converse through MCP.

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

`evopilot harness ...` authoring and publication commands are intentionally absent from EvoPilot Runtime. Use `evopilot-harness` for the independent Harness asset lifecycle; EvoPilot only discovers, matches, binds, and consumes published assets.

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

The latest published GitHub release is **v5.0.1**. Runtime v6.0.0 and Evolution Expert v2.0.0 are under local implementation; no Candidate, acceptance, publication, Host installation, or Cutover is implied by this source tree.

The unpublished v3.2 Bundle-consumer closure is inherited by v4.0 without a standalone v3.2 release. v4.0 keeps EvoPilot's strict read-only Harness-asset boundary while adding open YAML Lifecycle execution for project goals.

Release evidence:

- Latest published release notes: [docs/releases/5.0.1.md](docs/releases/5.0.1.md)
- v6 implementation plan: [docs/releases/6.0.0.md](docs/releases/6.0.0.md)
- Evolution Expert 2.0.0 plan: [docs/releases/evolution-expert-2.0.0.md](docs/releases/evolution-expert-2.0.0.md)
- Previous release notes: [docs/releases/4.0.0.md](docs/releases/4.0.0.md)
- Release package evidence: [docs/reference/release-package.md](docs/reference/release-package.md)
- Production user E2E evidence: [docs/reference/production-user-e2e.md](docs/reference/production-user-e2e.md)
- Open-source readiness: [docs/reference/open-source-readiness.md](docs/reference/open-source-readiness.md)
- Open-source maturity report: [docs/reference/open-source-maturity-report.md](docs/reference/open-source-maturity-report.md)

The authoritative product verdict is exposed by:

```http
GET /api/v1/release/decisions
```

## Architecture

EvoPilot applies Loop Engineering through a selected, immutable HarnessBundle plus an open Lifecycle definition. The Lifecycle plans and executes project-goal stages; the legacy Alpha -> Beta -> RC -> GA ladder is represented by an explicit v3 compatibility Lifecycle rather than fixed v4 Engine behavior.

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
selectedHarness -> HarnessExecutionBinding + Lifecycle -> GlobalGoal -> GoalTarget -> LoopRun -> Release Decision
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
| `packages/evolution-expert/` | Independently versioned ordinary-human conversational Core and generated Host adapters. |
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
