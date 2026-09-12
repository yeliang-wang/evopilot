# EvoPilot Roadmap

## Status And Authority

This Roadmap is the human-readable product plan for EvoPilot. The
machine-readable authority is [`governance/roadmap.yaml`](../../governance/roadmap.yaml).
The accepted [EvoPilot / evopilot-harness boundary](../architecture/adr/0001-evopilot-harness-boundary.md),
[Open Lifecycle Harness](../architecture/adr/0002-open-lifecycle-harness.md),
[Harness-Guided Governed Evolution Runtime](../architecture/adr/0003-harness-guided-governed-evolution-runtime.md),
and [Agent-Native Lifecycle Control Plane](../architecture/adr/0004-agent-native-lifecycle-control-plane.md)
decisions govern the current plan. ADR 0004 supersedes only the conflicting
optional-Expert, ordinary-human direct-entry, file-catalog, and execution-plane
parts of ADRs 0002 and 0003.

Every product feature, architecture, contract, version, and release task must
pass the deterministic Roadmap Gate. `ALIGNED` work may proceed to Target
review. `UNPLANNED`, `DEVIATION`, `BOUNDARY_CHANGE`, and `UNKNOWN` work stops
for explicit user review. A boundary change additionally requires a replacement
ADR, migration and compatibility analysis, executable guard updates, a formal
Roadmap revision, and explicit approval.

In Codex, `$evopilot-evolution-orchestrator` remains the conversational entry
for repository evolution. It is not the EvoPilot product Lifecycle Runtime or
the independently distributed Evolution Expert. External evidence, LLMs, Agent
Hosts, and Agent Runtimes never approve a Roadmap change, Evolution Target,
Acceptance, Harness publication, or Release.

The public EvoPilot Runtime `v5.0.0` and Evolution Expert `v1.0.0` artifacts are
immutable published predecessors. Their historical acceptance records remain
process evidence, but the completion audit found that they did not prove the
entire approved v5 scheme. Runtime `v5.0.1` and Evolution Expert `v1.0.1` are
the completed public recovery releases. The unreleased Runtime `v5.1.0` and
Evolution Expert `v1.1.0` lines are superseded and cannot be promoted. Runtime
`v6.0.0` and Evolution Expert `v2.0.0` are the current independently versioned
Agent-native Lifecycle control-plane releases.
Runtime, Expert, Host Adapter, Agent Runtime, Harness Asset, Ontology, Policy,
Evaluation, and Catalog versions evolve independently.

## Product Direction

EvoPilot v6 is an **Agent-Native Harness-Guided Lifecycle Control Plane**:

```text
EvolutionProjectDefinition
  + user Goal and exact GoalTarget
  + published immutable HarnessBundle
  + tenant/workspace governed immutable LifecycleRevision and Policy
  + qualified Agent Host, Agent Runtime, Provider, Environment, and Authority
    -> HarnessExecutionBinding
    -> TargetPlan
    -> exact pendingExecution delegated to the external Agent Runtime
    -> durable LoopRun iterations
    -> Evidence and deterministic decisions
    -> recovery or Target completion
    -> Acceptance
    -> separately authorized Release
```

The primary invariant is:

> No supported project Goal Target Loop executes without one exact eligible
> published immutable `HarnessBundle` binding and one exact resolved Lifecycle
> binding. Lifecycle strengthens and orchestrates Harness-guided execution; it
> never replaces, weakens, authors, or publishes the Harness definition.

This preserves EvoPilot's existing product center. v6 makes Runtime the durable
project-neutral control plane; Evolution Expert over MCP becomes the only
supported ordinary-human interaction path; qualified third-party Agent Runtimes
perform bounded source work. EvoPilot does not become a Harness-independent
workflow engine, Harness producer, general coding Agent, Agent Host, or
model-training system.

## Four Independent Lifecycle Planes

The word *lifecycle* has four distinct meanings in this product family:

1. **Repository evolution lifecycle** governs changes to EvoPilot source through
   this Roadmap, an approved Evolution Target, acceptance, and a separate
   Release authorization. A Codex Suite may assist that repository work, but it
   is not the EvoPilot product Lifecycle.
2. **EvoPilot product Lifecycle** executes a user project's Goals and Targets
   through Harness-guided Loops from product-owned definitions and durable
   runtime state.
3. **Harness Asset lifecycle** is owned independently by `evopilot-harness`:
   evidence ingestion, reasoning, authoring, review, approval, evaluation,
   Catalog, Registry, and publication. EvoPilot is a dynamic read-only consumer.
4. **Evolution Expert lifecycle** independently versions, accepts, publishes,
   upgrades, and rolls back the mandatory ordinary-human Skill distribution
   installed into qualified third-party Agent Hosts.

These planes may exchange immutable evidence and compatibility metadata. They
never share canonical state, authority, semantic versions, or automatic future
evolution.

## Domain Model And Project Neutrality

`EvolutionProjectDefinition` is the aggregate root for a registered project. It
is human-readable YAML with a published schema, canonical form, version, digest,
semantic diff, compatibility result, impact preview, migration result, and
rollback point. It composes:

- `SoftwareArchetype`
- `CapabilityPack`
- `LifecycleModule`
- `PolicyPack`
- `GovernancePack`
- `ActionProviderDefinition`
- `ProviderBinding`
- `EnvironmentBinding`
- `ReleaseChannelBinding`
- `SecretRef`
- `HumanAuthorityRole`

DataRig, EvoPilot, and `evopilot-harness` are non-privileged reference
declarations rather than Engine branches. Repository paths, build commands,
package coordinates, environments, channels, approvers, credentials, and
release constants are discovered facts, typed inputs, approved defaults, or
external references. A materially different project must onboard and complete
a representative Goal with zero project-specific Engine source change.

Active runs bind an immutable resolved project definition. A later definition
revision affects future runs only unless an explicit governed migration is
approved. Project types must not use `HarnessProfile`, `HarnessBundle`, or other
names that collide with assets owned by `evopilot-harness`.

## Published Harness Consumption And Immutable Binding

`evopilot-harness` publishes Harness assets. EvoPilot dynamically and read-only
reads the configured Registry and enabled Catalog roots at planning and
revalidation time. It never imports, copies, edits, approves, signs, publishes,
or mutates Harness assets, Catalogs, or the Registry.

### Selection

For an exact project and GoalTarget, EvoPilot:

1. validates Registry and Catalog status and digests;
2. derives matching context from the versioned project definition and exact
   GoalTarget rather than a repository-name branch;
3. evaluates published `HarnessProfile` classification, positive concepts,
   negative concepts, boundaries, capabilities, compatibility, and Catalog
   priority;
4. returns ranked candidates, selection reasons, rejected alternatives,
   uncertainty, ambiguity, and abstention evidence;
5. resolves one eligible published immutable `HarnessBundle` and its required
   `HarnessComponent` closure; and
6. composes a compatible open Lifecycle around that Harness contract.

If multiple candidates remain semantically ambiguous, EvoPilot presents exact
alternatives and requires one project-meaning decision. If no candidate is
eligible, it abstains before execution and may route an explicitly approved,
private, redacted Harness-gap feedback package. It never falls back silently to
a generic Harness.

### HarnessExecutionBinding

The v5 combined binding records:

- project definition, Goal, and Target references and digests;
- Registry reference and digest;
- Catalog id, planning digest, priority, entry path, and entry digest;
- Profile id, version, and digest;
- Bundle id, version, and digest;
- required Component ids, versions, digests, and flags;
- execution plan, constraints, required evidence, validators, and capabilities;
- selection reasons, rejected alternatives, uncertainty, and decision evidence;
- Lifecycle id, version, source digest, resolved digest, and import closure;
- Policy, Provider, Environment, Host, Runtime, and authority bindings.

The binding is immutable for the GoalTarget and LoopRun. Before Loop creation,
start, resume, retry, and every iteration, EvoPilot re-reads and validates the
bound Harness and Lifecycle closure. A changed, removed, unpublished, invalid,
or incompatible bound asset blocks before the next executor mutation.
Unrelated additive Catalog growth is accepted when the complete bound asset
closure is unchanged. A newly published Harness version applies only to a new
plan or explicit governed migration; it never rewrites an existing plan or run.

### Composition And Conflict

Composition takes the intersection of permitted effects and the union of
required obligations. Priority is:

1. non-bypassable safety and current authority;
2. tenant, workspace, project, credential, environment, and provider
   restrictions;
3. published Harness constraints, validators, evidence, and capabilities;
4. resolved Lifecycle orchestration, automation, recovery, Candidate,
   acceptance, Release, and rollback rules; and
5. qualified Runtime and Host capabilities.

Lifecycle may sequence or add Harness work. It cannot remove Harness-required
evidence, disable a mandatory validator, expand a forbidden capability, or
reinterpret a Harness boundary. Harness defines professional execution
semantics but cannot grant source, credential, database, production,
acceptance, publication, or Release authority. An irreconcilable conflict
produces a deterministic report and blocks before mutation.

## Governed Lifecycle Control Plane Around The Harness Core

Each tenant/workspace-scoped `LifecycleDefinition` is human-readable YAML with
`apiVersion`, `kind`, `metadata`, and `spec`. The production source of truth is
a governed Lifecycle Registry containing canonical immutable
`LifecycleRevision` records and explicit active pointers. File catalogs are
bootstrap and reference imports only. Definitions declare typed inputs, stage
dependencies, imports, bounded conditions, evidence requirements, retry,
recovery, decisions, Candidate construction, acceptance, Release, rollback,
and completion. They reference a closed versioned Action and Capability
Registry; YAML cannot embed arbitrary shell, code, raw secrets, host-specific
executables, or hidden authority.

Evolution Expert exposes create/register, list, inspect, resolve, semantic diff,
successor update, activate, deactivate, archive, restore, rollback, dependency,
usage, and audit journeys through MCP. Updates always create a successor
revision. User-facing deletion means deactivate plus archive or tombstone;
physical deletion is forbidden for referenced revisions and is allowed only for
an explicitly eligible unreferenced draft. Mutations are idempotent, bind the
expected active digest, enforce referential integrity, persist crash-safely, and
append immutable audit evidence. Active-pointer changes affect future planning
only; existing Loops retain and revalidate their exact bound revision.

Resolution produces one immutable `LifecycleRevision`. Every run binds the
revision, its input and policy closure, the complete `HarnessExecutionBinding`,
and the qualified Agent Runtime.

The decision modes are:

- `AUTO`
- `POLICY`
- `HUMAN`
- `EXTERNAL_SIGNAL`
- `DISABLED`

Inputs are resolved from project discovery, Organization and Lifecycle defaults,
Harness requirements, Runtime capability discovery, deterministic derivation,
interactive answers, and external `SecretRef` values. The same schema drives
Evolution Expert, MCP, validation, and machine integrations. EvoPilot discovers
and validates before asking and asks only unresolved relevant questions.
Parameter capture is not authority.

Deterministic, reversible, bounded work within current authority is automatic by
default. This includes validation, build, test, smoke, evaluation, soak
orchestration, evidence capture and aggregation, repository hygiene, approved
workflow-mechanics repair, receipt reconciliation, duplicate suppression, safe
resume, and safe identical-input retry. A human remains necessary only for
product or project meaning, authority expansion, credentials, production or
database access, destructive or externally visible effects, Acceptance,
publication, Release, an irreducible ambiguity, exhausted recovery, or the
one-time activation of a reusable automation class.

## Recovery And Automation Learning

The Recovery Controller classifies, reconciles, repairs, retries, resumes,
verifies, and performs declared rollback automatically when the action is
deterministic, bounded, safe, and authorized.

When a new technical failure class reaches a human stop, EvoPilot evaluates
whether it can become an Automation Registry rule. A proposal binds exact match
conditions, action, verification, retry budget, rollback, authority, expiry, and
suspension behavior. One explicit decision may activate the rule. Later exact
matches execute automatically. Verification failure or drift suspends it.

Recovery never expands authority, repeats an uncertain mutation, hides changed
state, or converts business ambiguity into a technical repair.

## Agent Hosts And Agent Runtimes

EvoPilot remains Host-neutral and Runtime-neutral:

```text
Human -> Codex / Claude Code / WorkBuddy / another qualified Host
  -> Evolution Expert
  -> MCP
  -> EvoPilot Runtime and HarnessExecutionBinding
  -> AgentRuntimeAdapter / ExecutorAdapter
  -> Codex, OpenCode, or another qualified Runtime
  -> normalized result, trajectory, usage, artifacts, and evidence
```

A Host carries conversation, Expert presentation, exact decision display, and
MCP session integration. EvoPilot Runtime owns projects, Lifecycles, Goals,
Targets, Loops, bindings, policies, evidence, recovery, authority, audit, and
durable state. A qualified external Agent Runtime performs bounded source
inspection, modification, test, build, analysis, and repair from one exact
`pendingExecution`, then returns a normalized receipt, trajectory, usage,
artifacts, and evidence. One external product may implement either or both Host
and Agent Runtime roles, but each role is qualified independently. OpenCode
remains the first first-class coding Runtime adapter. Codex is an official Host
and may qualify independently as a Runtime. EvoPilot never silently embeds a
general-purpose coding Agent or falls back to an unqualified Host or Agent
Runtime.

The Runtime may execute only the exact `pendingExecution` action and capability
intersection permitted by the combined binding. Agent output cannot bypass
normalization, Harness validators, Lifecycle policy, human authority, source
closure, acceptance, or project Release decisions.

## Mandatory, Independently Versioned Evolution Expert

`@evopilot/evolution-expert` is the official Agent-neutral Skill distribution.
Version `2.0.0` is the mandatory ordinary-human entry for Runtime `6.0.0`, but
it remains independently versioned and is not embedded into or
lockstep-versioned with the Runtime.

The initial source may be co-located as an independent EvoPilot workspace so
protocol and official integration changes are reviewed together. It retains a
separate package version, changelog, tag namespace, Candidate workflow,
Acceptance Binding, Release authorization, public artifact, upgrade, and
rollback. It may move to a separate repository later without changing the
public protocol.

The package contains one Agent-neutral Core plus generated Codex, Claude Code,
WorkBuddy, generic Agent Host, and generic MCP Host adapters. A Host Integration
Bundle binds the exact Expert, generated Adapter, MCP configuration, Runtime
launcher or administrator-managed endpoint, and install, health, upgrade,
rollback, and removal metadata. Host formats may differ, but every Adapter binds
the same Core digest and contains no Host-specific Lifecycle, Harness-selection,
approval, recovery, credential, or durable-state semantics. Compatibility binds
the Expert version, Runtime protocol range, Expert protocol version, Core
digest, Adapter identity and digest, required Host capabilities, and conformance
status.

The Expert guides first use, learning, tutorials, project registration and
adjustment, Harness selection explanation, Goal evolution, inspection,
recovery, resume, acceptance, and Release preparation. It asks the Runtime to
select and bind a Harness, presents the exact result and alternatives, and may
explain a conflict or abstention. It cannot choose, fabricate, edit, approve,
publish, or override a Harness, validator, evidence requirement, digest,
authority, or Runtime decision.

Natural language through Evolution Expert and MCP is the only supported
ordinary-human entry. Supported journeys cannot require
memorized slash commands, CLI commands, MCP tool names, digests, or approval
tokens. The Runtime owns durable session state. After restart or Host transfer,
the Expert reloads and reconciles current Runtime state instead of trusting chat
history. CLI, HTTP API, and CI remain available only for machine integration,
administration, diagnostics, compatibility, and emergency recovery when Expert
or one Adapter is absent or incompatible; they are not an ordinary-human
fallback and cannot bypass Runtime semantics or authority.

## Reference Instances

- **DataRig** proves enterprise-internal GitLab, Maven, authorized database, and
  internal promotion behavior expressed only through declarations.
- **EvoPilot** proves GitHub open-source private Candidate, isolated acceptance,
  GitHub Release, npm, GHCR, installer, and Deployment closure.
- **evopilot-harness** proves independent Harness-producer evolution, npm
  distribution, and real third-party Host acceptance without crossing Harness
  Asset authority.
- **Unknown project** proves onboarding and Goal completion through declaration
  and composition with zero Engine source change.

## Acceptance Portfolio

The v5 Runtime and Expert Targets must expand the complete inherited v4
acceptance into:

- `FUNC01`–`FUNC21`: Project Definition, Lifecycle, recovery, providers,
  Hosts/Runtimes, Expert protocol, independent Expert lifecycle, dynamic Harness
  matching, immutable combined binding, composition, and Catalog evolution.
- `CAP01`–`CAP16`: project, Host, Runtime, provider, version, and deployment
  neutrality; authority and isolation; bounded recovery; legacy independence;
  novice usability; graceful degraded mode; Harness-guided invariance; and
  strict read-only monotonic composition.
- `DOC01`–`DOC13`: README, installation, concepts, DDD architecture, integration,
  CLI/API/MCP/schema references, migration, tutorials, Expert lifecycle, Adapter
  development, and the Harness-guided Goal Target Loop guide.
- `E2E01`–`E2E13`: exact real journeys listed below.
- `TRACE01`–`TRACE06`: original-scheme inventory, complete mapping, independent
  validators, terminal E2E contracts, fail-closed aggregation, and the final
  100-percent completion report.

Every criterion maps to deterministic evidence and at least one real journey or
declared machine variant. Equivalent variants are generated and aggregated
automatically instead of creating repeated human gates. Screenshots,
source-checkout runs, unit tests, prose claims, and partial aggregates cannot
substitute for their required evidence class. Release readiness requires 100%
PASS, complete inherited acceptance, complete impact closure, and
`NO_REGRESSION`.

### v6 Agent-Native Control-Plane Acceptance

Runtime `6.0.0` and Expert `2.0.0` must bind one exact installed Candidate pair
and close 100 percent of current functional, capability, applicable inherited,
Lifecycle CRUD, Host/MCP, Agent Runtime, impact, and no-regression evidence.
The mandatory real journeys are:

1. `E2E-INSTALL-CODEX`, `E2E-INSTALL-CLAUDE-CODE`, and designated-human
   `E2E-INSTALL-WORKBUDDY` prove fresh Host Integration Bundle installation,
   Expert discovery, MCP health, exact versions, and side-effect-free tutorial.
2. `E2E-LIFECYCLE-CREATE`, `READ`, `UPDATE`, `DEACTIVATE`, `ARCHIVE`,
   `ROLLBACK`, and `IMPORT` prove complete immutable-revision lifecycle,
   historical integrity, dependency/usage views, active-pointer semantics, and
   safe module composition through Expert and MCP.
3. `E2E-TENANCY`, `RESTART`, and `SECURITY` prove scope isolation, crash-safe
   recovery without chat history, concurrency, audit, closed actions,
   `SecretRef`, permission bounds, and rejection of arbitrary execution.
4. `E2E-AGENT-RUNTIME` proves Expert starts a Harness-guided Goal Target Loop,
   Runtime emits exact `pendingExecution`, a qualified external Agent Runtime
   performs bounded source work, and Runtime verifies the normalized receipt.
5. `E2E-CROSS-HOST` proves Codex creates, Claude Code inspects, and the
   designated WorkBuddy operator authorizes the same Runtime-owned object
   without semantic divergence.
6. `E2E-REFERENCE-DATARIG`, `REFERENCE-EVOPILOT`, and `REFERENCE-HARNESS`
   prove three non-privileged declarations, including a real published
   `HarnessBundle` guiding the EvoPilot repository Loop without Harness writes.
7. `E2E-NO-SUITE` proves all representative journeys with both legacy Suites
   absent and `legacySuiteInvocationCount=0`; `E2E-SOAK` then runs the exact
   installed pair actively for 5400 seconds.

Every item requires criterion-specific immutable evidence and an independent
validator. Unit tests, source-checkout simulations, screenshots, prose, partial
aggregates, and v5.1 Candidate evidence cannot substitute for exact installed
v6 E2E. Any failed, pending, stale, generic, warning, or unmapped required item
keeps completion `INCOMPLETE`.

### Original-Scheme Completion Assurance

Runtime `5.0.1` and Evolution Expert `1.0.1` are completion successors, not a
license to reinterpret or shorten the approved v5 design. Their Targets must
bind one digest-addressed inventory containing every accepted v5 Roadmap clause,
both original Targets, every explicit user correction, and every audited gap.
Each item must trace to successor scope and acceptance, an implementation
deliverable, an independent executable validator, concrete evidence, and a
terminal E2E journey when the behavior is user-observable.

`TRACE01`–`TRACE06` enforce inventory binding, complete mapping, independent
validation, terminal-state E2E coverage, fail-closed aggregation, and the final
100-percent completion report. Silent exclusions, bulk PASS projection,
warning-as-pass, generic aggregate evidence, and substitution of a human
declaration for required machine evidence are forbidden. Completion is valid
only when `total == passed`, every failed, pending, stale, generic, and unmapped
count is zero, the exact installed Runtime/Expert Candidate pair is verified,
and `NO_REGRESSION` passes. Anything less remains `INCOMPLETE` and returns the
exact affected scope to implementation or evidence collection.

### Superseded v5.1 Convergence Acceptance History

Runtime `5.1.0` and Expert `1.1.0` were not released. Their Targets, Candidates,
and partial acceptance remain immutable development and impact evidence only;
they cannot accept or release v6. Their frozen scope required:

1. exact differential parity for EvoPilot Suite `3.2.1` and DataRig Suite
   `2.1.5`, with 100% inventory coverage and zero silent exclusions;
2. project-neutral Governance Packs, Action Providers, receipts, qualification,
   rollback, and authority constraints;
3. bounded autonomous remediation through diagnosis, repair, immutable source
   and replacement-Candidate lineage, per-Candidate readiness, failed-first
   rerun, impact closure, full regression, and deterministic stop budgets;
4. DataRig, EvoPilot, `evopilot-harness`, and unknown-project journeys with zero
   project-name Engine branches;
5. Codex, designated-human WorkBuddy, independent Host, generic MCP, and
   headless conformance against one exact installed Runtime/Expert pair;
6. success, failure, resume, upgrade, rollback, authority-stop, and Suite-absence
   variants with `legacySuiteInvocationCount=0` and no hidden fallback;
7. a post-Cutover capability upgrade delivered through EvoPilot-owned Runtime,
   resource, Provider, or Expert packages without editing either retired Suite;
8. public installation, side-by-side shadow observation, and complete readiness
   for the separately authorized default switch, archive, rollback rehearsal,
   monitoring, and retirement closure.

The convergence completion formula is: capability inventory 100%, every current
and inherited functional, capability, differential, documentation, Host, E2E,
impact-closure and no-regression item passed, exact installed Candidate pair
verified, and legacy invocation count zero. A partial aggregate remains
`INCOMPLETE`.

### Required End-To-End Journeys

1. `E2E01` — novice clean install, capability discovery, installed-version help,
   and side-effect-free tutorial in Codex and WorkBuddy.
2. `E2E02` — unknown project discovery, typed onboarding, reviewed YAML
   registration, and first governed Goal with zero Engine source diff.
3. `E2E03` — existing project definition adjustment, semantic impact preview,
   active-run stability, migration, and rollback.
4. `E2E04` — DataRig enterprise-internal GitLab, Maven, database-authorized, and
   internal-promotion reference with the DataRig Codex Suite absent from the
   isolated Candidate environment while its real installed Suite remains active
   and untouched.
5. `E2E05` — EvoPilot GitHub open-source self-evolution from Roadmap through
   exact Candidate, isolated acceptance, no-rebuild Release, npm, GHCR,
   installer, and terminal Deployments.
6. `E2E06` — `evopilot-harness` producer evolution and real Host acceptance
   without EvoPilot writing Harness assets.
7. `E2E07` — deterministic repair, new Automation Registry rule, crash, timeout,
   disconnect, duplicate event, restart, resume, and Host transfer without
   duplicate mutation or stale authority.
8. `E2E08` — exact private RC before counted E2E, installed-package acceptance,
   separate Release authorization, accepted-byte promotion without rebuild, and
   complete public verification.
9. `E2E09` — read-only shadow comparison against late-bound exact EvoPilot and
   DataRig Codex Suite snapshots, followed by isolated Candidate runs where both
   Suites are absent; fresh start, failure, resume, upgrade, and rollback must
   prove zero invocation and no hidden fallback without mutating the real
   installed Suites.
10. `E2E10` — Evolution Expert upgrade and rollback against the same Runtime
    without changing Runtime bytes or version.
11. `E2E11` — add and qualify a new third-party Host Adapter, bind the same Core
    digest, complete representative journeys, and make zero Engine source change.
12. `E2E12` — Expert absent, unavailable, or incompatible while CLI, API, and CI
    complete a headless journey with a precise compatibility diagnosis and no
    legacy fallback.
13. `E2E13` — configure a read-only Registry, match Project plus GoalTarget to a
    published Profile, bind the exact Bundle and Component closure, compose an
    open Lifecycle, execute multiple Loop iterations, collect Harness-required
    evidence, and reach the Target or a precise safe blocker. Variants must prove
    tamper blocking, removed-asset blocking, additive Catalog growth, new-version
    isolation, deterministic abstention, explicit ambiguity, composition
    conflict, authority non-escalation, cross-Host equivalence, and zero Harness
    writes.

## Frozen Suite Reference Evidence

The unreleased Runtime `5.1.0` and Evolution Expert `1.1.0` work captured Suite
capability evidence but is not promotable. In v6, *contains the Suite
capabilities* means project-neutral public Runtime contracts, declarative
resources, qualified Action Providers, and one Agent-neutral Expert Core. It
never means copying, synchronizing, loading, invoking, or publishing either
legacy Suite directory as Runtime implementation.

The migration is **latest-only**. The currently observed exact baselines are:

- EvoPilot Codex Suite `3.2.1`, snapshot
  `sha256:95e614c87b4bf01938ad559a9f13c4a00a4034437d6b59a22119ff53f22cf2f7`;
- DataRig Codex Suite `2.1.5`, snapshot
  `sha256:064ee6a8a7b21ae8029cfaaf03eafef7ff0816a8b031d8468c49eae6b5b4a330`.

These exact snapshots are frozen migration and E2E fixtures. They do not define
Runtime scope, become a Runtime dependency, require ongoing synchronization, or
receive privileged Engine behavior. Later legacy Suite versions do not expand
the v6 Target automatically. Future compatible project Pipeline changes are new
tenant/workspace Lifecycle, Project, Policy, Governance, Provider, Environment,
Channel, `SecretRef`, or Authority resource revisions. Runtime or Expert
versions change only when a genuinely project-neutral public contract changes.

Capability parity is not inferred from zero invocation. A canonical inventory
must map every baseline behavior, stop rule, authority boundary, recovery class,
acceptance obligation, E2E journey, and release surface to one tested Runtime,
Expert, declarative-resource, Action Provider, owning-project, or explicit
non-applicable disposition. Coverage is 100%; silent exclusion, generic PASS,
and an unmapped item fail closure.

DataRig's bounded autonomous defect-closure campaign becomes a project-neutral
Runtime capability: digest-bound diagnosis and repair budgets, immutable repair
and replacement-Candidate lineage, per-Candidate readiness and secret leases,
failed-case-first rerun, impact closure, full regression, safe resume, and exact
authority stop conditions. DataRig, EvoPilot, and `evopilot-harness` provide
declarative reference instances; Runtime code cannot branch on their names.

The final Host surface is one released generated Evolution Expert Adapter. It
contains no project Lifecycle, Harness selection, approval, recovery,
acceptance, release, credential, or durable-state semantics. It guides ordinary
users only through EvoPilot's MCP contracts; CLI and HTTP remain machine,
administrator, diagnostics, compatibility, and emergency-recovery surfaces.

## Legacy Suite Transition

The active EvoPilot Codex Suite and DataRig Codex Suite remain untouched while
Runtime `6.0.0` and Expert `2.0.0` are implemented and accepted. They are frozen
migration and reference inputs, not product components. Their supported
replacement is:

```text
EvoPilot Runtime 6.0 control plane
  + compatible independently installed Evolution Expert 2.0
  + generated Host Adapter and MCP binding
  + tenant/workspace governed project, Lifecycle, Policy, Governance, and Action Provider resources
  + qualified external Agent Runtime
```

Comparison is read-only and binds the Target-frozen exact latest snapshots:
source identity, version, tree digest, Skill/rule inventory, capture time, and
corpus digest. Counted Candidate E2E uses an isolated environment in which both
Suites are absent and records `legacySuiteInvocationCount=0` with no hidden
fallback. Capability inventory parity, real behavior, inherited acceptance,
impact closure, and `NO_REGRESSION` must pass in addition to absence proof.

Actual default switching, archival, and retirement may begin only after Runtime
`6.0.0` and Evolution Expert `2.0.0` are publicly released, their exact accepted
bytes pass fresh installation, the released Codex Host Integration Bundle is installed beside
the legacy Suites, and a bounded shadow observation succeeds. The work requires
a separate Cutover Target and a separate explicit human authorization. Any
break-glass rollback is separately authorized, audited, and never an automatic
fallback. This Cutover is not a `6.0.0` Release blocker.

After Cutover closes, both legacy Suites are absent from normal Codex discovery,
have no hidden fallback or Runtime dependency, and remain only as immutable,
digest-inventoried migration evidence and test fixtures. They receive no further
independent feature evolution. Harness authoring, review, approval, Catalog,
Registry, and publication remain independently owned by `evopilot-harness`.

## Candidate, Acceptance, And Release Topology

Runtime and Evolution Expert have independent Targets, commits, Candidates,
Acceptance Bindings, release authorizations, tags, artifacts, release notes, and
public verification. Cross-product acceptance binds exact Runtime Candidate,
Expert Candidate, Core and Adapter digests, protocol and Host versions, Registry
and Catalog digests, and `HarnessExecutionBinding`; it does not merge authority
or version numbers.

The ordered program topology is:

```text
Roadmap revision approved
  -> Runtime Target and Expert Target separately approved
  -> implementation and local verification
  -> exact commits frozen
  -> one private Runtime Candidate and one private Expert Candidate
  -> official handoffs downloaded and verified
  -> exact pair installed outside source checkout
  -> functional, capability, documentation, Adapter, real-Host, and E2E acceptance
  -> inherited acceptance and NO_REGRESSION closure
  -> separate Runtime and Expert Release authorizations
  -> accepted bytes promoted without rebuild
  -> public install, compatibility, registry, and terminal Deployment verification
```

Candidate formation always precedes counted E2E. A source-checkout run or rebuilt
substitute is not Candidate acceptance. Acceptance never implies Release
authority.

## Versioned Milestones

### v3.2.0: Bundle Consumer Closure

Status: `DEFERRED INTO COMPLETED v4.0.0`

The line was not released independently. Its Profile matching, immutable
Bundle/Profile/Component closure, per-iteration revalidation, and read-only
consumer guarantees were inherited and released through v4. They remain
mandatory v5 regression evidence.

### v4.0.0: Open Lifecycle Harness

Status: `COMPLETE`

The public v4.0.0 baseline delivered open Lifecycle contracts, schema-driven
input, risk-tiered decisions, Agent Runtime adapters, trajectory evidence, and
feedback-package foundations while retaining Harness-guided execution. All v4
product, API, CLI, evidence, authority, tenancy, security, migration,
distribution, acceptance, and public-release guarantees are inherited by v5.

### v5.0.1: Harness-Guided Governed Evolution Runtime Completion Recovery

Status: `COMPLETE`

The immutable public `v5.0.0` predecessor did not by itself prove completion.
`v5.0.1` delivers and independently proves the DDD project model,
first-class published Harness consumption
and combined execution binding, open project-neutral Lifecycle composition,
bounded recovery and automation learning, stable Human Interaction Protocol,
official Codex support, multi-Host and Runtime conformance, four reference
projects, independent Expert integration, isolated legacy Suite independence
proof, post-release Cutover readiness, and the full
`FUNC01`–`FUNC21`, `CAP01`–`CAP16`, `DOC01`–`DOC13`, `E2E01`–`E2E13`, and
`TRACE01`–`TRACE06` portfolio with 100-percent original-scheme traceability and
`NO_REGRESSION`. All 137 Runtime criteria passed within the 195-item combined
campaign, the exact installed Candidate pair was verified, and the public
GitHub Release, GHCR image, six npm packages, signatures, provenance, clean
installation, and CLI entrypoints match the accepted bytes.

### Evolution Expert v1.0.1 Completion Recovery

Status: `COMPLETE`, independent companion product

The immutable public `v1.0.0` predecessor remains historical process evidence.
`v1.0.1` independently proves one Agent-neutral Core, Codex and WorkBuddy
Adapters, generic Host and MCP guidance, schema-driven onboarding and project
adjustment, Harness and Lifecycle explanation, installed-version help,
side-effect-free tutorials, Runtime-owned resume, independent upgrade and
rollback, and a third-party Host Adapter conformance kit. It is complete only
with the same `TRACE01`–`TRACE06`, exact-pair, 100-percent coverage, and
`NO_REGRESSION` discipline. All 58 Expert criteria passed within the combined
campaign; the public Expert package matches the accepted tarball, its npm
signature and SLSA provenance verify, and independent installation proves the
CLI, generated Codex Skill, Core digest, adapter binding, and Runtime 5.0.1
compatibility.

### v5.1.0: Suite Capability Convergence

Status: `SUPERSEDED BEFORE RELEASE`

Productize the exact latest EvoPilot Codex Suite `3.2.1` and DataRig Codex Suite
`2.1.5` capabilities into the Harness-guided Runtime, declarative resources,
qualified Action Providers, and independently versioned Evolution Expert. Prove
100-percent capability inventory coverage, DataRig-grade bounded autonomous
remediation, exact acceptance completeness, four project references, Host and
headless conformance, zero legacy invocation, no hidden fallback, and public
installation readiness without embedding or modifying either Suite. Candidate
workflow `34542756424` and its incomplete acceptance remain immutable
development and impact evidence only and are not promotable.

### Evolution Expert v1.1.0: Unified Host Entry

Status: `SUPERSEDED BEFORE RELEASE`, independent companion product

Deliver one Agent-neutral Expert Core and generated released Codex, WorkBuddy,
generic Agent, and generic MCP adapters for Runtime `5.1.0`. The Codex Adapter
becomes the eventual single human entry but owns no project Lifecycle, Harness
selection, approval, recovery, acceptance, release, credential, or durable
state. Candidate workflow `34475009290` remains immutable development and
impact evidence only and is not promotable. Expert and Runtime versions and
Releases remain independent.

### v6.0.0: Agent-Native Harness-Guided Lifecycle Control Plane

Status: `COMPLETE` — Runtime `176/176`, joint campaign `253/253`, cross-acceptance `10/10`

Deliver the public project-neutral control plane. Ordinary users install a Host
Integration Bundle into Codex, Claude Code, WorkBuddy, or another qualified AI
Agent Host and interact only with Evolution Expert over MCP. Runtime owns
durable projects, Lifecycle revisions, Goal/Target/Loop state, immutable
Harness bindings, evidence, recovery, authority, and audit. Project Pipeline
CRUD is tenant/workspace scoped and uses immutable successor revisions,
activation, deactivation, archive, restore, rollback, dependency, usage, and
audit operations. Qualified external Agent Runtimes execute exact
`pendingExecution` work and return normalized receipts. Compatible project
Pipeline evolution requires no Runtime or Expert source change.

The exact installed Runtime `6.0.0` and Expert `2.0.0` Candidate pair passed
all required acceptance, impact closure, `NO_REGRESSION`, and the 5400-second
active soak with `legacySuiteInvocationCount=0`. The accepted bytes are public
as GitHub Release, npm, and Runtime GHCR artifacts and were independently
verified without rebuild.

### Evolution Expert v2.0.0: Mandatory Agent Host Entry

Status: `COMPLETE` — Expert `77/77`, joint campaign `253/253`, cross-acceptance `10/10`; independent companion product

Deliver one stateless, non-authoritative Expert Core and generated Codex,
Claude Code, WorkBuddy, generic Agent Host, and generic MCP Host adapters. Every
ordinary-human project, Lifecycle, Harness-guided Loop, recovery, acceptance,
and release journey is guided through MCP without requiring CLI commands, HTTP
construction, tool-name knowledge, or manual state editing. Runtime remains the
sole source of truth and authority.

The public Expert `2.0.0` package, Skill/Core schema v2, MCP surface, generated
Host adapters, signatures, provenance, installation, and Runtime `6.0.0`
compatibility were verified from the accepted Candidate bytes.

### Post-v6.0.0: Legacy Suite Cutover

Status: `PLANNED`, not a v6.0.0 release blocker

Exact public Runtime `6.0.0` and Expert `2.0.0` installation is now verified,
but no Cutover has been authorized or executed. Only after the required
side-by-side shadow observation may a separately approved Cutover Target switch
the current Codex default to released EvoPilot, prove zero legacy invocation on
real paths, create digest-inventoried recoverable archives, rehearse separately
authorized rollback, and close after monitoring. After closure, both legacy
Suites are immutable migration evidence only and receive no further independent
feature evolution.

### v6.1.0: Controlled Experiment Loop

Status: `PLANNED`

Run comparable Champion/Challenger strategies over Harness-guided trajectories,
evaluate outcome/process/safety/cost, replay controlled evidence, and promote or
roll back only after benchmark, bad-case, regression, and human gates.

### v6.2.0: Learning Interoperability

Status: `PLANNED`

Export consented, redacted, reproducible preference and reward datasets to
external Trainer systems and re-enter trained policies through provenance,
evaluation, and promotion gates. Distributed model training remains external.

## Cross-Project Feedback

The feedback path remains offline and reviewable:

```text
EvoPilot Harness-guided Loop
  -> private HarnessExecutionFeedbackPackage
  -> redaction + integrity + explicit approval
  -> evopilot-harness reads it as Evidence Source
  -> Proposal + Evaluation + Review + human approval
  -> new published Harness version
  -> a new EvoPilot plan may select that immutable version
```

Feedback never allows EvoPilot to mutate Harness assets or
`evopilot-harness` to execute a project Loop.

## Standing Work And Change Control

Correctness, security, documentation synchronization, dependency maintenance,
compatibility, and regression repair remain standing work when they do not add
an undeclared product capability or cross a boundary. Repository and Codex
workflow governance is standing work only when it does not change product
semantics, versions, milestones, or authority.

1. Start EvoPilot-series evolution through `$evopilot-evolution-orchestrator`.
2. Run `npm run roadmap:gate -- --intent "<requested change>" --json` before
   product implementation.
3. Proceed to Target review only for `ALIGNED`.
4. Require an approved `evopilot-evolution-target/v1` bound to the current
   Roadmap digest, milestone, version, inherited acceptance, scope, exclusions,
   regression impact, real cases, Candidate topology, and Release evidence.
5. Rerun the binding gate after Roadmap or scope drift and before implementation,
   acceptance closure, and Release.
6. A one-task exception cannot revise this Roadmap or authorize a Release.
7. Boundary change requires a replacement ADR and formal Roadmap revision.
8. Implementation approval and Acceptance never imply Release authorization.

Runtime release gates use:

```bash
npm run roadmap:release -- <runtime-version>
```

Evolution Expert release gates use:

```bash
npm run roadmap:release -- <expert-version> --release-product evopilot-evolution-expert
```
