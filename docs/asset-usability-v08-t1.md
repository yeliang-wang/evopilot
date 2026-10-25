# v0.8 T1 contract and preflight source candidate

This source candidate implements the first bounded part of [the accepted v0.8 plan](asset-usability-v08.md), including its confirmed modeling-purpose amendment. The [execution Target](../governance/asset-usability-v08-execution.json) pins the planning inputs, accepted v0.7 prerequisites, authorized files, limits, 27 fixed foundation variants, 18 project admission themes and 19 owner admission variants. Public planning status does not infer acceptance; actual decisions, source identity, experiment records and test results stay private.

The parent owns the [canonical typed contract](../integration/compatibility/usability/v1/contract.mts) and generates byte-identical distribution copies for the three independent products. Harness exposes the [read-only usability SDK](../projects/evopilot-harness/docs/usability.md). Ontology remains the source of immutable semantic material, and Runtime remains the execution and decision owner. The [architecture decision](architecture/0006-usability-contract.md) records the alternatives and trust boundary.

## What is implemented

- Fixed L1/L2/L3 meanings, intended scenarios and assessment-state vocabulary.
- Independently pinned question/behavior inventories, 13 normative behavior facets, scoped citations and source/asset/environment/dependency freshness checks.
- Bounded, permission-checked preflight reporting missing, ambiguous, conflicting, draft, inaccessible, stale or tampered material.
- Separate requested level and verified level: every preflight result has `verifiedLevel: null` and `assessmentStatus: NOT_EVALUATED`, including complete-looking documents.
- Strict TypeScript consumer declarations, standalone packed SDK checks and parent-generated vendor integrity checks.
- Mandatory purpose/scope/target/acceptance/user-intent binding before new reverse project preparation, freeze and materialization, with cumulative L1/L2/L3 profiles and safe HTTP/MCP rejection diagnostics.
- Clear-context reuse without repetitive questions; stale or ambiguous intent blocks new work. Historical readback and read-only discovery remain available. The [admission decision](architecture/0007-modeling-intent-gate.md) specifies compatibility and evidence limits.

- Independent owner admission for exact assets, including trusted forward-source context, draft lifecycle rechecks, old receipt replay, published consumption and rollback protection. Unbound standalone CLI authoring fails closed; parent HTTP/MCP supplies reviewed project context.

The foundation, project admission and independent owner admission checks are covered here. Passing them does **not** close the full V08-E04–E07 requirements: actual installed Host acceptance, level displays, retained independently reviewed assessment states, mixed-slice/integration obligations, independent domain-answer assessment and a complete reviewed real behavior specification remain required. No L1/L2/L3 certificate, external ontology consumption service, isolated builder, successful reconstruction or v0.8 release is delivered by this source stage.

## Reproduce the source checks

Follow [development setup](development.md) to install locked dependencies, bind local packages and build children before the parent. Use Node 24.14.0 and locked TypeScript 5.9.3.

```sh
node scripts/verify-usability-target.mjs --roadmap /absolute/path/to/accepted/docs/roadmap.md
node scripts/sync-usability.mjs --check
npm run build
npm run check
node --test integration/e2e/usability-distribution.test.mjs projects/evopilot-harness/tests/e2e/usability.test.mjs
node --test integration/e2e/usability-modeling-gate.test.mjs
node --test integration/e2e/usability-owner-admission.test.mjs
node --test integration/e2e/native-transport-limits.test.mjs
```

Set `EVOPILOT_TEST_NATIVE_TOOLCHAIN` to a verified pinned toolchain. Set `EVOPILOT_V07_APP` to retained v0.7 application code for the actual old-writer/backup compatibility test; an omitted old-code path is an explicit skip, not acceptance.

The explicit Roadmap file must match the execution Target's digest. The isolated source baseline can precede uncommitted accepted planning; neither the checker nor this document silently replaces those original inputs. Missing or changed inputs must fail alignment. The historical `roadmap:check` still validates only its frozen baseline.

The current source Target rebinds the planning inputs to the accepted [controlled execution correction](architecture/0011-controlled-process-authority.md). Its `bindingRevision` retains the predecessor Target and input digests and pins the correction Target and ADR. All 27 foundation, 18 project-admission and 19 owner-admission variants remain unchanged. This source binding does not change the published v0.8.0 tag, historical receipts or acceptance decisions, and does not authorize a new asset, execution budget or release. Run both the execution and delivery checkers against the same accepted Roadmap; correction or input drift requires a new reviewed binding.

The public fixtures are synthetic. The private real-asset experiment freezes a consumer inventory before reading the current published owner record, cites exact normative file bytes, preserves all gaps and compares owner revisions before/after. A successful *gap experiment* does not mean the asset passed a usability level. Source copies retained for auditing are not approved builder inputs.

## Remaining delivery order

Finish T1 semantic inventory and independently reviewed assessment requirements before claiming the milestone. Then T2 supplies authenticated external consumption and specification-only projections; T3 supplies independent behavioral assessment; T4 performs bounded real reconstruction; T5 completes the real pilot, substantive evolution, installed journeys and separately authorized release gates. Keep all 18 requirements and 20 acceptance IDs in the denominator; this foundation does not reduce them.
