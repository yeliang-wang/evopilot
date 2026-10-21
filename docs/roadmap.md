# Release line and roadmap

The [frozen roadmap](roadmap/ROADMAP.md) and retained governance preserve the historical v0.1.0 planning and acceptance baseline. They remain immutable records, not a description of all current capabilities. The baseline checker validates historical integrity and returns `localAcceptance: NOT_EVALUATED`; it does not evaluate a new release.

## v0.1.0: published Preview baseline

All four v0.1.0 public prereleases are published: [parent](https://github.com/yeliang-wang/evopilot/releases/tag/v0.1.0), [Runtime](https://github.com/yeliang-wang/evopilot-runtime/releases/tag/v0.1.0), [Harness](https://github.com/yeliang-wang/evopilot-harness/releases/tag/v0.1.0) and [Ontology](https://github.com/yeliang-wang/evopilot-ontology/releases/tag/v0.1.0). Their tags and historical evidence remain preserved.

This line establishes owned product services, public-package composition, immutable inputs, a shared local daemon, explicit per-chat activation and portable installation. See [current capabilities](capabilities.md).

## v0.1.1: delivery repair

The 0.1.1 Preview edition improves user documentation and navigation, strict TypeScript product sources, parent core compilation, packaging and installed references, and delivery verification. The [informational repair projection](../governance/delivery-repair-v011.json) records the five approved work areas, exclusions and pending acceptance requirements. It is not an acceptance certificate.

Exact v0.1.1 candidate verification and release proof are maintained externally. Its repair requirements cover builds and tests, package identities, compiled entry points and declarations, installed documentation and Expert readback, real Host journeys and recovery. The repair's conditional release authorization applies only to that bounded delivery; it does not authorize software releases in the separate readiness campaign below. Model or test output alone cannot grant authority.

Use [v0.1.1 versioned downloads](https://github.com/yeliang-wang/evopilot/releases/tag/v0.1.1) and the [installation guide](installation.md). Preview remains Preview, not GA.

## v0.2.0: independent private Workspace

The user-approved [Workspace Target](../governance/workspace-v02.json) governs this evolution. Its scope is workspace-free conversational initialization, bundled templates and synthetic examples, private editable project files separated from owner-controlled service state, complete Expert scenario E2E, same-machine backup/restore and lossless historical relocation, installed Codex acceptance, and conditional four-repository Preview delivery. The template ships with EvoPilot; it has no separate GitHub repository or product lifecycle.

Implementation uses strict TypeScript and the existing public package ownership boundaries. Runtime, Harness and Ontology form an exact 0.2.0 candidate combination. Frozen asset specifications/v1 and historical governance are unchanged. A technical Target check validates scope and coverage; actual results, migration authorization, Host receipts and release proof remain private and candidate-bound.

## v0.3.0: corrected v1 standards and project conformance

The four v0.3.0 Preview releases are published. The [v0.3.0 Target](../governance/standards-v03.json) records its fixed scope; detailed project decisions and acceptance evidence remain private. Published software does not imply daily installation cutover or v1.0 readiness.

Correct the current Ontology and Harness `specifications/v1` directly. Do not introduce a second specification directory or treat conversion of old assets as fresh reverse extraction. Preserve historical tags, artifacts, decisions and receipts; identify corrected normative content by owner-specific standard digests and the actual producer/contract identity. Old `v1` labels or PASS records cannot establish conformance to corrected content.

The approved correction includes:

- Ontology adopts native RDF/Turtle, a documented RDFS/OWL declaration subset, SHACL constraints and pySHACL validation. Harness adopts native Rego, OPA and Conftest, with explicit configuration, evidence and mandatory rule/test sets.
- Expert and Workspace provide discoverable asset directories, source inventories, observed/inferred distinctions, project scope, forward/reverse workflows, public/private extensions and candidate-bound completion. Ordinary project work remains private and does not revise this public Roadmap.
- Runtime owns reviewed local collection recipes, actual process/output receipts, standard/asset/input bindings, uncertainty recovery and project completion. Parent code composes public owner APIs; it does not duplicate their decision authority.
- Tool versions, dependencies, effective configuration, native reports, package documentation and installed identity are pinned and checked. Exported assets can be replayed with the upstream tools independently of the EvoPilot processes.
- Acceptance contains 65 fixed requirements across standards, Ontology, Harness, composition, history/re-extraction/recovery, real-project reverse onboarding, Expert journeys and documentation/distribution. Required negative variants reject missing scope, empty targets or rules, skipped tests, stale evidence and changed candidate inputs. Real-project selections, results and human decisions are private, not acceptance claims in this Roadmap.

The approved order is scope binding, isolated upstream/toolchain and minimal-run proof, product implementation, fresh source-based asset extraction, two substantive source rounds, user/Host acceptance, then conditional Preview delivery. Release prerequisites must pass before publication; published-download/install readback and final closure happen afterward. Only all required pre- and post-release evidence can establish completion. Conditional Preview publication requires the Target’s fixed pre-release checks; downloaded readback and closure remain separate post-release checks.

Full OWL reasoning, multi-target schema/code generation, external ontology import management, remote policy distribution, external build engines, online SRE telemetry, background synchronization and additional Host plugins are not part of this correction. Their disposition is recorded below. Existing v0.2.0 preservation statements describe that release's scope; they do not silently freeze the defective current specification against this explicitly approved correction. The bound implementation Target is `evopilot-standards-v03`.

## v0.4.0: registered execution feedback

Published in the v0.4.0 Preview under the approved [feedback Target](../governance/feedback-v04.json). Runtime captures terminal registered Run results durably, delivers them to both owners with retained receipt reconciliation, and requires exact reviewed owner dispositions before dependent completion. Harness owns regression candidates; Ontology owns semantic impact and exact-version reuse or new delivery. See the [feedback architecture decision](adr-feedback.md). Actual project evidence stays private. All 36 fixed variants are required; implementation alone is not acceptance.

The v0.5.0 scope below adds bounded online Harness integration, real Prometheus and Alertmanager adapters, persisted scheduling and supervised worker lifecycle. Neither version authorizes arbitrary Host interception, automatic patch release from warnings, production deployment or v1.0.

## v1.0 readiness criteria

The [readiness contract](../governance/readiness-v1.json) defines generic release requirements: two real projects, two substantive asset-delivery rounds per project, forward and reverse workflows, source-to-asset version consistency, Codex use, product upgrade and recovery verification, and an explicit final user release decision. The workspace upgrade does not itself satisfy these business-project requirements or authorize v1.0.

Project choices, per-project completion states, human decisions and evidence belong in the user's private workspace campaign. Ordinary onboarding, asset updates, Target/Loop progress and closure do not edit this public Roadmap or AGENTS.md. Product defects or capabilities use a separately scoped product-evolution Target.

Goal and Run are Runtime objects. Target and Loop are governance contracts and private ledgers. Each loop records its goal, baseline, actions, actual results, evidence, unresolved items and next step. Private evidence binds source revisions, exact asset versions, installed component identity and evaluation receipts. Source drift requires impact review; background synchronization is not implied. Repeating a test or changing a version label is not a substantive second round.

## Deferred product directions

These entries record product direction, not implementation or release authorization. `CANDIDATE` means a follow-up worth reviewing after the approved correction; `CONDITIONAL_RESEARCH` means first establish a concrete user need and feasibility. Neither assigns a software version or deadline. An accepted Target must fix scope, owner, compatibility, evidence and release conditions before work starts. These capability candidates add no new v1.0 release prerequisites: the existing readiness contract remains authoritative. Fixes discovered during real-project use can lead to separately scoped v0.x deliveries.

| ID / state | Trigger and intended outcome | Required future acceptance | Boundary |
|---|---|---|---|
| EVO-F01 / CANDIDATE | After the correction, validate first-use and repeated evolution with a second genuinely different project and new-user feedback. Coordinate the existing T2/T3 readiness work. | Two real projects and substantive rounds; forward/reverse and source/asset consistency; recovery and exact-candidate proof under the existing readiness contract. Record usability failures and their disposition. | No synthetic project or rerun substitutes for real-project evidence; private project status stays private; readiness still needs its final user release decision. |
| EVO-F02 / CONDITIONAL_RESEARCH | Add a requested Host adapter, including WorkBuddy, when its supported plugin/MCP surface and user need are established. | Actual Host first use, default inactive behavior, explicit activation, scope isolation, tool/receipt identity, reconnect, installed documentation and failure handling. | No WorkBuddy implementation or E2E in the approved correction; no arbitrary-Agent compatibility claim or host-wide non-bypass promise. |
| EVO-F03 / CONDITIONAL_RESEARCH | Introduce a later specification revision only when several projects demonstrate a limitation that cannot be handled safely by the current standard or a project extension. | Versioned change rationale, stable identity rules, explicit compatibility/loss reports, owner round-trip checks, historical readback and migration/recovery evidence. | This correction stays in `specifications/v1`; no new v2/v3 directory now, no silent semantic change to an already published standard, no automatic reinterpretation of old approvals. |
| EVO-F04 / IMPLEMENTING v0.6.0 | Connect observed faults, business impact, reviewed response, actual execution and asset learning. | See the [cross-product scenarios](#required-future-e2e-evidence) and owner candidates; registration is not completed acceptance. | Approved v0.6.0 response Target; no automatic repair/release or new v1.0 gate. |

### Product-owned follow-ups

The owning repository keeps the detailed trigger, scope and acceptance; this table is navigation, not a duplicate definition.

| Owner | Deferred target IDs and direction | Roadmap |
|---|---|---|
| Ontology | ONT-F01 semantic evolution and stable identity; ONT-F02 bounded interchange/generation; ONT-F03 pinned external vocabulary/import closure; ONT-F04 optional reasoning profiles; ONT-F05 optional operations/fault domain profile. | [Ontology roadmap](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/roadmap.md) |
| Harness | HAR-F01 richer rule diagnostics, coverage and scale; HAR-F02 optional upstream policy sharing; HAR-F03 consuming online SRE evidence; HAR-F04 response guidance and verified disposition. | [Harness roadmap](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/roadmap.md) |
| Runtime | RUN-F01 external executor adapters; RUN-F02 sustained reliability/resource benchmarks; RUN-F03 explicitly opted-in source-drift checks; RUN-F04 reviewed repair/runbook linkage. | [Runtime roadmap](https://github.com/yeliang-wang/evopilot-runtime/blob/main/docs/roadmap.md) |

### Product non-goals

EvoPilot coordinates project assets, quality evidence and reviewed execution through third-party Agents. It does not aim to become a general ontology editor/reasoner implementation, an independent CI/build engine, a metrics storage and alerting/on-call platform, a new hosted policy registry, or an embedded replacement for the user's Agent. Prefer bounded adapters to established tools when justified. A logged Warning does not authorize an automatic patch release; source changes do not authorize automatic asset approval or publication. Remote production deployment and unrestricted background mutation are not default capabilities.

These are deliberate boundaries, not uncompleted items in the approved 0.3.0 acceptance. Follow [development](development.md) and [release procedure](github-release.md) for later explicitly scoped work. Historical baselines and existing private records remain protected.

## Approved v0.5: online Harness

The fixed [36-variant parent Target](https://github.com/yeliang-wang/evopilot/blob/main/governance/online-harness-v05.json) follows the published v0.4 Preview. This checkout implements that scope; exact candidate acceptance and release receipts remain external.

Harness owns immutable service/environment/deployment/SLO/policy bindings, actual Prometheus measurements, authenticated Alertmanager findings, native Rego evaluation, retained incidents and reviewable regression comparisons. Runtime receives trusted repair candidates; it does not infer a software version or dispatch an autonomous repair. Ontology standards and reviewed semantic evolution remain unchanged. The parent provides the explicitly enabled independent local worker and Expert journeys, with actual installed Codex acceptance.

The delivered scope is a bounded OpenSLO v1 RatioTimeslices profile and macOS arm64/launchd supervision. It does not establish full OpenSLO/Sloth compatibility, production business-SLO acceptance or v1.0 readiness. No second real project, WorkBuddy or original project mutation is included.

### Deferred online follow-ups

| Target candidate | Trigger | Required future evidence / boundary |
|---|---|---|
| Online retention and scale | Real projects reach bounded history/backlog limits | Reviewed retention/export semantics, immutable historical evidence, restart/load tests and explicit no-loss acceptance; no silent pruning |
| Additional supervisors/providers | A concrete project requires another platform or telemetry source | Pinned supported subset, real provider/Host E2E, credentials/network isolation and owned stop/recovery; no blanket compatibility claim |
| [Reviewed repair execution linkage — EVO-F04](#evo-f04--incident-response-and-asset-learning) | Real users need repair candidates connected to a concrete approved Target | See the shared EVO-F04 scenarios and owner candidates; exact authority, actual execution, recovery and reviewed asset learning remain required |
| Additional SLO semantics | Several projects need calendar/composite/other budgeting methods | Versioned profile compatibility, upstream field/calculation comparisons, negative cases and preserved earlier approvals |

These candidates are not uncompleted v0.5 criteria and have no assigned release date. They require their own reviewed Target. Existing v1.0 readiness conditions remain unchanged.

## EVO-F04 — Incident response and asset learning

**Status:** `IMPLEMENTING` in **v0.6.0 Preview** under the user-approved [response Target](../governance/response-v06.json). Its 36 fixed variants cover this direction, the native transport repair and strict TypeScript language boundaries. Implementation status is not acceptance or publication; existing v1.0 readiness requirements are unchanged.

**Trigger:** an onboarded project needs to connect an observed fault to its business impact, applicable response guidance, an authorized repair and evidence of recovery. This expands the existing **Reviewed repair execution linkage** candidate; it is not a second repair platform or a new product.

**Current baseline:** v0.5 retains online findings and firing/resolved history, delivers review-required repair candidates to Runtime, and compares fault/recovery observations under the same binding. A repair candidate is not an approved Target or Run, and a recovered alert is not proof of root-cause removal. Registered Run feedback already supports reviewed Harness/Ontology dispositions; it does not automatically author or approve asset changes. See [online Harness](online-harness.md) and [execution feedback](feedback.md).

### Ownership and intended result

The intended trace is: source observation → affected business/service objects → reviewed problem assessment → selected runbook revision → authorized Target/Goal/Run → actual action receipts → recovery/regression evidence → reviewed asset reuse or new delivery.

| Owner / candidate | Owned responsibility | Boundary |
|---|---|---|
| [Ontology ONT-F05](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/roadmap.md#ont-f05--optional-operations-and-fault-domain-profile) | Optional domain vocabulary, typed business/service/impact relationships and provenance mapping | Operational event state remains with Harness and execution state with Runtime; distinguish observed facts, suspected causes and confirmed causes |
| [Harness HAR-F04](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/roadmap.md#har-f04--response-guidance-and-verified-problem-disposition) | Versioned diagnostic/verification guidance, applicability, observation history, regression evidence and the quality meaning of dispositions | A runbook is guidance, not execution permission; deferral/risk acceptance does not rewrite FAIL, UNKNOWN or missing evidence into PASS |
| [Runtime RUN-F04](https://github.com/yeliang-wang/evopilot-runtime/blob/main/docs/roadmap.md#run-f04-reviewed-repair-and-runbook-execution-linkage) | Bind the reviewed repair to private Target/Loop records, existing Goal/Run objects, exact source/plan/runbook versions, authority and durable execution receipts | Preserve uncertain execution; no automatic patch version, software release or production action from an alert |
| Parent Expert | Explain impact, guide plan review, show actual progress and recovery evidence, and guide owner-reviewed asset dispositions | Use public owner APIs; do not duplicate owner state or treat conversation summaries as receipts |

Each cross-owner reference must identify its Workspace/project scope, owning record or immutable asset revision, digest and relevant observation/execution time. References are validated through the owner; a graph or report is a derived view, not another authoritative database. One incident may have multiple contributing causes, and one problem may explain multiple incidents; neither relationship is inferred from temporal proximity alone.

### Incremental adoption and standards

1. Start with a bounded optional project profile and explicit rule-to-runbook mappings. Reuse current `specifications/v1`, stable identifiers, source bindings and supported RDF/SHACL constructs. Define only the project's required concepts; no fixed industry-wide object count is imposed.
2. Connect existing repair candidates and registered execution feedback through the exact reviewed plan, guidance and evidence. Implement missing owner capabilities only under a separately approved Target with file bindings, compatibility and recovery requirements.
3. Add postmortem-driven regression/semantic proposals and evidence queries. A simple timeline or relation view may follow demonstrated need; a 3D viewer and a general graph-hosting service are not prerequisites.

Use [W3C PROV-O](https://www.w3.org/TR/prov-o/) as a reference for provenance, with an explicit supported mapping rather than a claim of complete PROV-O support. Keep [Prometheus rule labels and annotations](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/) as upstream alert metadata; validate any mapping to a pinned EvoPilot asset and never execute instructions merely because they appear in an annotation. [Google SRE postmortems](https://sre.google/sre-book/postmortem-culture/) inform impact, contributing causes, actions taken and preventive follow-ups; they are engineering guidance, not a machine schema.

Public material contains generic templates and synthetic examples. Real observations, business mappings, SOPs, decisions and campaign progress remain in private Workspace/owner state. Project extensions do not modify the shared standard. If current support cannot express a required mapping, review an explicit compatibility change through EVO-F03; never silently change published v1 bytes or reinterpret earlier decisions. This candidate does not create a new specification directory.

### Required future E2E evidence

The following IDs are expanded into fixed variants in the v0.6 Target, not completed tests. The supported execution profile is existing pinned Node collection in an isolated copied directory, independent native Run verification and same-binding online recovery. Java/Maven/remote adapters remain RUN-F01. Implement cases in the parent's existing `integration/e2e` and the owners' existing `tests/e2e`, with real installed Codex journeys. Missing, skipped, stale, synthetic-only or caller-asserted evidence cannot substitute for a required real journey.

| ID | Scenario | Required observable result |
|---|---|---|
| EVO-F04-E01 | Authorized fault-to-repair journey in an isolated environment | Actual observation identifies the scoped deployment and impact; pinned runbook and reviewed Target/Goal/Run lead to real action receipts and independently collected recovery/regression results. Every link resolves to the exact owner record; success is not fabricated from a completed command. |
| EVO-F04-E02 | Alert recovers without a verified root-cause fix | Telemetry recovery and problem closure stay distinct. Suspected causes remain labeled hypotheses; a resolved alert alone cannot close the repair, certify prevention or choose a release version. |
| EVO-F04-E03 | Stale or inapplicable guidance | Wrong service/environment/source/runbook revision, unmet prerequisites, changed parameters and withdrawn guidance reject execution or require fresh review. An old approval cannot authorize the changed plan. |
| EVO-F04-E04 | Duplicate delivery, lost response and partial execution | Restart/reconnect reads the original claim and receipts; an uncertain action is not dispatched again. Cancellation, timeout and partial completion retain their actual outcomes. If rollback is supported, its separately authorized execution and results are evidenced, never assumed. |
| EVO-F04-E05 | Postmortem produces a regression or semantic change | Harness/Ontology receive source-linked proposals through existing feedback; exact REUSE or new-delivery dispositions are reviewed. Changed assets require appropriate re-evaluation before completion; earlier versions and decisions remain readable. |
| EVO-F04-E06 | Reuse across two genuinely different projects | Each project extends the same base profile without editing shared normative bytes. Namespaces, parameters, assets, scopes and credentials remain isolated; private evidence cannot leak into public templates. Synthetic cases supplement, but do not satisfy, the separate real-project v1.0 requirement. |
| EVO-F04-E07 | Deferral, risk acceptance and late events | Any accepted exception retains the actor, rationale, exact scope, expiry/review time and history. Expiry is detectable; original quality outcomes remain intact. Duplicate or out-of-order observations cannot manufacture recovery or overwrite a later decision. |
| EVO-F04-E08 | Broken or untrusted evidence chain | Wrong Workspace/project, forged or missing owner receipt, changed digest, stale observation and incomplete collection are rejected or explicitly incomplete. An upstream annotation or a diagram edge cannot authorize an action or establish causation. |
| EVO-F04-E09 | First-use Codex Expert journey | With the plugin explicitly selected, a new user can inspect impact, identify applicable guidance, review the proposed action, inspect failure/recovery and complete the appropriate asset review. Answers cite actual owner records; inactive chats do not start a repair or monitoring selection. WorkBuddy is excluded. |
| EVO-F04-E10 | Upgrade, recovery and retained history | Exact plan, guidance, asset and observation references survive supported backup/restore and restart. Old records are not rewritten into new approvals; migration failures preserve recoverable state and report incompatibility. |

**Priority:** first validate the minimal profile and repair linkage against a concrete project need; then improve reusable postmortem learning and queries. This candidate does not delay the existing second-project onboarding or add a v1.0 release gate. ONT-F01, HAR-F01 and RUN-F01 remain separate, demand-driven follow-ups; do not silently pull full semantic reasoning, policy calibration or a new executor platform into this scope.
