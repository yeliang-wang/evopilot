# Release line and roadmap

## Pre-v1.0 release scope

Before the v1.0 Release is published, Dashboard design, implementation, web UI, browser journeys and related acceptance obligations are excluded across all EvoPilot versions. Historical proposals do not authorize this work. After that release, any such work still requires a separately accepted plan; it does not start automatically. Standalone asset JSON APIs and Codex-readable reports remain in scope.


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

## v0.7.0 Preview: readable assets and explainable gates

**Status:** `PLANNED_IMPLEMENTATION_DEFERRED`. The Roadmap scope is accepted; implementation has not started, acceptance is `NOT_EVALUATED`, and this entry grants no installation or release authority. The [v0.7 planning record](../governance/readability-v07.json) is a planning projection, not an executable approval or a completed acceptance record. Current delivered software remains v0.6.0.

**Objective / EVO-F05:** make native Ontology and Harness assets understandable, searchable and traceable directly from Codex, while improving diagnostics and recoverable maintenance. Active project evolution continues independently. It does not wait for v0.7, and its completion does not automatically start this product work. Implementation requires a subsequent explicit start instruction and exact source/file bindings; no date is assigned.

### Ordered targets

These IDs are scoped to v0.7 and do not replace the separate v1.0 readiness T1–T3.

| Target | Planned scope | Required outcome |
|---|---|---|
| V07-T1 — Diagnostics and maintenance | Preserve typed owner errors through MCP; distinguish unmet prerequisites, validation failures, transport errors and uncertain outcomes. Explain blockers with safe receipt references and permitted next steps. Preflight declaration metadata, the full required observation/case set and layout before scope freeze or materialization. Add capacity preflight and bounded, consistent maintenance for larger Workspaces. | Preparation errors are found before immutable candidates are created. A pending feedback disposition is not mislabeled as a connection failure. Supported backup and isolated recovery work at the reviewed workload without deleting historical evidence or bypassing checks. |
| V07-T2 — Readable reports and queries | Owner-scoped asset catalogs, labels/definitions, rules and constraints, source locations, bounded version comparisons, evidence categories and result explanations. Generate JSON, Markdown and HTML from the same verified read model; provide bounded filtering, pagination and raw-evidence navigation. | Users can distinguish what was checked, why it passed or failed, which input/version it covers and what remains unexecuted. Reports do not depend on an LLM inventing missing metadata or conclusions. |
| V07-T3 — Codex-readable project evolution | Project overview; Ontology entities/relationships/constraints; Harness rules/parameters/cases/results; execution, feedback and review timeline. Reuse V07-T2 owner APIs and V07-T1 diagnostics. | Users navigate from a stage or blocker to the exact asset, rule, source and retained receipt. Browsing does not activate an Agent session, dispatch work, approve a proposal or publish an asset. |

V07-T1 establishes safe diagnostics and recovery; V07-T2 establishes the shared presentation contract before V07-T3 consumes it. Reversible independent work may proceed within a future approved execution scope; a local dependency failure must not be represented as a halt of unrelated project work. This plan adds no autonomous coding scheduler.

### Standards, ownership and presentation contract

- Keep native RDF/Turtle, the documented RDFS/OWL declaration subset, bounded SHACL/pySHACL and Rego/OPA/Conftest. The online OpenSLO profile retains its existing limits. These upstream standards do not define EvoPilot's package, directory, review or storage lifecycle; documentation must distinguish those conventions.
- Preserve published `specifications/v1` normative bytes, shared historical contracts and immutable assets/decisions/receipts. Prefer existing labels, definitions and supported display metadata. Version additive query/presentation contracts separately. New asset content requires a new candidate/version and the applicable owner review; missing historical metadata is displayed as missing. Do not manufacture a second editable model or policy format for the UI.
- Ontology owns entity/relationship/constraint interpretation and bounded model comparisons. Harness owns policy/parameter/case/result interpretation and diagnostic context. Runtime owns execution, prerequisite/decision state, claims and receipt history. The parent composes their public APIs, Expert reports and maintenance; it must not read owner databases as an alternative authority.
- Each derived view binds Workspace/project, owner, stable entity/rule identity, asset version/digest, source revision, report/receipt reference, snapshot identity and freshness. A cross-owner view declares the exact revisions it read and detects drift or unavailable owners rather than presenting inconsistent data as current. Rebuildable indexes are caches, not another system of record.
- Separate execution outcome, validation outcome, expected versus actual case result, evidence origin, human decision and release readiness. Design/source declarations, synthetic cases, actual execution and online observations remain distinguishable. A negative case correctly rejected can pass its test while its input violates the rule; a stage-level asset PASS does not certify product E2E or release readiness.
- Distinguish software version, asset version, specification version/digest and execution identity. Show readable labels first with exact identifiers available for audit. Views must preserve unknown, missing, skipped, stale and unsupported states, including explicit denominators; filtering cannot silently remove mandatory failures from totals.
- Codex reports use scoped owner reads and render untrusted asset text inertly. Read access, chat activation and mutation authority remain distinct; reports never expose arbitrary filesystem reads.
- Core, query and integration work follows the existing strict TypeScript policy. JavaScript remains generated/runtime support where already allowed; Python remains the bounded native RDF/SHACL adapter. README, standards references, technical/API documentation, installed guides and Expert scenarios must describe the same delivered behavior.

### Fixed acceptance requirements

All eight requirements are planned and **NOT_EVALUATED**. Before implementation, bind each to positive, negative, missing/stale and recovery variants where applicable, exact workload/latency/memory budgets, source files and evidence locations. This requirements table cannot substitute for those executable variants or their results. Future executable coverage belongs in owner `tests/e2e` and parent `integration/e2e`, including actual installed Codex journeys.

| ID | Required E2E evidence |
|---|---|
| V07-E01 | A real pending owner disposition yields a specific prerequisite result, affected owner/reference and safe next step. Actual disconnection and uncertain mutation remain distinct. Injected unknown/internal errors retain correlation without leaking secrets; reconciliation does not redispatch. Reproduce each reported historical failure before claiming its root cause fixed. |
| V07-E02 | Missing declaration metadata, omitted mandatory observation variants and invalid layout are diagnosed before freeze/materialization, with exact affected fields/IDs. Failure leaves immutable candidates and earlier approvals unchanged. Corrected drafts pass the same owner validators; preflight cannot shrink the required set. |
| V07-E03 | Positive, negative and missing-input cases show expected result, actual rule/constraint outcome and test verdict separately. An intentionally rejected negative input cannot be presented as business conformance. Rule/shape, input location, parameters and native evidence resolve to the pinned bytes; unsupported detail is explicit. |
| V07-E04 | An asset stage with all required checks passing still shows unexecuted database/Host/long-duration/scale or other separately required product checks. Overall scope, denominator, blocking dependencies, existing decisions and next eligible actions remain visible. A stage completion or resolved alert cannot become product release approval. |
| V07-E05 | Compare pinned versions: triple ordering/format-only changes are separated from changed identifiers, labels, relations, constraints or parameters. Bound the supported comparison profile; do not claim full logical equivalence. Resolve affected references and retain explicit unknown impact, immutable history and exact-candidate review requirements. |
| V07-E06 | Codex, JSON, Markdown and HTML reports agree on required result identities, statuses, counts, versions and evidence digests for the same snapshot. Filtering/pagination has no silent omissions or duplicates. Stale caches, owner unavailability and cross-owner revision drift are visible; raw-evidence drilldown remains intact. |
| V07-E07 | Use a reviewed corpus at least as large as the real workload that triggered the maintenance gap; fix entry count, byte/single-file limits, cache/link handling and resource budgets before code work. Prove consistent snapshots, bounded/chunked transfer, interruption/resume, corruption rejection, isolated restoration, receipt/history identity and controlled upgrade recovery. No silent exclusions, evidence deletion or limit removal can satisfy this requirement. |
| V07-E08 | Exercise first-use and reconnect through actual installed Codex, with two isolated project scopes and adversarial asset text. Browse/search/filter/export remain read-only and private; links cannot escape scope. Non-color status labels and readable localized report labels work. Generic examples, README, standards/support limits, technical references and installed Expert guidance match the exact package; historical readback remains available. |

Technical results do not constitute business approval or release authority. Exact product acceptance, installation/cutover and publication are future execution decisions; the v0.6 conditional release history does not authorize them here. Existing [v1.0 readiness](../governance/readiness-v1.json) remains unchanged; a complete management platform is not a new v1.0 prerequisite.

### References and intentionally deferred work

Use [WebProtégé](https://github.com/protegeproject/webprotege) for entity-oriented browsing and revision history; [ROBOT diff](https://robot.obolibrary.org/diff) for labeled, readable ontology comparison; [SHACL display metadata](https://www.w3.org/TR/shacl/#nonValidation) and [OPA metadata](https://www.openpolicyagent.org/docs/policy-language#metadata) for native descriptions; [Policy Reporter UI](https://kyverno.github.io/policy-reporter-docs/policy-reporter-ui/introduction.html) for grouped policy results; and [Backstage entity descriptors](https://backstage.io/docs/features/software-catalog/descriptor-format/) for stable catalog identity, metadata and relationships. These are scoped design references, not drop-in compatibility claims or a decision to adopt their complete platforms.

- Java/Maven and external CI collection remain under Runtime RUN-F01. An isolated adapter candidate is not an installed or accepted product capability. Reuse reviewed candidate evidence when later authorized; do not maintain a project-specific bypass indefinitely.
- Autonomous Target selection/coding/test/repair scheduling requires a separate Runtime Target, a supported external-Agent control surface, authority/resource bounds and restart/uncertainty E2E. Existing Goal/Run objects and Target/Loop ledgers do not establish this capability.
- Changes to approval policy require separate review. Grouping existing review items for reading does not combine decisions or relax domain, execution or project release gates. Full ontology editors/reasoners, 3D graph platforms, production remediation, WorkBuddy and automatic asset publication remain outside v0.7.
- HAR-F01's broader mutation-quality/calibration/scale work and ONT-F01's broader semantic migration contract remain separately scoped; v0.7 takes only the bounded diagnostics/comparison parts described here.

**Ongoing feedback:** keep real-project findings, decisions and progress in private campaign/audit records, classified as reproducible product defects, preparation/usage errors or capability limits. Already resolved defects are regression inputs, not new missing capabilities. New findings do not automatically change v0.7 scope or start work. Before explicit resumption, reconcile the latest findings, review any scope changes, bind exact repositories/files and compatibility/resource budgets, and then freeze the implementation acceptance variants. Until then, leave active projects and the v0.6 installation untouched; there is no background watcher or automatic resumption implied by this entry.

## v0.8.0 Preview: asset usability and controlled reconstruction

**Status:** `PLANNED_IMPLEMENTATION_DEFERRED`; planning accepted, implementation not started, acceptance `NOT_EVALUATED`. The [v0.8 plan](asset-usability-v08.md) and [machine-readable planning record](../governance/asset-usability-v08.json) define this scope. They authorize neither implementation, installation nor release. Preserve the v0.7 plan and its independently recorded progress; consume its accepted owner-query and presentation contracts before dependent v0.8 implementation. No automatic start or delivery date is implied.

**Objective / EVO-F06:** let independent consumers obtain exact Ontology assets, understand their verified usability level and, for a declared functional slice, reconstruct software from specifications with independent behavioral-equivalence evidence. The public levels are L1 understanding, L2 implementation specification and L3 reconstruction verified. They are EvoPilot conventions, not an industry certification, a measure of graph size or a promise that any Agent can reproduce any software.

| Target | Planned scope | Required outcome |
|---|---|---|
| V08-T1 — Usability contract | Scope-bound L1/L2/L3 requirements, target versus verified level, evidence/freshness states and independent requirement inventory | Every claim declares exact assets, scope, limitations and evidence; mandatory gaps cannot be averaged away. |
| V08-T2 — External asset consumption | Authenticated, bounded, version-pinned service queries and portable exports through public owner APIs | A consumer independent of Runtime and Codex reads and verifies the allowed delivery without starting business execution or receiving unrelated private source. |
| V08-T3 — Independent assessment | Harness-owned level assessments, behavior contracts, independent oracles and failed/missing/stale evidence handling | Model conformance, implementation guidance and actual reconstruction results remain distinct and inspectable. |
| V08-T4 — Controlled reconstruction | Runtime-owned bounded external-Agent/build/test adapters, isolated inputs, durable receipts and recovery | Two independent clean builds of the same specification pass the frozen scope's required equivalence checks; original implementation access is excluded in specification-only mode. |
| V08-T5 — Real pilot and evolution | A privately selected real-project slice, substantive asset change, revalidation and installed consumer/Expert journeys | The original slice attains L3 with actual evidence; an evolved asset passes new and retained compatibility requirements. A failed pilot reports gaps and keeps this target incomplete. |

The [fixed requirements and acceptance matrix](asset-usability-v08.md#requirements-and-acceptance) contains V08-R01–R18 and V08-E01–E20. All are required and unevaluated. Full planning coverage means every requirement has an owner and acceptance mapping; it does not mean future software is 100% correct. Required failures, skips, missing/unknown/stale evidence, source-assisted substitutes or a reduced denominator cannot establish v0.8 completion. A material scope change requires a reviewed plan/Target revision rather than silently weakening this contract.

Ontology owns assets, semantic gaps and exact exports; Harness owns assessments and behavioral evidence; Runtime owns reconstruction execution and completion; the parent owns shared additive contracts, service transport/composition and consumer presentation. Existing RDF/SHACL, Rego, immutable assets and owner boundaries remain. Real-project choices and evidence stay private; public examples are synthetic. This plan adds no full-project reconstruction guarantee, mandatory core rewrite, new hosted graph/CI platform, production deployment or automatic release. See the [owner navigation](#product-owned-follow-ups) and [compatibility and authority](asset-usability-v08.md#compatibility-and-authority).

### Confirmed v0.8 entry and domain-question refinement

Project entry, a scoped semantic overview, business-object navigation and source-grounded natural-language domain/metric-definition questions refine the existing v0.8 scope. Bind them to V08-R01/R03/R06/R14 and V08-E01/E03/E06/E15 as specified in [project entry and domain questions](asset-usability-v08.md#project-entry-and-domain-questions). Reuse immutable asset reads, existing review boundaries and Codex-readable reports. The 18 requirements, 20 acceptance IDs, two clean reconstructions and successful real pilot/evolution remain mandatory. Actual metric computation, trend analysis and evidence-backed business analysis belong to the v0.9 candidate below. Resolve actual published v0.7 dependency contracts at execution handoff; older local planning status is not current release evidence.

### Confirmed modeling-purpose gate

Before formal reverse modeling, resolve purpose, functional scope/exclusions and target L1/L2/L3, and bind an independent mandatory acceptance inventory plus actual user intent. Expert reuses clear context and clarifies missing information; service entry points enforce admission across supported clients. Templates collect progressively richer content but never award levels; L3 requires real reconstruction evidence. Read-only discovery and existing asset consumption remain available. Changed intent/source/scope/target requires a new binding; preserve history and check compatibility. This refines V08-E04/E05/E07/E15/E18/E20 without reducing the 18/20 denominator or reconstruction/pilot obligations. See [mandatory modeling admission](asset-usability-v08.md#modeling-purpose-and-mandatory-admission).

## v0.9 candidate: project business metrics and evidence-driven analysis

**Status:** `CANDIDATE`; version allocation and direction accepted, detailed execution plan not frozen, implementation `NOT_STARTED`, acceptance `NOT_EVALUATED`. Version 0.9 is the proposed destination, not a delivery date, release commitment or authorization to implement. See the [candidate scope](business-analysis-v09.md) and [machine-readable record](../governance/business-analysis-v09.json).

**Objective / EVO-F07:** use reviewed project semantics and real observations to answer bounded business metric questions, compute reproducible results and explain comparisons with traceable evidence. Start with one real business domain, a finite reviewed indicator set, limited data sources and read-only analysis. Reuse accepted v0.8 consumption/access/version contracts; do not equate L3 reconstruction with production-data availability or analytical correctness.

Ontology owns metric meaning and semantic mappings (ONT-F08); Harness owns completeness/evaluation rules and independent analysis checks (HAR-F07); Runtime owns newly required controlled collection/query execution, budgets and receipts (RUN-F07); the parent owns question routing, public-API composition and presentation. Existing Harness online observation ownership stays intact. Fix adapter and calculation ownership in the future execution design; create no second owner database or fourth product.

Required future evidence includes an independent calculation oracle, exact definition/data/time bindings, ambiguity and missing/zero-denominator behavior, compatible/incompatible comparisons, scoped authorization, partial/stale data, budgets and uncertainty recovery, and actual installed user journeys. Computation is deterministic under pinned inputs; model explanations cannot invent values or causal conclusions. These acceptance themes are not yet a frozen execution matrix. The candidate is neither a general BI/SQL platform nor production remediation, and adds no v0.8 or existing v1.0 completion gate.

## v1.0 readiness criteria

The [readiness contract](../governance/readiness-v1.json) defines generic release requirements: two real projects, two substantive asset-delivery rounds per project, forward and reverse workflows, source-to-asset version consistency, Codex use, product upgrade and recovery verification, and an explicit final user release decision. The workspace upgrade does not itself satisfy these business-project requirements or authorize v1.0.

Project choices, per-project completion states, human decisions and evidence belong in the user's private workspace campaign. Ordinary onboarding, asset updates, Target/Loop progress and closure do not edit this public Roadmap or AGENTS.md. Product defects or capabilities use a separately scoped product-evolution Target.

Goal and Run are Runtime objects. Target and Loop are governance contracts and private ledgers. Each loop records its goal, baseline, actions, actual results, evidence, unresolved items and next step. Private evidence binds source revisions, exact asset versions, installed component identity and evaluation receipts. Source drift requires impact review; background synchronization is not implied. Repeating a test or changing a version label is not a substantive second round.

## Product evolution directions

These entries record product direction, not implementation or release authorization. `CANDIDATE` means a follow-up worth reviewing after the approved correction; `CONDITIONAL_RESEARCH` means first establish a concrete user need and feasibility. Neither assigns a software version or deadline. `PLANNED_IMPLEMENTATION_DEFERRED` identifies an accepted version plan whose implementation is explicitly deferred and requires a later start instruction. An accepted implementation Target must fix scope, owner, compatibility, evidence and release conditions before work starts. These capability candidates add no new v1.0 release prerequisites: the existing readiness contract remains authoritative. Fixes discovered during real-project use can lead to separately scoped v0.x deliveries.

| ID / state | Trigger and intended outcome | Acceptance requirements | Boundary |
|---|---|---|---|
| EVO-F01 / CANDIDATE | After the correction, validate first-use and repeated evolution with a second genuinely different project and new-user feedback. Coordinate the existing T2/T3 readiness work. | Two real projects and substantive rounds; forward/reverse and source/asset consistency; recovery and exact-candidate proof under the existing readiness contract. Record usability failures and their disposition. | No synthetic project or rerun substitutes for real-project evidence; private project status stays private; readiness still needs its final user release decision. |
| EVO-F02 / CONDITIONAL_RESEARCH | Add a requested Host adapter, including WorkBuddy, when its supported plugin/MCP surface and user need are established. | Actual Host first use, default inactive behavior, explicit activation, scope isolation, tool/receipt identity, reconnect, installed documentation and failure handling. | No WorkBuddy implementation or E2E in the approved correction; no arbitrary-Agent compatibility claim or host-wide non-bypass promise. |
| EVO-F03 / CONDITIONAL_RESEARCH | Introduce a later specification revision only when several projects demonstrate a limitation that cannot be handled safely by the current standard or a project extension. | Versioned change rationale, stable identity rules, explicit compatibility/loss reports, owner round-trip checks, historical readback and migration/recovery evidence. | This correction stays in `specifications/v1`; no new v2/v3 directory now, no silent semantic change to an already published standard, no automatic reinterpretation of old approvals. |
| EVO-F04 / IMPLEMENTED v0.6.0 | Connect observed faults, business impact, reviewed response, actual execution and asset learning. | See the [cross-product scenarios](#required-v06-e2e-evidence) and owner candidates; registration is not completed acceptance. | Approved v0.6.0 response Target; no automatic repair/release or new v1.0 gate. |
| EVO-F05 / PLANNED_IMPLEMENTATION_DEFERRED v0.7.0 | Readable assets, explainable gates and Codex-readable reports. | [V07-T1–T3 and V07-E01–E08](#v070-preview-readable-assets-and-explainable-gates); all acceptance remains NOT_EVALUATED. | Planning accepted only; explicit future start required, with no current implementation, installation or release authority. |
| EVO-F06 / PLANNED_IMPLEMENTATION_DEFERRED v0.8.0 | Scoped asset usability levels, independent external consumption, project entry/domain Q&A and controlled specification-driven reconstruction. | [V08-T1–T5](#v080-preview-asset-usability-and-controlled-reconstruction), [V08-R01–R18 / V08-E01–E20](asset-usability-v08.md#requirements-and-acceptance); a real slice must pass reconstruction and evolution. | Planning accepted only; explicit future start and exact execution Target required. L3 is evidence-bound, not inferred from SHACL, graph size, a level request or software publication. |
| EVO-F07 / CANDIDATE proposed v0.9 | Project business metrics and evidence-driven analysis. | [Candidate scope and acceptance themes](business-analysis-v09.md); exact execution matrix remains to be reviewed. | Version allocation accepted; no implementation, date or release commitment. Not an additional v0.8/v1.0 gate. |

### Product-owned follow-ups

The owning repository keeps the detailed trigger, scope and acceptance; this table is navigation, not a duplicate definition.

| Owner | Target IDs and direction | Roadmap |
|---|---|---|
| Ontology | ONT-F01 semantic evolution and stable identity; ONT-F02 bounded interchange/generation; ONT-F03 pinned external vocabulary/import closure; ONT-F04 optional reasoning profiles; ONT-F05 operations/fault domain profile (implemented in v0.6); ONT-F06 readable asset views/comparisons (v0.7 planning accepted, implementation deferred); ONT-F07 independent asset consumption, project entry/domain Q&A and usability metadata (v0.8 planning accepted, implementation deferred); ONT-F08 bounded metric semantics (proposed v0.9 candidate). | [Ontology roadmap](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/roadmap.md) |
| Harness | HAR-F01 richer rule diagnostics, coverage and scale; HAR-F02 optional upstream policy sharing; HAR-F03 online SRE evidence (implemented in v0.5); HAR-F04 response guidance and verified disposition (implemented in v0.6); HAR-F05 readable policy results (v0.7 planning accepted, implementation deferred); HAR-F06 usability assessment, domain-question evidence and reconstruction equivalence (v0.8 planning accepted, implementation deferred); HAR-F07 business-analysis validation (proposed v0.9 candidate). | [Harness roadmap](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/roadmap.md) |
| Runtime | RUN-F01 external executor adapters; RUN-F02 sustained reliability/resource benchmarks; RUN-F03 explicitly opted-in source-drift checks; RUN-F04 reviewed repair/runbook linkage (implemented in v0.6); RUN-F05 explainable workflow state and maintenance (v0.7 planning accepted, implementation deferred); RUN-F06 controlled reconstruction and evidence closure (v0.8 planning accepted, implementation deferred); RUN-F07 controlled business queries (proposed v0.9 candidate). | [Runtime roadmap](https://github.com/yeliang-wang/evopilot-runtime/blob/main/docs/roadmap.md) |

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
| Additional SLO semantics | Several projects need calendar/composite/other budgeting methods | Versioned profile compatibility, upstream field/calculation comparisons, negative cases and preserved earlier approvals |

These candidates are not uncompleted v0.5 criteria and have no assigned release date. They require their own reviewed Target. Response linkage has advanced to the implemented v0.6 scope below. Existing v1.0 readiness conditions remain unchanged.

## EVO-F04 — Incident response and asset learning

**Status:** `IMPLEMENTED` for **v0.6.0 Preview** under the user-approved [response Target](../governance/response-v06.json). Its 36 fixed variants cover this direction, the native transport repair and strict TypeScript language boundaries. The [versioned release](https://github.com/yeliang-wang/evopilot/releases/tag/v0.6.0) records public delivery; fixed acceptance evidence remains private and existing v1.0 readiness requirements are unchanged.

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

### Required v0.6 E2E evidence

The following IDs are expanded into fixed variants in the v0.6 Target and covered by the owning and composed test suites. This table defines requirements; actual outcomes remain in exact-candidate private evidence. The supported execution profile is existing pinned Node collection in an isolated copied directory, independent native Run verification and same-binding online recovery. Java/Maven/remote adapters remain RUN-F01. Implement cases in the parent's existing `integration/e2e` and the owners' existing `tests/e2e`, with real installed Codex journeys. Missing, skipped, stale, synthetic-only or caller-asserted evidence cannot substitute for a required real journey.

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

**Follow-up:** extend reusable postmortem learning and queries when real project needs justify another reviewed Target. The v0.6 implementation does not delay the existing second-project onboarding or add a v1.0 release gate. ONT-F01, HAR-F01 and RUN-F01 remain separate, demand-driven follow-ups; do not silently pull full semantic reasoning, policy calibration or a new executor platform into this scope.


## v0.8.1 Preview — accepted asset readiness correction

[The accepted plan](asset-readiness-v081.md) and [machine Target](../governance/asset-readiness-v081.json) add explicit usability v2 while preserving v1. L1/L2/L3 describe asset content; reconstruction verification remains independent. Scope includes three modeling modes, full existing project asset upgrades, exact four-product release and current Codex deployment. All 63 pre-release and 9 post-release variants are mandatory. The prior v0.8 baseline remains published history. No v0.9 capability or Dashboard enters this version. User-environment Prometheus acceptance remains deferred.

## v0.8.2 Preview: transport documentation and specification correction

The [correction plan](transport-correction-v082.md) and [maintenance Target](../governance/transport-correction-v082.json) address the confirmed v0.8.1 guide omission and corresponding private normative specification. Preserve the 72 v0.8.1 acceptance variants, all historical publications and private evidence. This patch changes documentation and synchronized release identity only; it adds no product behavior or execution authority. Exact verification, new immutable publication and current Codex installation evidence remain required.

## v0.8.3 Preview: current documentation closure

The [documentation closure plan](documentation-closure-v083.md) and [maintenance Target](../governance/documentation-closure-v083.json) correct current-versus-historical L3 wording, migration routing, state markers and plugin labels across entry guides and the corresponding private normative assets. Keep all 72 v0.8.1 variants, fixed project scope, native standards, runtime behavior and prior release bytes. New consistency guards, exact source/CI/package validation, immutable releases and current Codex readback are required. No additional product capability or execution permission is introduced.
