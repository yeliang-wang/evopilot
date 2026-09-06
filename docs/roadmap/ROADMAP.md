# EvoPilot Roadmap

## Status And Authority

This Roadmap is the human-readable product plan for EvoPilot. The machine-readable authority is [`governance/roadmap.yaml`](../../governance/roadmap.yaml). The accepted [EvoPilot / evopilot-harness boundary ADR](../architecture/adr/0001-evopilot-harness-boundary.md) remains a harder constraint than a milestone.

Every feature, architecture, contract, version, and release task must pass the Roadmap Gate before implementation. `ALIGNED` work may continue. `UNPLANNED`, `DEVIATION`, `BOUNDARY_CHANGE`, and `UNKNOWN` work must stop for user review. A boundary change additionally requires a replacement ADR, migration and compatibility analysis, Roadmap revision, and explicit approval.

In Codex, `$evopilot-evolution-orchestrator` is the conversational entry for user goals and external triggers such as issues, benchmarks, articles, papers, and reports. It may coordinate evidence research, but this Roadmap, accepted ADRs, the deterministic Gate, and explicit user decisions remain authoritative. External evidence, LLMs, and Subagents never approve a Roadmap change, implementation, or release.

The Roadmap does not force EvoPilot and `evopilot-harness` to release together or use the same version. Engine, Harness Asset, Ontology, Policy, Evaluation, Catalog, and consumer versions remain independent.

The published EvoPilot baseline remains `v3.1.0`. The current working version
is `v4.0.0`; the unpublished `v3.2.0` line is deferred into v4 as inherited
acceptance rather than treated as completed or released. This scheduling
revision supersedes only ADR 0002's earlier statement that v3.2 was the current
completion target; its architecture, compatibility, and ownership decisions
remain accepted and unchanged.

## Product Direction

EvoPilot is the control plane that onboards third-party projects, selects a published Harness, binds an immutable `HarnessBundle`, resolves an execution `Lifecycle Harness`, executes Goal Loops, captures evidence, evaluates outcomes, and governs project release decisions.

Its next evolution is an **Agentic Evolution Control Plane**:

```text
Goal + immutable HarnessBundle + resolved Lifecycle Harness
  -> controlled execution trajectory
  -> outcome/process/safety/cost evaluation
  -> replay and candidate comparison
  -> approved strategy promotion or rollback
  -> redacted feedback package for external asset or training systems
```

EvoPilot will not become a Harness producer or a model-training implementation.

## Open Lifecycle Harness

Approved direction as of 2026-09-05: EvoPilot v4 replaces the assumption that
every project progresses through Alpha, Beta, RC, and GA with an open,
versioned execution-lifecycle platform. Alpha/Beta/RC/GA remains available only
as a compatibility profile. The word *Lifecycle* here means how EvoPilot runs a
project Goal or Target; it does not mean the independently governed Harness
Asset lifecycle owned by `evopilot-harness`.

Each `LifecycleDefinition` is human-readable YAML with an `apiVersion`, `kind`,
`metadata`, and `spec`. A definition may declare typed inputs, stages,
dependencies, bounded conditions, evidence requirements, retry and recovery,
decision modes, rollback, and completion. Definitions may be composed and
extended, but they reference a closed, versioned Action and Capability Registry;
YAML cannot carry arbitrary shell or programming-language code. Resolution
produces one immutable `LifecycleRevision`, and every run binds that revision,
its inputs and policies, an immutable published `HarnessBundle`, project and
Goal/Target snapshots, and the selected external Agent runtime.

### Inputs are conversational, not hard-coded

Lifecycle inputs are declared once as a schema containing type, prompt,
description, requirement, default, options, validation, conditional visibility,
source, sensitivity, and review behavior. The same schema drives WorkBuddy,
Codex, another conformant Agent host, UI, MCP, CLI, API, and CI:

- EvoPilot first discovers project facts, Organization defaults, lifecycle
  defaults, runtime capabilities, and deterministic derived values.
- The ordinary human flow asks one unresolved relevant question at a time,
  proposes detected/default values, and presents a final review summary.
- Headless callers provide an explicit YAML or JSON input document governed by
  the same schema and semantics.
- Raw secrets are never requested. The user selects or creates an external
  `SecretRef`; only the reference enters the binding.
- Collecting or editing a parameter is not approval. The completed
  `LifecycleInputBinding` is immutable and digest-bound.

DataRig's enterprise-internal delivery parameters and `evopilot-harness`'s
public open-source release parameters become two reference definitions and
conformance cases. Their repository names, paths, environments, channels,
approvers, policies, and release constants must not become branches in the
generic Engine.

### Human decisions are exceptional

The decision modes are `AUTO`, `POLICY`, `HUMAN`, `EXTERNAL_SIGNAL`, and
`DISABLED`. Deterministic, reversible work within an already authorized scope is
automatic by default. Schema checks, readiness, compatibility, build, test,
smoke, evaluation, evidence capture, deterministic aggregation, safe resume,
and identical-input retry without an uncertain mutation must not require a
ceremonial approval.

A human decision remains only when EvoPilot lacks exact scope/plan authority,
an operation is irreversible or externally visible, production or credential
authority expands, a project release/publication is requested, a policy
exception or material ambiguity exists, risk is unresolved, or the outcome of a
prior mutation is uncertain. One digest-bound authorization may cover the
unchanged bounded plan and all of its automatic stages; only relevant binding
drift invalidates that authority. Readiness, input collection, a chat message
such as “continue”, and an Agent recommendation are never authority by
themselves.

## Agent Runtime Externalization

Approved direction as of 2026-09-02: EvoPilot remains an Agent-runtime-neutral
governance and execution control plane. It must not grow a second product center
that reimplements a general Agent session runtime, model/tool loop, coding-agent
workspace, or model-provider product.

The target operating shape is:

```text
Goal + immutable HarnessBundle + resolved Lifecycle Harness
  -> EvoPilot policy, context, evidence, budget, approval, and release control
  -> versioned AgentRuntimeAdapter / ExecutorAdapter contract
  -> OpenCode, OpenHands/ACP, Codex, Claude Code, or another qualified Agent runtime
  -> normalized execution result, trajectory, usage, artifacts, and evidence
  -> EvoPilot deterministic validation and continuation/release decision
```

- OpenCode is the first planned first-class coding Agent adapter and may become a
  default executor only after comparative acceptance. It is not an exclusive
  product dependency or the owner of EvoPilot state.
- At least one independent Agent adapter must pass the same conformance contract
  before runtime-neutral support is claimed.
- Prompt construction, Agent tool loops, code editing, validation repair, and
  Agent-session internals belong behind the external runtime adapter boundary.
- EvoPilot retains runtime selection and dispatch, capability and health
  preflight, credential references, sandbox policy, structured output contracts,
  deterministic normalization, usage/cost accounting, trajectory and evidence,
  human gates, source closure, and release authority.
- A bounded direct-LLM adapter may remain during migration and for narrow,
  stateless structured transformations. It is not the default production coding
  executor and must not own a general tool loop, code workspace, approval, or
  publication authority.
- Existing direct-LLM and built-in code-upgrader behavior must migrate through
  explicit compatibility and rollback plans; removing or silently reinterpreting
  historical evidence is prohibited.

## Versioned Milestones

### v3.2.0: Bundle Consumer Closure

Status: `DEFERRED INTO v4.0.0`

- Preserve the already implemented Profile matching and immutable Bundle binding.
- Revalidate Bundle, Profile, Component, digest, and execution closure before execution and each iteration.
- Preserve the read-only Harness consumer boundary.

This milestone is neither complete nor released. It is not eligible for a
standalone v3.2 publication unless a future explicit Roadmap revision
reactivates it. Its implementation, documentation, compatibility knowledge,
and acceptance guarantees remain mandatory inherited evidence for v4.0; they
are not discarded or silently treated as passed.

### v4.0.0: Open Lifecycle Harness

Status: `IN_PROGRESS`

v4.0 is the current working line. In addition to the Open Lifecycle Harness
scope below, it must retain and retest v3.2 dynamic published Profile matching,
immutable Bundle/Profile/Component closure, per-iteration digest revalidation,
the read-only Harness consumer boundary, and v3 evidence, authority, tenancy,
`SecretRef`, migration, and rollback compatibility.

- Add versioned `LifecycleDefinition`, `LifecycleRevision`, `LifecycleCatalog`,
  `LifecycleResolver`, `LifecycleBinding`, `LifecycleInputBinding`, and
  `LifecycleRun` contracts.
- Resolve human-readable YAML into a canonical immutable stage graph that binds
  one exact published `HarnessBundle`, project and Goal/Target snapshots,
  policies, inputs, actions, and runtime capabilities.
- Provide an open composition model over a closed Action and Capability
  Registry, bounded conditions, deterministic validation, and fail-closed
  unsupported-capability handling.
- Generate interactive parameter collection from each Lifecycle input schema;
  prefill discoverable values, ask only unresolved relevant questions, use
  `SecretRef` for secrets, and produce one reviewable immutable input binding.
- Apply risk-tiered decision modes and automate deterministic reversible stages
  by default. Preserve human decisions only at genuine authority, external
  effect, production, release/publication, exception, ambiguity, risk, or
  uncertain-mutation boundaries.
- Permit one digest-bound authorization to cover all unchanged automatic work in
  the reviewed plan instead of requiring repeated approvals.
- Ship DataRig enterprise-internal delivery and `evopilot-harness` public
  open-source release as reference profiles/conformance cases; retain
  Alpha/Beta/RC/GA only as a compatibility profile.
- Introduce versioned Agent-runtime profiles, execution request/result contracts,
  capability negotiation, resumable correlation, and normalized evidence behind
  the existing `ExecutorAdapter` boundary.
- Add OpenCode as the first first-class coding Agent adapter and prove at least
  one independent adapter against the same conformance suite.
- Externalize production planning, coding, tool-loop, and validation-repair work
  from the control-plane core while retaining a bounded direct-LLM compatibility
  adapter for narrow stateless transformations during migration.
- Add a versioned `AgentTrajectory`, Outcome/Process/Safety/Cost
  `RewardContract`, governed private datasets, and an approved, redacted,
  immutable `HarnessExecutionFeedbackPackage`.

Exit criteria include two project-neutral real-case profiles, schema-equivalent
conversational and headless input, proof that deterministic work does not stop
for ceremonial approval, proof that irreversible authority cannot be inferred,
complete trajectory provenance, deterministic Ground Truth authority where
available, feedback-package approval and integrity closure, no embedded model
training, no arbitrary YAML execution, no production coding path that bypasses
an exact Agent runtime/Executor binding, and unchanged Harness Asset authority.

This is a major release because it replaces the externally visible fixed
execution-lifecycle model and its configuration contract. It does not force an
`evopilot-harness` major release.

### v4.1.0: Controlled Experiment Loop

Status: `PLANNED`

- Run Champion/Challenger candidates in comparable contexts.
- Evaluate candidate trajectories pairwise across completion, correctness, safety, cost, and stability.
- Replay experiments and retain judge, Ground Truth, uncertainty, and audit evidence.
- Promote or roll back a strategy only after benchmark, Bad Case, regression, and human gates pass.

### v4.2.0: Learning Interoperability

Status: `PLANNED`

- Export governed preference and reward datasets.
- Integrate external RL Trainer systems through adapters.
- Re-enter trained policies through provenance, evaluation, and promotion gates.
- Build isolated cross-round experience retrieval.

EvoPilot remains the governance and execution control plane. Distributed model training stays external.

## Cross-Project Feedback

The planned feedback path is deliberately offline and reviewable:

```text
EvoPilot Goal Loop
  -> HarnessExecutionFeedbackPackage
  -> redaction + integrity digest + explicit approval
  -> evopilot-harness reads it as Evidence Source
  -> Proposal + Evaluation + Review + human approval
  -> new published Harness version
  -> a future EvoPilot plan may select the new immutable Bundle
```

The package does not allow EvoPilot to mutate a Harness or allow `evopilot-harness` to execute an EvoPilot project.

## Standing Work

Bug fixes, security repairs, documentation synchronization, dependency maintenance, compatibility work, and regressions are continuously allowed when they do not add an unplanned product capability or change an accepted boundary.

Codex workflow governance is also standing work when it only binds evolution to reviewed evidence, this Roadmap, an approved `evopilot-evolution-target/v1`, deterministic acceptance, and separately authorized release. It must not change EvoPilot product behavior, milestones, versions, or boundaries under the label of governance.

## Change Control

`DEFERRED` is a non-terminal scheduling state. It is not `COMPLETE`, does not
mean released, and does not make the deferred version eligible for release.
Reactivation requires another explicit Roadmap revision. When a deferred
milestone is absorbed by an active milestone, its code, evidence, and
acceptance guarantees remain inherited unless a later approved compatibility
decision explicitly says otherwise.

1. Start EvoPilot-series evolution through `$evopilot-evolution-orchestrator` and produce a reviewed evidence brief when external material is involved.
2. Run `npm run roadmap:gate -- --intent "<requested change>" --json` before implementation.
3. Continue to Target Review only when the result is `ALIGNED`.
4. For `UNPLANNED` or `DEVIATION`, present the classification, reason, affected milestones, version impact, alternatives, and a versioned Roadmap Revision Proposal; wait for explicit user confirmation.
5. Bind implementation to an approved `evopilot-evolution-target/v1` containing the current Roadmap digest, matched milestone or standing work, scope, exclusions, target version, acceptance, and evidence requirements.
6. Rerun the binding gate after Roadmap or scope changes and before implementation, acceptance closure, and release.
7. A one-task exception does not rewrite this Roadmap and cannot authorize a release containing an unplanned product capability.
8. A permanent change updates this document, `governance/roadmap.yaml`, applicable ADRs, executable gates, compatibility notes, and the EvoPilot-series memory.
9. `BOUNDARY_CHANGE` cannot use a one-task exception. It requires a replacement ADR and formal Roadmap revision before implementation.
10. Implementation approval and acceptance never imply release authorization. The user must separately authorize exact repositories, versions, and publication actions.

Release tags must target a version or release line declared by the machine Roadmap and pass `npm run roadmap:release -- <version>`.
