# Testing and evidence — v0.2.0 Preview

The v0.2.0 candidate must cover every case in the [Expert catalogue](expert-scenarios.md), including all existing retained workflows and new Workspace initialization/maintenance. `expert/core/scenarios.ts` is the canonical metadata; `getGuide("V02-A02")` returns a concrete use case with prerequisites, required branches, expected outputs, preserved state, test files and real Desktop observations. The seven earlier guide groups remain compatible.

| Current v0.2 evidence layer | What it proves | What it cannot prove |
| --- | --- | --- |
| `integration/e2e/expert-catalogue.test.mjs` | Guide/scenario/Target/test binding completeness; immutable pure guide metadata; compiled MCP passive readback | Correct Host reasoning or successful real project work |
| `integration/e2e/expert-products.test.mjs` | Real product draft/review/decision/publication, scope, quality and retained previous deliveries using explicitly synthetic material | Actual human decisions or Desktop behavior |
| Workspace bootstrap/project/maintenance E2E | Product initialization, bindings, source drift, private ledger, backup/restore and migration invariants | Real installed Desktop connection unless separately observed |
| Existing child product E2E | Actual native and retained operation behavior; configured synthetic providers clearly identified | Default installation has an advanced provider when it does not |
| Real Codex Desktop journeys | Natural-language routing, installed tools, actual outputs/receipts, fresh connection and recovery for the exact candidate | Independent release authorization |

Run `npm run build`, `npm test` and `npm run check` from the populated source checkout. Each mapped test file must actually execute in the candidate test run; file existence and guide text assertions alone are insufficient. New Expert scenarios require new catalogue and E2E mappings. Required scenarios cannot pass with PENDING, UNKNOWN, FAIL or SKIPPED. WorkBuddy remains outside this release.

## Private v0.2 scenario report

`expert/core/acceptance.ts` exports `evaluateScenarioEvidence(report, expectedInstallationDigest)` for metadata and `verifyExpertAcceptanceFile(reportPath, expectedInstallationDigest)` for metadata plus file-byte integrity. The compiled module is shipped under `dist/expert/core/acceptance.js`. The report lives outside public source and installation; no passing report is bundled.

The report has exactly `schema: evopilot-expert-evidence/v1`, `version: 0.2.0`, `installationDigest` (64 lowercase hex) and `scenarios`. It contains each V02-A01–A07, V02-B01–B07, V02-C01–C08 and V02-D01–D05 exactly once. Each scenario has `id`, `status` (PASS/FAIL/PENDING/UNKNOWN/SKIPPED) and `evidence`.

Each evidence record contains `kind` (automated/desktop), canonical absolute `path`, lowercase hex `sha256`, matching `installationDigest`, explicit `synthetic` boolean and `branches` from that scenario. Automated records also contain `tests` drawn from its declared test paths; all mapped paths and required branches must be covered. Desktop records instead contain real UUID `threadId` and `toolNamespace: evopilot_v01_preview`, with `synthetic: false`. Every scenario requires actual Desktop observations. Configured classification/Catalog provider success is explicitly synthetic automated evidence; the default Desktop branch proves an accurate missing-provider diagnostic, not a successful advanced operation.

File verification rejects symlinks, hard links, changed bytes, missing evidence, conflicting hashes and self-referential reports. Report files are bounded to 4 MiB and evidence files to 32 MiB. The returned `completeness` is COMPLETE, INCOMPLETE or INVALID. **Even COMPLETE returns `acceptance: NOT_EVALUATED`, `authority: false` and `releaseAuthorized: false`.** Hashes and coverage cannot judge whether receipts satisfy their claims. The operator must compare actual candidate-bound outputs and decisions against every scenario before acceptance and conditional publication.

## Retained historical baseline and verifier

The material below documents earlier contracts. It does not replace v0.2 scenario evidence, mutate historical E01–E19 or relabel old Host results as current acceptance.


Install the parent compiler from its complete lock, bind the local public packages, then install each child from its own lock and build it before building the parent as described in [development](development.md). Current checks cover compiled JavaScript entry points, conditional declaration exports, strict consumer typing, full source lock integrity, production-only installation and installation-local documentation links. The release gate tests exercise exact candidate preparation and publication guards; no fixture establishes acceptance. Current delivery uses [the exact candidate release sequence](github-release.md).

The standalone local-acceptance verifier documented below intentionally remains a historical v0.1.0 report contract. Do not relabel its fixtures as v0.1.1 evidence. Current repair acceptance requires external evidence bound to the exact v0.1.1 source, bundle and installation, preserving every required Host journey and receipt check.

The retained historical source baseline reports **394 PASS, 0 FAIL, 0 SKIP**, with a separate baseline of **4 distribution fixture tests PASS**. These counts describe those recorded runs, not a fixed future suite size or the current candidate's verdict. Retain the actual command, environment, candidate identity and result for each new run. Technical assembly and passive installation alone do not establish Host acceptance.

| Behavior | Actual source test file | Evidence boundary |
| --- | --- | --- |
| Exact owner contracts, immutable pins, provider forwarding and dual result priority | `integration/e2e/composition.test.mjs` | Interface fixtures |
| Actual product publication, dual PASS, lost response and restart reconciliation | `integration/e2e/composition-products.test.mjs` | Actual public packages with explicitly synthetic decisions/material |
| Shared connection lifecycle and startup coordination | `integration/e2e/connection.test.mjs` | Connection fixtures |
| Passive discovery, actual Runtime activation, durable receipt after restart | `integration/e2e/connection-products.test.mjs` | Actual installed public packages |
| MCP metadata/IDs, closed arguments, bounds, session isolation and guide mapping | `integration/e2e/plugin.test.mjs` | Spawned adapter; connection stub where labelled |
| Portable assembly, document path translation, install/doctor/preservation/refusal | `integration/e2e/distribution.test.mjs` | Synthetic package fixtures |
| Package locks, exports, licenses/provenance, consumer links and archive guards | `integration/e2e/artifacts.test.mjs` | Actual package checks and malformed fixtures |
| Owned source graphs, canonical pins and denied parent reads | `integration/e2e/package-isolation.test.mjs` | Populated child packages required |
| Retained roadmap and authority gates | `integration/e2e/governance.test.mjs` | No acceptance mutation |
| Candidate report structure, identity binding, hashes and fail-closed results | `integration/e2e/local-acceptance.test.mjs` | Synthetic report-verifier unit fixtures; NOT Host acceptance |

After [source setup](development.md), run the complete checks from the populated parent:

```sh
npm run build
npm run check
npm test
npm run roadmap:check
```

For focused report and baseline regression checks in the source checkout:

```sh
node --test integration/e2e/governance.test.mjs integration/e2e/local-acceptance.test.mjs
node scripts/roadmap.mjs --check
```

Filesystem fixtures create and clean up their own temporary directories. `EVOPILOT_TEST_TMPDIR` can select an existing writable scratch parent outside the source checkout, installation and real workspace. Missing dependencies, unpopulated children or unavailable scratch space must be reported as verification limitations, never passing cases. The full product checks require the populated checkout and all three local public packages described in [development](development.md).

M0 Desktop evidence establishes feasibility only. All E01–E19 remain required without reduction, including the candidate-bound installed Host journey, native forward/reverse modeling, quality and Runtime handoff, multi-chat isolation, concurrent startup reuse, lost-response receipt recovery without redispatch, and separate execution/quality/business status readback. Installed documentation/Expert readback and migration ledger proof remain required. The immutable `governance/acceptance.json` is the initial M1 planning baseline with 19 PENDING criteria, not the current candidate verdict. `roadmap:check` validates that baseline, decision and frozen roadmap bindings and reports `validation: INITIAL_M1_BASELINE`, `localAcceptance: NOT_EVALUATED`.

Current candidate status is supplied separately in a private local report. Without one, no acceptance claim is made. From the source checkout or installed `installationRoot` (`managedRoot/app`), verify an operator-selected report using the shipped [standalone verifier](../scripts/verify-local-acceptance.mjs):

```sh
node scripts/verify-local-acceptance.mjs --report /absolute/operator-selected/candidate-report.json
```

The shipped [roadmap checker](../scripts/roadmap.mjs) also runs from either root with `node scripts/roadmap.mjs --check`; it reads only the immutable public governance baseline. Neither command ships a live candidate report or supplies Host evidence.

The report has schema `evopilot-local-acceptance-result/v1`, targetId `evopilot-v01-local-20261012`, version `0.1.0`, scope `M0-M4_LOCAL`, authority `NONE`, and `remoteActionsAuthorized`, `releaseAuthorized`, `dailyCutoverAuthorized` all `false`. Its `approvedPlanDigest` is `sha256:5bae53afa8a1245d9b5f3c63630b9654ea04938481e3f798964c762a5a7cc926`; `roadmapDigest` is `sha256:06c0e62d0f2fffce6013720509a603e753ca4f402ce24fc0937c8b45bd8129c2`. These are the existing technical bindings, not signatures or human approval.

`candidate` contains exactly `componentLock`, `bundleManifest`, `sourceArchive`, and `installationIdentity`, each `{path, sha256}`. Paths are canonical absolute regular files without symlink ancestors or hard links; hashes are lowercase hexadecimal SHA256. JSON/receipt files are bounded to 4 MiB and the archive to 128 MiB, hashed as a stream without extraction. Self-report references and conflicting hashes for a repeated path are rejected. The component lock and bundle must identify exactly Runtime, Harness and Ontology `@evopilot-next/*` packages at `0.1.0`, the existing contract pin, and bundle Node `24.14.0`.

The installation identity file contains only the actual public connection `identity` object: `product`, `version`, `protocol`, `installationId`, `installationRoot`, `installationDigest`, `components`, `workspaceRoot`, `workspaceId`. Use product `evopilot-v01-preview`, protocol `evopilot-connection/v1`, and all three component versions `0.1.0`. Do not supply configuration, credentials or the live authenticated connection record. The installation digest covers the canonical installed inventory; locally rendered MCP configuration means it differs from the bundle manifest hash. The checker validates expected identity fields and consistency, not the live installation inventory or archive contents.

`criteria` contains exactly E01–E19, each with `category: LOCAL`, `critical: true`, a status of `PASS`, `FAIL`, `PENDING`, `UNKNOWN` or `SKIPPED`, and an `evidence` array. Keep the authoritative criterion meanings unchanged. Every PASS needs evidence with `{path, sha256, kind, claim}`; `kind` is `technical` or `desktop`. Desktop evidence additionally requires a UUID `threadId`, the exact candidate identity's `installationDigest`, and `toolNamespace: evopilot_v01_preview`. E07, E09, E10, E14, E15 and E16 each require desktop evidence for PASS. The M0 namespace cannot satisfy that binding. Evidence arrays are bounded to 256 entries per criterion and claims to 8192 characters.

Any non-PASS criterion yields `NOT_PASSED` and CLI exit 1; malformed structure, identities or hashes also exit 1. All PASS yields `localAcceptance: PASSED`, exit 0 and authority `NONE`, with all authorization flags still false. This is **structural binding, integrity and completeness only**. Digests establish byte integrity, not intrinsic semantic truth. Descriptions, author assertions, discovery, metadata, simulations and tool names alone cannot prove acceptance. The operator must review the real receipts against every unchanged criterion; the checker never supplies human approval.

Store the report outside the app, source checkout and real workspace. It contains private audit paths and must not enter a public package or source archive. Any public redacted summary must remain within the genuine decision scope; the approved repair conditionally authorizes release after exact candidate acceptance without a redundant approval. Keep candidate documentation independent of changing report status so later Host evidence does not require byte edits or repeated installation. The synthetic unit fixture that returns structural PASS is not a shipped acceptance report or evidence of a real Host journey.

See [capabilities](capabilities.md), [composition](product-composition.md), [migration](migration.md) and [current roadmap](roadmap.md). CI configuration is not evidence that CI or a Host journey ran.
