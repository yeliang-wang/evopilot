# ADR 0004: Agent-Native Lifecycle Control Plane

## Status

Accepted for EvoPilot Runtime 6.0.0 and Evolution Expert 2.0.0 planning; not
implemented or released.

## Date

2026-09-11

## Context

ADR 0002 introduced open declarative project-execution Lifecycles. ADR 0003
made the published immutable `HarnessBundle` plus open Lifecycle the mandatory
Goal Target Loop path and made Evolution Expert an optional companion. The
unreleased Runtime 5.1.0 and Expert 1.1.0 work then used the latest EvoPilot and
DataRig Codex Suites as convergence inputs.

That direction leaves three product boundaries incomplete:

1. an ordinary user still has several apparent entry surfaces and must know
   whether to use a Skill, CLI, HTTP, or MCP;
2. a deployment-time file catalog is insufficient for production
   tenant/workspace Lifecycle creation, revision, activation, rollback, and
   audit; and
3. Host conversation, EvoPilot control-plane truth, and actual source-work
   execution are not explicit enough as independently qualified roles.

The product must also let third-party projects continually change their
Pipelines without modifying or releasing EvoPilot whenever the existing public
declarative contracts are sufficient. DataRig, EvoPilot, and
`evopilot-harness` are evidence that the abstraction works, not special Engine
domains.

## Decision

### 1. Preserve the Harness-guided product core

Every supported Goal Target Loop binds one exact eligible published immutable
`HarnessBundle`, its Profile and Component closure, and one exact immutable
resolved Lifecycle revision. EvoPilot remains a dynamic read-only Harness
consumer. Lifecycle may add sequencing, evidence, validators, constraints, and
narrower permissions; it cannot replace or weaken Harness obligations.

`evopilot-harness` continues to own Harness evidence ingestion, reasoning,
authoring, review, approval, evaluation, Catalog, Registry, signing, and
publication. This ADR does not transfer any Harness Asset authority.

### 2. Make Evolution Expert over MCP the ordinary-human product entry

An ordinary user installs a Host Integration Bundle into Codex, Claude Code,
WorkBuddy, or another qualified third-party AI Agent Host. The bundle binds:

- an exact independently versioned Evolution Expert and generated Host Adapter;
- MCP client/server configuration;
- a version-pinned Runtime launcher or administrator-managed Runtime endpoint;
  and
- installation, health, upgrade, rollback, and removal metadata.

Natural-language interaction through Evolution Expert and MCP is the only
supported ordinary-human path. Users do not need memorized CLI commands, HTTP
construction, MCP tool names, digests, or schema expertise before onboarding.

HTTP and CLI remain available for internal Runtime transport, machine and CI
integration, administration, diagnostics, compatibility, and emergency
recovery. They use the same contracts and cannot bypass Runtime validation or
authority, but they are not an ordinary-human fallback.

Evolution Expert is stateless and non-authoritative. It renders Runtime-owned
facts and exact decisions, asks only unresolved schema inputs, and guides
project, Lifecycle, Loop, recovery, acceptance, release, and tutorial journeys.
It cannot own durable state, select or mutate Harness assets, infer approval,
store raw credentials, execute project source changes, or encode Host-specific
business semantics.

### 3. Make Lifecycle a production governed resource

`LifecycleDefinition` is a tenant/workspace aggregate with human-readable YAML
input and canonical immutable `LifecycleRevision` execution records. The
production source of truth is a durable governed Lifecycle Registry and
resolver. File catalogs are bootstrap and reference imports only.

The Runtime exposes create/register, list, inspect, resolve, semantic diff,
successor update, activate, deactivate, archive, restore, rollback, dependency,
usage, and audit operations. Updates create successor revisions; they never
rewrite an existing revision. User-facing delete means deactivate plus archive
or tombstone. Physical deletion is forbidden for any referenced revision and
is available only to an explicitly eligible unreferenced draft cleanup policy.

Mutations are idempotent, bind an expected active digest, enforce referential
integrity and tenant/workspace isolation, persist crash-safely, and append
immutable audit evidence. Activation changes future planning only. Existing
runs retain and revalidate the exact revision digest in their immutable
`HarnessExecutionBinding`.

Definitions use a closed versioned Action and Capability vocabulary. YAML may
not embed arbitrary shell, programming code, hidden executable prompts, raw
secrets, or unqualified providers. Sensitive configuration uses `SecretRef`.
Imports are cycle-safe and cannot weaken Runtime or Harness invariants.

### 4. Separate Agent Host, EvoPilot Runtime, and Agent Runtime

The roles are:

| Role | Responsibility |
| --- | --- |
| Agent Host | Conversation transport, Expert rendering, exact decision display, and MCP session integration. |
| EvoPilot Runtime | Projects, Lifecycles, Goals, Targets, Loops, bindings, policy, evidence, recovery, authority, audit, durable state, planning, and exact `pendingExecution`. |
| Agent Runtime | Bounded source inspection and modification, test, build, analysis, repair, tool/model trajectory, and normalized receipt/artifact/evidence return. |

Host and Agent Runtime roles are independently versioned and qualified. One
third-party product may implement either or both. EvoPilot does not embed a
general-purpose coding Agent and does not silently fall back to an unqualified
Host or Agent Runtime. A returned Agent result is evidence only; Runtime
normalization, Harness validation, Lifecycle policy, source closure, and human
authority still apply.

### 5. Keep project variability outside Runtime branches

Projects compose project-neutral base Lifecycles and reusable modules with
independently versioned Project, Lifecycle, Policy, Governance, Action Provider,
Environment, Channel, `SecretRef`, and Human Authority resources. Compatible
resource changes do not require Runtime or Expert SemVer changes. A Runtime or
Expert release is required only when a project exposes a genuinely missing
project-neutral public capability or incompatible protocol change.

The EvoPilot Codex Suite 3.2.1 and DataRig Codex Suite 2.1.5 snapshots are
frozen migration and E2E fixtures. They do not define Runtime scope, become
dependencies, require ongoing synchronization, or receive privileged Engine
behavior. DataRig, EvoPilot, `evopilot-harness`, and an unknown project are
non-privileged reference declarations.

### 6. Supersede unreleased 5.1/1.1 work without rewriting history

Runtime 5.1.0 Candidate workflow 34542756424, Expert 1.1.0 Candidate workflow
34475009290, their Targets, and the paused incomplete acceptance binding remain
immutable development and impact evidence. They are not releasable and cannot
be relabeled, retagged, or counted as Runtime 6.0.0 or Expert 2.0.0 acceptance.
The interrupted soak has no finished record and is not resumed.

Runtime 6.0.0 and Expert 2.0.0 require new Targets, Candidates, fresh isolated
installation, criterion-specific evidence, all declared Host/MCP/Lifecycle
CRUD/Agent Runtime/Harness-reference journeys, impact closure, 5400-second
active soak, and `NO_REGRESSION` before separate Release authorizations.

## Alternatives Considered

### Keep Expert optional and preserve equal human entry surfaces

Rejected. It forces new users to choose protocols and lets Host-specific
instructions become a second source of interaction semantics.

### Keep `FileLifecycleCatalog` as production truth

Rejected. It cannot provide tenant/workspace isolation, immutable successor
updates, active pointers, referential integrity, concurrency, audit, or
crash-safe operational CRUD without source/deployment coupling.

### Embed a coding Agent in EvoPilot Runtime

Rejected. It collapses control and execution planes, weakens Host/Runtime
neutrality, duplicates third-party Agent capabilities, and expands EvoPilot
into a general coding-Agent product.

### Continue 5.1.0 and add these changes incrementally

Rejected. Mandatory Expert/MCP installation, production Lifecycle resource
management, and the explicit external execution plane replace accepted public
boundaries and require major versions.

## Compatibility And Migration

- Public Runtime 5.0.1 and Expert 1.0.1 remain immutable supported baselines.
- Unreleased Runtime 5.1.0 and Expert 1.1.0 are superseded, preserved, and not
  promotable.
- Runtime 6.0.0 and Expert 2.0.0 evolve independently and bind a declared
  compatibility range rather than sharing a version.
- Existing file Lifecycle definitions enter through an explicit validated
  Registry import and retain source provenance; no running binding is silently
  rewritten.
- Real legacy Suite default switching, archival, or retirement occurs only
  after exact public Runtime 6.0.0 and Expert 2.0.0 Host installation and shadow
  evidence, under a separate Cutover Target and explicit human authorization.
- The planned Controlled Experiment Loop and Learning Interoperability scopes
  move unchanged from 5.2/5.3 to 6.1/6.2.

## Consequences

- Ordinary use has one discoverable conversational entry while durable truth
  remains centralized in Runtime.
- Third-party projects can manage changing Pipelines as governed data without
  accumulating Engine name branches or synchronized Suite releases.
- Production Lifecycle management requires persistence, concurrency, audit,
  isolation, dependency, and compatibility implementation beyond a file loader.
- Host Integration Bundles and Agent Runtime adapters require separate
  conformance and upgrade/rollback evidence.
- Machine, CI, administration, and emergency recovery remain possible without
  granting direct human clients a semantic bypass.

## Validation

The Roadmap Gate must fail closed when any proposal:

- makes Harness optional or weakens a Harness obligation;
- lets Evolution Expert own Runtime or Harness truth;
- offers direct CLI or HTTP as an ordinary-human bypass;
- treats a file catalog as production Lifecycle truth;
- embeds or silently uses an unqualified Agent Runtime;
- hard-codes a project, Host, forge, language, or package-manager branch;
- makes legacy Suites Runtime dependencies or ongoing synchronization sources;
  or
- retires installed legacy Suites before separately authorized post-release
  Cutover.

The Runtime 6.0.0 and Expert 2.0.0 Targets must map every Roadmap criterion to
an independent validator, immutable evidence, and a terminal E2E journey when
user-observable. Completion is exactly 100 percent with zero failed, pending,
stale, generic, warning, or unmapped items and `NO_REGRESSION` passed.

## Supersession

This ADR preserves ADR 0001. It supersedes the following accepted decisions
only where they conflict with this record:

- ADR 0002 section 6's treatment of MCP as one normal transport alongside
  direct ordinary-human API/CLI operation and its deployment-time file-catalog
  sufficiency; and
- ADR 0003's optional Evolution Expert and complete ordinary-human headless
  operation decisions.

All other compatible ADR 0002 and ADR 0003 Harness-guided, declarative,
authority, recovery, and independent-versioning constraints remain in force.
