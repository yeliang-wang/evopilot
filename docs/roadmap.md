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

Status: `IMPLEMENTING`, under the approved [feedback Target](../governance/feedback-v04.json). Runtime captures terminal registered Run results durably, delivers them to both owners with retained receipt reconciliation, and requires exact reviewed owner dispositions before dependent completion. Harness owns regression candidates; Ontology owns semantic impact and exact-version reuse or new delivery. See the [feedback architecture decision](adr-feedback.md). Actual project evidence stays private. All 36 fixed variants are required; implementation alone is not acceptance.

The approved next version, v0.5.0, adds bounded online Harness integration, real Prometheus and Alertmanager adapters, persisted scheduling and supervised worker lifecycle. It remains unimplemented at this stage. Neither version authorizes arbitrary Host interception, automatic patch release from warnings, production deployment or v1.0.

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

### Product-owned follow-ups

The owning repository keeps the detailed trigger, scope and acceptance; this table is navigation, not a duplicate definition.

| Owner | Deferred target IDs and direction | Roadmap |
|---|---|---|
| Ontology | ONT-F01 semantic evolution and stable identity; ONT-F02 bounded interchange/generation; ONT-F03 pinned external vocabulary/import closure; ONT-F04 optional reasoning profiles. | [Ontology roadmap](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/roadmap.md) |
| Harness | HAR-F01 richer rule diagnostics, coverage and scale; HAR-F02 optional upstream policy sharing; HAR-F03 consuming online SRE evidence. | [Harness roadmap](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/roadmap.md) |
| Runtime | RUN-F01 external executor adapters; RUN-F02 sustained reliability/resource benchmarks; RUN-F03 explicitly opted-in source-drift checks. | [Runtime roadmap](https://github.com/yeliang-wang/evopilot-runtime/blob/main/docs/roadmap.md) |

### Product non-goals

EvoPilot coordinates project assets, quality evidence and reviewed execution through third-party Agents. It does not aim to become a general ontology editor/reasoner implementation, an independent CI/build engine, a metrics storage and alerting/on-call platform, a new hosted policy registry, or an embedded replacement for the user's Agent. Prefer bounded adapters to established tools when justified. A logged Warning does not authorize an automatic patch release; source changes do not authorize automatic asset approval or publication. Remote production deployment and unrestricted background mutation are not default capabilities.

These are deliberate boundaries, not uncompleted items in the approved 0.3.0 acceptance. Follow [development](development.md) and [release procedure](github-release.md) for later explicitly scoped work. Historical baselines and existing private records remain protected.
