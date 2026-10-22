# Expert scenarios — v0.7.0 candidate

Current native journeys are returned by `evopilot_v01_guide`. Their actual
operation sequence is in [Native workflow](native-workflow.md). Guidance and
catalogue metadata do not certify installed Desktop behavior.

The current guide has 19 native journeys: six V03, three V04, five V05 and
five V06. The 27 retained V02 scenarios below are historical context, not the
current acceptance denominator. See [online journeys](#v05-online-journeys) and
[response journeys](#v06-response-journeys) for the later additions.

| ID | User journey | Automated evidence locations |
| --- | --- | --- |
| V04-U01 | Configure registered Run feedback, inspect owner inboxes and resume delivery | feedback |
| V04-U02 | Native asset updates, exact-version reuse and reviewed dispositions | feedback |
| V04-U03 | Restart and full Workspace backup/restore with feedback history | feedback |
| V03-U01 | Workspace, explicit activation, pinned toolchain and default-off sessions | plugin, native-toolchain, native-connection |
| V03-U02 | Forward requirements and independent project scope | native-project |
| V03-U03 | Reverse extraction, public/private and fixed source provenance | native-project |
| V03-U04 | Actual collection, native quality, missing or failed evidence | native-collection, native-composition |
| V03-U05 | Exact owner receipts, domain review and complete project criteria | native-composition, native-project |
| V03-U06 | Source drift, isolated rounds, history and no-redispatch recovery | native-collection, native-project |

Names refer to `integration/e2e/<name>.test.mjs`. Real Host verification, native
independent replay and the fixed v0.3 acceptance variants remain separate
requirements. The [v0.4 feedback guide](feedback.md) and its 36 fixed variants add separate delivery, review, recovery and real Host checks. Passing a synthetic journey does not mark those requirements done.

## Historical v0.2 scenario catalogue

The following retained table documents the old scope. Current guide responses
mark these IDs historical and route new work to corrected-v1 operations. Retired
JSON/classification/Catalog writes are not enabled by this catalogue. Workspace
initialization, attachment, session isolation and maintenance remain supported;
new assets use native standards and exact project completion gates.


EvoPilot provides one Expert through the Codex plugin. Select the plugin and describe your task. Ordinary chats remain unaffected; information-only requests stay passive. The stable MCP tool `evopilot_v01_guide` accepts the IDs below or the seven historical guide names. The catalogue is a capability and acceptance contract, not a claim that a particular installation has passed acceptance.

The canonical typed catalogue is `expert/core/scenarios.ts`, compiled into the installation. Each entry supplies preconditions, sample requests, exact operations, expected outputs, state that must remain unchanged, automated test bindings, required branches and real Desktop observations. The guide returns those details; use it to expand a table row rather than inventing an API.

## Start and operate a personal Workspace

| ID | Ask the Expert | Required result and boundary |
| --- | --- | --- |
| V02-A01 | Explain EvoPilot without starting it | Help works without a Workspace. Ordinary chat causes no product calls; help creates no state or daemon. |
| V02-A02 | Start using EvoPilot and create my Workspace | Create a personal project with README/examples and separate protected state, then activate this chat. No GitHub login. Duplicate/concurrent requests do not overwrite or duplicate user data. |
| V02-A03 | Connect my existing Workspace | Verify its identity, version and locations; read existing history without reinitializing. One installation binds one Workspace; no hot switching. |
| V02-A04 | Open/stop EvoPilot in this chat | Start or reuse the verified shared connection. Session activation remains separate; closing or stopping one chat does not stop another. |
| V02-A05 | Run the forward/reverse example | Use the shipped synthetic materials, instructions and expected results. Keep example scope separate from real projects. |
| V02-A06 | Select my project and use this shared asset | Apply exact project/public/private scope. Reject foreign private materials and unknown required extensions; never automatically upload. |
| V02-A07 | Which data and versions am I using? | Read exact project/state paths, product identity, drafts, published pins and last Run. Do not expose credentials or guess latest versions. |

`workspace_initialize` and `workspace_attach` are explicit setup tools available before activation. Setup does not itself authorize a product Run. The Expert inspects the binding, initializes or attaches, then activates in the same session. Existing user files, installation inventory and matching historical state remain intact.

## Connect and evolve a project

| ID | Ask the Expert | Required result and boundary |
| --- | --- | --- |
| V02-B01 | Model these requirements before there is code | Produce a native v1 forward draft; retain unresolved required business semantics as PENDING. |
| V02-B02 | Extract from this authorized source revision | Record locator, revision and digest; distinguish observed mappings from inference. Read-only extraction preserves source bytes, HEAD and tags. |
| V02-B03 | Review this draft and record my decision | Bind actual APPROVE/REJECT to the current review; publish separately. Changed drafts invalidate prior decisions; delivered versions are immutable. |
| V02-B04 | Evaluate these reports against this Harness | Compute rule-level quality from actual supplied reports. Missing evidence remains INDETERMINATE with Warning; no automatic action or software version bump. |
| V02-B05 | Prepare this goal with these exact deliveries | Resolve six-field pins; prepare immutable inputs, obtain the current human decision, then dispatch. Execution, Harness quality and Ontology business results remain separate. |
| V02-B06 | My source changed; reconcile its assets | Check baseline drift at onboarding, resumption and delivery. Record impact and justified reuse or new reviewed deliveries. Preserve old pins and Runs; no background real-time synchronization. |
| V02-B07 | Continue this Target from its last Loop | Read private progress and owner receipts. Missing required evidence prevents closure. Target/Loop documents are not invented native completion APIs and do not modify the product Roadmap. |

Forward and reverse routes use the same owner `specifications/v1/`, with owner-specific extensions around that base. Editing a draft does not update an already published asset or Run. Runtime validates supplied instances/evidence through the composed provider; it is not an arbitrary coding or deployment executor. See [composition](product-composition.md) and [capabilities](capabilities.md).

## Retained Ontology workflows

These rows describe historical Ontology workflows. Current capabilities expose
their supported read operations; retired JSON, producer, classification and
Catalog mutations fail with `HISTORICAL_READ_ONLY`, even when trusted SDK
providers are configured. Use native packages for new work. The table preserves
the original use cases and must not be interpreted as current write instructions.

| ID | Ask the Expert | Required result and boundary |
| --- | --- | --- |
| V02-C01 | Import this structured asset and derive a draft | Preserve supported JSON/YAML raw bytes and provenance. Quarantine unknown formats. Historical approvals are not adopted. Arbitrary source repositories are not structured imports. |
| V02-C02 | Validate and compare stored Ontology sources | Verify scoped IDs and bytes; report structural differences without claiming business equivalence or writing state. |
| V02-C03 | Resolve Packs and record a lifecycle transition | Check dependencies/conflicts and the exact decided producer plan. Local INSTALL/ACTIVATE records do not install another product. |
| V02-C04 | Produce a Proposal, Snapshot and delivery artifacts | The owner recomputes Snapshot, projections, manifest and Skill; exact source/decision bindings and immutable publication remain enforced. |
| V02-C05 | Compare reasoning and inspect semantic closure | Inspect foundation/index, incremental versus full results, round-trip and closure with exact input digests. Query results do not mutate state or grant publication. |
| V02-C06 | Publish, revoke, roll back or recover a Catalog | Check providers/materials, bind transition plans and verify retained receipts. Rollback cannot undo revocation; recovery does not repeat publication. |
| V02-C07 | Classify, reanalyze, inspect or resume | Use explicitly configured trusted providers. Retain original admission receipt; timeout/restart stays UNKNOWN until resolved and does not trigger retry. |
| V02-C08 | Record my classification handoff to Harness | Bind the human decision token to exact source/results. The handoff record neither creates a native Harness asset nor starts a Run. |

The historical SDK contracts name `resolveClassificationSource`,
`classificationAdvisor`, `classificationModel` and `resolveLegacyHarness`;
the model binding is `{providerId, modelId, revision, timeoutMs}`. The default
daemon does not supply them or inherit Codex credentials/model identity.
Retained contract tests and synthetic providers do not reopen those write
flows or certify current Desktop classification/publication.

Read the owning [retained API](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/legacy-api.md), [classification](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/classification-service.md) and [Catalog](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/catalog-service.md) contracts before constructing requests.

## Recover, maintain and upgrade

| ID | Ask the Expert | Required result and boundary |
| --- | --- | --- |
| V02-D01 | Reconcile this exact lost-response request | Inspect retained receipt and Run; restart/reconciliation keeps the original claim and execution count. Never automatically refresh revision, change requestId or redispatch. |
| V02-D02 | Back up my Workspace and verify restoration | Take a consistent project/state backup; use `evopilot_v01_workspace_backup_inspect` for fresh anchor/inventory/digest verification. A repeated backup request returns a historical receipt, not fresh verification. Reject corrupted backup before replacement. Git history alone is not a full backup. |
| V02-D03 | Relocate my existing v0.1.1 Workspace | Preserve historical records and digests through migration provenance; attach migrated locations through a fresh verified installation; do not edit old claims/decisions or execute old Runs. Recovery must retain post-cutover writes. |
| V02-D04 | Upgrade while preserving my customization | Check product, Workspace-format and template compatibility separately. Preserve user files, report conflicts and retain specifications/v1. |
| V02-D05 | Explain this unsafe path or unsupported operation | Show the actual safe diagnostic and supported next action. Preserve data; do not bypass guards, leak credentials or fabricate completion. |

Product upgrades use a new verified installation, stop the old connection and explicitly attach the existing project/state. Template upgrades are separate: the Expert uses `evopilot_v01_workspace_project` with operation `template.upgrade`, an exact expected template version and target `0.2.0`. Known-compatible `0.1.1` and `0.2.0` project markers retain the v1 schema/specifications. Missing template files are copied from the verified installation; customized files are preserved and reported as conflicts. The original marker and exact upgrade plan are retained privately. Unsupported versions are refused before writes. Do not assume that updating the product overwrites the user project.

## Acceptance

Every row requires automated branch evidence and real Codex Desktop observations bound to the exact candidate installation. The catalogue test rejects a missing guide/scenario mapping, orphan scenario or missing test binding. String matching in guidance verifies distribution only, never model behavior. [Testing](testing.md) explains the evidence verifier and its limits.

A valid candidate report is stored privately; documentation and catalogue carry no changing PASS claims. Configured synthetic provider tests cannot be relabeled as real Host execution. WorkBuddy is outside v0.2.0 acceptance.

## v0.5 online journeys

| ID | User outcome | Executable coverage |
|---|---|---|
| V05-U01 | Configure private providers; review and select an immutable service binding; explicitly start | `online-profile.test.mjs`, `online-owner.test.mjs`, `online-worker.test.mjs` |
| V05-U02 | Inspect actual measured windows, native reports and authenticated alerts; reject incomplete data | `online-prometheus.test.mjs`, `online-owner.test.mjs` |
| V05-U03 | Reconcile a confirmed finding into one reviewable Runtime repair candidate, including lost response | `integration/e2e/online-feedback.test.mjs` |
| V05-U04 | Compare same-policy real failure and recovery without publishing or weakening a policy | `online-owner.test.mjs` |
| V05-U05 | Continue after client exit; restart with watermarks; block live maintenance; stop owned worker | `integration/e2e/online-worker.test.mjs` |

Harness test paths are under `projects/evopilot-harness/tests/e2e`; integration test paths are under `integration/e2e`. These named tests exercise actual product APIs; telemetry fixtures are labeled synthetic. Controlled real Prometheus/Alertmanager plus the isolated project and actual installed Codex journeys remain fixed P11/P12 acceptance, never inferred from this table. See [the user guide](online-harness.md).

## v0.6 response journeys

Read [response linkage](response.md) and the exact installed owner guides. These are fixed journeys to test; their catalogue entries do not certify completion.

| ID | User journey | Automated evidence |
| --- | --- | --- |
| V06-U01 | Instantiate the optional operations profile for forward/reverse assets, preserving project scope and provenance | Ontology `operations-profile.test.mjs` |
| V06-U02 | Inspect a real finding, review the problem, resolve applicable published guidance and prepare a response | Harness and Runtime `response.test.mjs` |
| V06-U03 | Execute the reviewed isolated action once; reconcile uncertainty and confirm actual cancellation | Runtime and parent `response.test.mjs` |
| V06-U04 | Independently validate and compare actual same-binding recovery before reviewing disposition | Harness and parent `response.test.mjs` |
| V06-U05 | Review owner reuse/new delivery, preserve history and recover schema-5 state | Parent `response.test.mjs` |

Actual installed Codex default-off, explicit activation, guide readback, owner routing and reconnect remain separate required acceptance evidence. The two synthetic sample domains do not satisfy the second real-project v1.0 criterion.

## v0.7 planning and readability

| Journey | Expert entry | Deterministic E2E evidence |
| --- | --- | --- |
| V07-U01 | planning-explore: forward ideation | Runtime planning and parent planning integration tests |
| V07-U02 | planning-explore: reverse onboarding | Scoped source/summary/reference distinctions; no source mutation |
| V07-U03 | planning-review | Exact human decision, digest-bound table export and tamper detection |
| V07-U04 | planning-resume | Retained revisions across sessions, concurrent-edit rejection |
| V07-U05 | planning-handoff | Exact Goal, source, assets and fixed acceptance binding |
| V07-U06 | planning-resume | Stale admission blocks; original receipts remain reconcilable |
| Read models and gates | readable-assets | Native positive/negative validation, typed tables, complete pagination, exports and comparisons |
| Prepare complete drafts | draft-preflight | Owner validation before immutable freeze/materialization |

Source test files: `integration/e2e/planning.test.mjs`, `integration/e2e/readability.test.mjs`, `integration/e2e/readable-presentation.test.mjs`, `integration/e2e/native-project.test.mjs`, and `projects/evopilot-runtime/tests/e2e/planning.test.mjs`. Actual installed Codex first-use, reconnect and human presentation readback require separate exact-candidate Host evidence. None of these tests is a human domain decision.
