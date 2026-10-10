# EvoPilot

> Evidence-driven self-evolution control plane for AI-agent products, with governed goals, auditable loops, human approval, release decisions, and installable distribution paths.

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6%2B-3178c6)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/runtime-prod%20by%20default-1f7a8c)](#self-hosting-and-distribution)
[![Release](https://img.shields.io/badge/latest%20public-v6.3.3-2ea043)](#release-status)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

[Install in an Agent Host](docs/guides/agent-host-installation.md) | [First Task](docs/guides/first-task.md) | [Troubleshooting](docs/operations/troubleshooting.md) | [Docs](docs/README.md) | [Changelog](CHANGELOG.md) | [Security](SECURITY.md)

EvoPilot helps teams operate AI-agent products as releasable software. It collects evidence from runtime events, traces, evaluations, CI/CD, source changes, LLM calls, and user feedback; turns that evidence into reviewable evolution opportunities; then governs goal planning, loop execution, source closure, delivery, and product-native `GO` / `NO-GO` release decisions.

It is not an agent runtime, prompt playground, generic code generator, or Harness Asset lifecycle manager. Harness definitions are authored, evolved, reviewed, versioned, and published by the independent `evopilot-harness` project. EvoPilot reads a configured Harness Registry and the published Catalog directories it points to, then uses an open product-delivery Lifecycle Harness to execute project goals against the selected immutable HarnessBundle.

## Start Here

Use EvoPilot from your AI Agent Host with the independently installed Evolution Expert and MCP connections. The current combination is **Runtime 6.3.3 + Expert 2.3.1 + Harness 4.8.2**; the products evolve independently.

For the Runtime's Codex plugin component **0.1.0**, see the [Codex operating guide](docs/operations/codex.md) for installation and explicit activation, and the [released component source](plugins/evopilot). Fresh Desktop reinstallation and ordinary-chat repeat verification remain pending.

| Your task | Start with | Success signal |
| --- | --- | --- |
| Install the combination in Codex or another Host | [Agent Host installation](docs/guides/agent-host-installation.md) | Expert loaded, stdio tools discovered, actual Runtime connection checked |
| Use an existing installation | [First task](docs/guides/first-task.md) | Read-only inspection of the current setup and its remaining prerequisites |
| Diagnose a stopped task | [Layered troubleshooting](docs/operations/troubleshooting.md) | Identify the failing Host, MCP, Runtime, model, or execution layer |
| Provision or administer a Runtime | [Self-hosting](docs/operations/self-hosting.md), [distribution](docs/operations/distribution.md), [CLI](docs/cli/README.md) | A configured, reachable control plane |
| Develop from source | [Developer quickstart](docs/quickstart.md), [architecture](docs/architecture/README.md) | Build and local API checks pass |

Codex has recorded live Host acceptance. Other generated adapters have separate installation and qualification requirements; see the [Host support matrix](docs/guides/agent-host-installation.md#host-support-matrix). Desktop installers and a hosted Cloud trial are not published surfaces. Installing npm packages alone does not configure a Runtime, activate an Expert in the Host, or qualify a project executor.

## v6.3 Semantic Convergence and First-Run LLM Readiness

EvoPilot Runtime **v6.3.3** and Evolution Expert **v2.3.1** are accepted and
published, with the independently published **evopilot-harness 4.8.2**. These
maintenance releases improve onboarding and installed documentation while
preserving the accepted product boundaries. See
[current releases and acceptance limits](docs/releases/current-release.md).
There is no separate Expert 2.2.1 delivery. The product core remains `Goal -> Loop -> Target`, guided by an exact published Harness and one active, immutable Lifecycle revision:

```text
Project Definition + GoalTarget -> published HarnessProfile -> immutable HarnessBundle
                                      + open Lifecycle -> governed Goal Target Loop
```

Runtime owns a tenant/workspace Lifecycle Registry with immutable YAML revisions, active pointers, semantic diff, dependencies, usage, audit, archive/restore, and rollback. DataRig, EvoPilot, evopilot-harness, and future projects are declarations—not privileged Engine profiles. Compatible project and Pipeline revisions can evolve without a Runtime or Expert release.

Runtime 6.2 adds a mandatory first-run LLM readiness gate. EvoPilot ships with **no provider, model, API key, inherited Host LLM, or hidden environment fallback**. A production Runtime starts safely in `SETUP_REQUIRED`, exposes only health and setup surfaces, and unlocks normal project, Harness, Goal, Target, and Loop work only after an administrator selects a provider and model, stores the credential through Host-native secure input as a `SecretRef`, completes a live preflight, and explicitly binds that exact Profile digest as the workspace default. Evolution Expert 2.3 guides this flow over MCP without ever requesting or receiving the raw credential. See [First-Run LLM Readiness](docs/guides/first-run-llm-readiness.md).

The published Runtime 6.3.2 patch removes elapsed-time blocking for an unchanged approved LLM binding, including Goal/Loop selection and restart. Initial and explicitly replaced bindings still require fresh successful preflight; configuration drift and failed proof still block. See [readiness continuity](docs/guides/first-run-llm-readiness.md#initial-freshness-and-continued-use).

Runtime 6.3 also supplies explicit administrator-only headless bootstrap and 6.1 provider conversion through bounded, non-echoing stdin. These flows do not discover Host/environment configuration or overwrite existing resources. Profile edits and credential rotation invalidate preflight, and concurrent changes stop safely. See the [CLI initialization contract](docs/cli/commands.md#llm-profiles); source tests are supporting checks; installed acceptance is recorded in the current release ledger.

Evolution Expert is the ordinary-human entry and talks to Runtime only through MCP. It is independently installed into Codex, Claude Code, designated-human WorkBuddy, generic Agent, or generic MCP Hosts. Runtime never embeds a general-purpose coding Agent: it emits an exact `pendingExecution` to a qualified external Agent Runtime, validates the normalized receipt, and resumes from durable state.

Earlier published baselines remain immutable. Runtime 6.3.0 and Expert 2.3.0 each passed 400 applicable current and inherited acceptance criteria with `NO_REGRESSION`. Real Host acceptance is Codex-only; native credential interaction and a new 90-minute soak were explicitly excluded, not passed.

Legacy EvoPilot and DataRig Suite snapshots remain historical provenance for convergence into independent project resources, including `datarig-production-delivery@1.0.0`. Evolution Expert and the configured MCP products are the current operating entry; retired Suites are not Runtime dependencies, execution paths, synchronization sources or fallbacks. Installation does not delete existing Suites. Migration and permanent removal are separate, explicitly authorized local operations; historical acceptance records remain immutable. See [legacy transition boundaries](docs/guides/legacy-suite-transition.md).

## What You Can Do

| Area | What EvoPilot provides |
| --- | --- |
| Govern product evolution | Tenant/workspace Lifecycle Registry CRUD over immutable human-readable YAML, risk-based authority gates, automatic deterministic stages, evidence closure, and final release decisions. |
| Run auditable loops | Durable loop state, executor graphs, checkpoints, replay, worker leases, watchdog recovery, and timeline audit. |
| Onboard any project declaratively | Discovery, immutable human-readable Project Definitions and resources, schema-driven questions, semantic impact, versioned activation/rollback, and no project-specific Runtime branches. |
| Converge Suite capabilities | Exact source provenance, 100% capability disposition, project-neutral governed resources, typed Action Providers, and zero hidden Suite fallback. |
| Evolve project Pipelines safely | Exact observations, deterministic gap classification, immutable successors, comparable experiments, policy-preauthorized safe activation, monitoring, and idempotent rollback without project-specific Core branches. |
| Recover and learn safely | Bounded automatic repair/retry/resume plus an Automation Registry where one reviewed proposal can automate future equivalent safe failures. |
| Repair across Candidates safely | Durable remediation campaigns preserve source/Candidate lineage, receipts, budgets, failed-first reruns, impact closure, full-matrix reruns, and exact human stop boundaries. |
| Consume published Harnesses | Dynamically reads configured `evopilot-harness` Registry/Catalog roots, matches published v3 Profiles, binds immutable Bundles, and stores the complete Profile/Component/Bundle digest closure in goal plans. |
| Control source and delivery | Bounded code-upgrader execution, allowed paths, validation commands, source closure, CI/CD delivery, and deploy evidence. |
| Track LLM usage by project | Server-projected provider/model/profile rows, token totals, latest loop tokens, and request IDs for connected projects and workspaces. |
| Operate through Agents | Evolution Expert over MCP is the ordinary-human surface; HTTP, CLI, CI, events, webhooks, and Dashboard remain administrator, machine, diagnostics, and recovery surfaces. |
| Distribute and verify releases | Release package tarballs, self-host installer, Helm chart, source archive, SPDX SBOM, provenance, checksums, and GHCR image digest metadata. |

## Quick Start

With an [installed Agent Host combination](docs/guides/agent-host-installation.md), ask:

> Use Evolution Expert to inspect the connected EvoPilot Runtime and its current LLM readiness. Reuse existing configuration. Report the component versions, available tools, and any missing prerequisites before starting a project task.

Follow the [first-task tutorial](docs/guides/first-task.md) for the expected read-only results and the separate transition to project work. Runtime LLM readiness, published Harness eligibility, executor qualification and independent business evidence are distinct checks. A connected MCP server is the first checkpoint, not proof that an arbitrary project is ready to execute.

The Host connects to `evopilot-mcp` through **stdio**; that adapter connects to the EvoPilot Runtime over HTTP, commonly `http://127.0.0.1:19876` on a local installation. The Host also connects to the independent Harness MCP server through stdio. Expert is guidance loaded in the Host, not another background Runtime. See [architecture and ownership](docs/architecture/README.md).

## Administrator And Machine CLI

The CLI is an HTTP client for local or remote EvoPilot Runtime. Administrators and automation use its JSON interfaces for diagnosis and governed operations. With an already configured connection:

```bash
evopilot status --json
evopilot runtime readiness --json
```

For installation, authentication and exact command schemas, use [CLI setup](docs/cli/README.md), [CLI Agent Instructions](docs/cli/AGENTS.md), [CLI Automation](docs/cli/automation.md) and the [command reference](docs/cli/commands.md). Existing private configuration should be reused; authentication setup is not a daily-use prerequisite.

For authorized administrative planning on an already onboarded project, bind the
configured project LLM Profile explicitly:

```bash
evopilot target plan --project <project-id> --objective "<business objective>" --llm-profile <llm-profile-id> --json
```

This creates a plan and may call the model. Review its exact asset bindings and
follow the returned approval requirements before execution; it is not part of
the read-only first-task check.

`evopilot harness ...` authoring and publication commands are intentionally absent. Harness lifecycle work belongs to [evopilot-harness](https://github.com/yeliang-wang/evopilot-harness); Runtime only consumes its published Registry, Catalogs and immutable Bundle closure. Asset publication and project release require their own exact review and authority.

## Self-Hosting And Distribution

For production, use the documented install and release paths rather than ad hoc local builds:

- [Distribution](docs/operations/distribution.md)
- [Self-Hosting](docs/operations/self-hosting.md)
- [Deployment](docs/operations/deployment.md)
- [Release Management](docs/operations/release-management.md)
- [Troubleshooting](docs/operations/troubleshooting.md)

Release operations are local-first. Docker Compose, Helm and remote deployment are administrator choices described in the linked guides; they are not prerequisites for using an existing local Host installation. For Harness consumption, configure `EVOPILOT_HARNESS_REGISTRY_CONFIG` to a readable, published Registry and its Catalog roots. See [published Harness consumption](docs/architecture/published-harness-catalog.md).

## Release Status

[Runtime 6.3.3](docs/releases/6.3.3.md) and [Evolution Expert 2.3.1](docs/releases/evolution-expert-2.3.1.md) are published and publicly verified. Runtime is distributed through GitHub, six exact-version npm packages, GHCR and its manifest-based installer; Expert has its own GitHub Release and npm package. [Harness 4.8.2](https://github.com/yeliang-wang/evopilot-harness/releases/tag/v4.8.2) is independently published.

The approved maintenance scope passed **6 new Runtime criteria and 6 new Expert criteria**, with individual current impact review of **419 inherited Runtime criteria and 400 inherited Expert criteria**. All **2,505 exact installed regression tests** passed. Current Codex observations cover bounded MCP reads, Expert Skill discovery and restart; they do not replay the historical business journeys. Other live Hosts, native credential interaction and a new 90-minute soak were not executed and are not counted as passed. This campaign made no model calls or daily-machine cutover; private project extensions **1.0.1** remain unchanged.

The [current release ledger](docs/releases/current-release.md) records the separate [Runtime publication](governance/releases/runtime-6.3.3-publication-20261006.json) and [Expert publication](governance/releases/evolution-expert-2.3.1-publication-20261006.json). Both consume accepted Candidates from `4c7c09b8be221d2feedef8fa5f12b00883ee33fc` without rebuilding: Runtime `37407237313`, Expert `37407240219`. Publication does not deploy a remote Runtime, install or switch an existing Host, or remove legacy Suites.

The completed Runtime 6.3.2 readiness-continuity campaign remains historical: it passed 10 new criteria, four current cases, 2,414 exact installed regression tests and individual impact review of 409 inherited criteria. Its published Candidate `37177531263` at `05da3339b32468f3682eea8a1c2b31880a6c38a1` and [publication ledger](governance/releases/runtime-6.3.2-publication-20261004.json) remain immutable. Its model/restart/rollback observations are not reported as new 6.3.3 execution.

The unpublished v3.2 Bundle-consumer closure is inherited by v4.0 without a standalone v3.2 release. v4.0 keeps EvoPilot's strict read-only Harness-asset boundary while adding open YAML Lifecycle execution for project goals.

Release evidence:

- Current public Runtime 6.3.3: [release notes](docs/releases/6.3.3.md)
- Historical public Runtime 6.3.2: [release notes](docs/releases/6.3.2.md)
- Historical public Runtime 6.3.1: [release notes](docs/releases/6.3.1.md)
- Historical public Runtime 6.3.0: [release notes](docs/releases/6.3.0.md)
- Current public Expert 2.3.1: [release notes](docs/releases/evolution-expert-2.3.1.md)
- Historical public Expert 2.3.0: [release notes](docs/releases/evolution-expert-2.3.0.md)
- Expert 2.2.1 recovery (not released): [docs/releases/evolution-expert-2.2.1.md](docs/releases/evolution-expert-2.2.1.md)
- Previous release notes: [docs/releases/4.0.0.md](docs/releases/4.0.0.md)
- Historical SaaS release package evidence: [docs/reference/release-package.md](docs/reference/release-package.md)
- Historical production user E2E evidence: [docs/reference/production-user-e2e.md](docs/reference/production-user-e2e.md)
- Open-source readiness: [docs/reference/open-source-readiness.md](docs/reference/open-source-readiness.md)
- Open-source maturity report: [docs/reference/open-source-maturity-report.md](docs/reference/open-source-maturity-report.md)

The authoritative product verdict is exposed by:

```http
GET /api/v1/release/decisions
```

## Architecture

EvoPilot is an Agent-native lifecycle control plane, not the third-party Agent Runtime that edits source. A human converses with Codex, Claude Code, WorkBuddy, or another qualified Host using that Host's **Host LLM**. Evolution Expert translates the conversation into typed MCP operations. EvoPilot Runtime owns durable governance state and uses a separately configured **Runtime LLM** only through an explicit workspace Profile. When bounded source work is required, Runtime emits an exact `pendingExecution` to a qualified external Agent Runtime; that runtime may use its own **Agent Model** and must return normalized receipts. These three model identities are independent and never substitute for one another.

![EvoPilot Agent-Native Lifecycle Control Plane architecture](docs/assets/architecture/evopilot-agent-native-architecture.svg)

[PNG fallback](docs/assets/architecture/evopilot-agent-native-architecture.png) · [First-Run LLM Readiness](docs/guides/first-run-llm-readiness.md)

The Runtime reads immutable HarnessBundles from `evopilot-harness` Registry/Catalog roots and composes them with the active human-readable Lifecycle. Evolution Expert guides; Runtime decides and records; the external Agent Runtime performs only explicitly bounded effects; `evopilot-harness` remains the independent Harness producer.

Key architecture docs:

- [Continuous Evolution Control Plane](docs/architecture/continuous-evolution-control-plane.md)
- [Agent-Native Lifecycle Control Plane](docs/architecture/agent-native-lifecycle-control-plane.md)
- [First-Run LLM Readiness](docs/guides/first-run-llm-readiness.md)
- [Loop Runtime Architecture](docs/architecture/loop-runtime.md)
- [ProofOps Target Loop Mode](docs/architecture/proofops-target-loop-mode.md)
- [Dashboard Integration](docs/guides/dashboard-integration.md)
- [Independent Dashboard repository](https://github.com/yeliang-wang/evopilot-dashboard) — optional administrator UI using the Runtime HTTP API.

## API

Primary API surfaces include health/readiness, auth and users, projects and evidence, DevOps preflight, read-only Harness Catalog projection, LLM profiles, global goals, loops, source closure, release decisions, and SaaS administration.

See [API Reference](docs/api/README.md) and [OpenAPI](docs/api/openapi.json).

Runtime 6.3.0 provides [semantic Catalog discovery, reviewed project binding and dual-bound execution](docs/architecture/semantic-catalog-consumer.md).
Read-only onboarding preserves existing bindings and distinguishes unique,
ambiguous, indeterminate and missing choices. Selection and review remain explicit.
Activation, migration and rollback use scoped decisions and append-only receipts;
existing runs retain their original pins.

The [semantic execution API and CLI](docs/cli/commands.md#project-semantic-execution-630)
prepare exact plans, review business mappings, dispatch through configured adapters,
collect evidence and validate business and Harness obligations independently.
`DUAL_VALIDATED_NOT_COMPLETED` is an evaluation result; stage, Target, phase and
Goal completion each require their own verified receipts and current policy.
Expert renders these Runtime-owned states over MCP. Uncertain effects are read
back without automatic replay. Release authorization is a separate decision.

Runtime 6.3.1 also repairs dependent semantic Target progression. A verified
Target completion receipt can make an eligible pending successor ready; crossing
a phase additionally requires its verified predecessor phase receipt and GO
decision. Readiness does not dispatch the next request, complete another Target,
or grant release authority. See [semantic progression and recovery](docs/architecture/loop-runtime.md#semantic-target-progression-and-recovery).

Executor and collector qualification is bound to exact Host/runtime/environment,
permissions, activation and expiry. Installed Codex and controlled variants passed
the [approved release scope](docs/releases/current-release.md); this does not
qualify arbitrary external Hosts or collectors. Runtime 6.3.1 preserves reported
token counts without requiring prices or monetary budgets; missing telemetry
remains unknown. Historical monetary observations stay readable without
controlling execution or release decisions. The earlier 6.3.0 series demonstration
completed one of four Targets. The separate 6.3.1 installed campaign completed
all 12 required Targets and four phases, with verified Goal completion and
restart receipts; that evidence is bound to its exact candidate and configured
project, not every future installation.

## Development

The [Runtime 6.3.0 / Expert 2.3.0 versioned E2E corpus](tests/e2e/versions/README.md)
preserves separate case definitions, local supporting suites and exact Target
bindings. Local validation is not installed-artifact or real-Host acceptance.

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
