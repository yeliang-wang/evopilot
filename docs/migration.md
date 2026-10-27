# Workspace migration and source boundaries

## Current upgrade route

Choose by the actual installed version and schema state, not by an old example. For v0.8.0 to v0.8.1 or later, use the [v2 migration guide](migration-v080-v081.md): current v2 writes use **Runtime 8 / Harness 8 / Ontology 5**. Historical usability v1 marker 7 is not the v2 target. v0.8.1 and later maintenance patches preserve these semantics, but still require a new verified installation, stopped current backup, isolated recovery verification and current Host readback. Earlier source versions must first use their applicable historical migration steps below; those steps alone do not establish v2 compatibility.

The v2 standard separates asset content from optional execution: L3 content qualification may have reconstruction `NOT_REQUESTED`. Installing or upgrading the product does not assign a project level, approve new model meaning, enable monitoring or execute business work. Preserve original assets, decisions and receipts; never downgrade markers or replay uncertain work.

## Upgrade from v0.7 to v0.8.0

v0.8 adds independent asset consumption, explicit L1/L2/L3 usability assessment, mandatory purpose/scope/level admission before reverse modeling, and controlled reconstruction with an independent fixed oracle. Verified L3 is limited to the reviewed functional slice and requires two clean complete reconstructions; it does not mean byte-identical source, whole-project coverage, production readiness or automatic release. Native `specifications/v1` and original producer identities remain fixed. Runtime reconstruction and Harness usability writes use state marker **7**; read-only discovery does not silently grade historical assets.

1. Reconcile the original pending requests without redispatch. Stop the verified connection and independent online worker before maintenance.
2. Create and verify a complete stopped backup of editable project files, owner state, original receipts and relocation keys. Preserve the previous installation. Unsupported paths or links must be handled through an explicitly bounded preservation procedure; do not discard files or call a partial copy a full backup.
3. Prove actual new-version reads and isolated recovery before any daily cutover. Compare retained package, decision and receipt identities. Preserve pending claims and unknown historical levels. Old writers must fail safely on unsupported markers.
4. Install the exact verified 0.8.0 bundle in a new program root, inspect its identity in the actual Host, then attach only the intended stopped Workspace. An installed package or source test alone does not prove Host acceptance.
5. For rollback, stop all users of the new state, preserve it separately, restore the matching verified pre-upgrade backup into its original missing or empty roots, and use its original installation. Do not replay work, overwrite a live Workspace or infer L3 from migration.

## Upgrade from v0.6 to v0.7.0

Version 0.7.0 adds scoped discussion/planning revisions, table-first asset and gate reports, bounded version comparisons, draft preflight and streaming Workspace maintenance. Native `specifications/v1` remain unchanged. Runtime planning writes advance its database marker to **6**; Harness remains at **5** and the Ontology native schema is unchanged. Older Runtime readers must not open new planning state.

1. Pause project work at a retained checkpoint and reconcile original unresolved requests. Inspect the old installation and owner state. Stop the connection and any explicitly enabled online worker before maintenance; do not replay a business operation as part of upgrade.
2. Use supported maintenance under its exclusive lease to create and verify a fresh backup of editable project files and protected owner state. Preserve the old installation, binding, relocation keys and raw receipts. v0.7 streams 4 MiB chunks and retains internal relative links and tool cache bytes within its documented limits; see [maintenance](preflight-maintenance.md).
3. Prove upgrade and rollback on an isolated owner-validated copy. Compare original owner records and asset digests after opening with the actual new installation. Preserve history and verify the old executable can read its matching restored backup. A synthetic/empty test alone does not establish compatibility with a user's existing Workspace.
4. Install the exact [v0.7.0 bundle](https://github.com/yeliang-wang/evopilot/releases/tag/v0.7.0) in a new program directory. Attach the stopped original Workspace only after backup and isolated recovery pass. Verify records, pins, toolchain, project/state paths and component versions before replacing the daily plugin registration.
5. In a fresh Codex connection select **EvoPilot v0.7 Preview**, inspect the exact installation identity, activate, read existing assets/project status and verify per-chat deactivation. Existing chats may retain old tools and require reselection/reconnection before they resume.

Rollback stops all users of the new state, preserves any new state separately, restores the verified pre-upgrade backup into its original missing or empty roots, then restores the matching old installation. Never point v0.6 at marker 6, overwrite a live Workspace, or replace user assets with acceptance fixtures. Upgrade does not accept a new business model, execute a project, publish assets or enable online monitoring.

## Upgrade from v0.5 to v0.6.0

Version 0.6.0 Preview adds response linkage and preserves the native v1 specifications. Use the exact [v0.6.0 bundle](https://github.com/yeliang-wang/evopilot/releases/tag/v0.6.0) and preserve the earlier installation for rollback. New Runtime/Harness response writes use database marker **5**; the Ontology native schema is unchanged. An old reader must reject new state rather than silently ignore response records.

1. Inspect the old installation and latest accepted project assets. Reconcile original pending requests without resubmission. Stop its connection and independent online worker, then create a supported consistent backup of editable files and owner state. Preserve current receipts, relocation keys and the old installation; do not substitute an older acceptance fixture.
2. Prove upgrade and restore on an isolated copy, using the actual 0.5 program to establish historical state. Compare published packages, decisions, execution receipts and source bindings after opening with 0.6. Preserve original records; response state is additive. Test that old Runtime/Harness readers reject marker 5 and that supported backup/restore retains new cross-owner references.
3. Install the exact verified 0.6 bundle in a new program directory and complete real Codex acceptance against isolated data. Keep candidate and daily MCP server identities separate. A connection's version and installation digest, rather than its display label, identify what was tested.
4. After preservation and recovery checks pass, stop all processes using the original Workspace, take a current backup and attach the final 0.6 installation to that stopped Workspace. Compare historical records again, then switch the local plugin registration. Verify the fresh connection's component versions, Workspace identity, passive initial state and explicit activation before resuming project work.

Rollback preserves newly created state separately and restores the matching verified pre-upgrade backup to its original missing or empty roots with the old installation. Never point 0.5 at marker 5 or overwrite current data with a historical test snapshot. The [cache maintenance requirements](recovery.md#native-toolchain-cache-during-maintenance) still apply.

This upgrade does not re-extract project assets, approve domain changes, execute remediation or enable monitoring. The new response executor remains the pinned isolated Node collector with explicit loopback scope. Java/Maven and remote providers require separate Roadmap work; installing 0.6 alone does not complete those project acceptance gates.

## Upgrade from v0.2–v0.4 to v0.5.0

This is a same-machine, same-OS-user upgrade of an existing Workspace. It does not require moving the editable project or protected service state. Use the exact [v0.5.0 Preview bundle](https://github.com/yeliang-wang/evopilot/releases/tag/v0.5.0) and a new versioned program directory; preserve the previous installation. Publication does not switch a user's daily plugin.

1. Inspect the old installation, Workspace binding and unresolved owner operations. Stop its authenticated connection and any independently enabled online worker. If a control record is stale, use [verified recovery](recovery.md#connection-recovery); retain the record and never kill an unidentified process or replay an uncertain request.
2. Use Workspace maintenance to back up both editable project files and owner state into a new private directory. If the native tool cache exists, follow the explicit [cache-isolation procedure](recovery.md#native-toolchain-cache-during-maintenance); v0.5 does not exclude it automatically. Verify the backup manifest, protected anchor and required relocation keys. Retain the exact old installation and binding with the backup.
3. Create an isolated copy through owner-validated migration. Open it with v0.5 and compare historical state, receipts, audit and asset-blob digests. Prove recovery by restoring its pre-upgrade backup and reading it with the old version. A successful empty/synthetic Workspace test does not establish compatibility of existing user data.
4. After that proof, install v0.5 in its final new program directory and explicitly attach the stopped original Workspace. Attachment initializes owner schemas and validates the binding; it is not passive inspection. Compare historical digests again and preserve customized project files. Prepare and inspect the pinned native toolchain before native validation.
5. Replace the old Codex plugin registration with the new installation's local marketplace and plugin. Preserve old program files for rollback. In a fresh Codex chat, verify the version, installation ID, program root, Workspace roots and component identities before activation. Confirm first-use inactivity, activation, capabilities, readback, restart and per-chat deactivation through actual MCP receipts. Existing chats may retain the old connection and need a fresh selection or reconnection.

An upgraded database must not be opened by the old program. Rollback means stopping v0.5, preserving its current project/state separately, restoring the verified pre-upgrade backup into its original missing or empty roots, then restoring the old plugin registration. Never restore over live data or merely point an older binary at upgraded tables. See [backup and recovery limits](recovery.md#workspace-backup-and-restore).

The data upgrade preserves historical deliveries; it does not certify old JSON assets against corrected native v1, re-extract project sources, approve domain changes or start online monitoring. New native work follows the [native workflow](native-workflow.md). Online service selection and worker start remain explicit actions in the [online guide](online-harness.md). Personal upgrade reports, paths and receipts stay outside product source and GitHub.

## Upgrade from 0.1.1 to 0.2.0

Use a new verified 0.2.0 installation. Keep the old installation and Workspace until an isolated migration copy passes owner validation. A 0.1.1 Workspace may lack the new editable project root; explicit attachment creates that template separately while preserving state.

1. Inspect the original identity, records, deliveries and unresolved operations. Reconcile UNKNOWN requests without redispatch.
2. Stop the old authenticated connection. Create an independent private editable project and bind the new installation to verified existing state for maintenance. Stop all services sharing that state.
3. Back up project and state. Retain the manifest, protected local backup anchor and relocation keys. Verify inventoried bytes.
4. Request migration to new project and state roots. The parent copies opaque state; each owner validates snapshots and appends signed location lineage. Asset digests, Run plans, decisions, claims and receipts remain unchanged. The source remains available.
5. Compare owner business-record/blob digests at the destination and inspect unresolved work. Historical pending requests need fresh preparation/review; claimed UNKNOWN runs only reconcile their original claim.
6. Attach a fresh installation to the destination, complete actual Codex journeys, then switch the registered plugin entry. Retain the previous installation, source state and migration evidence.

This release supports the same machine and OS uid. Restore targets original canonical locations, both missing or empty, and never overwrites live data. A separate relocation can move restored state. Cross-machine restore, key import and hot switching are unsupported.

Template upgrades copy missing bundled files, preserve customized files and retain the original marker/report. They do not change product code, published assets or specifications/v1.

## Historical source disposition

This preview separates historical material by ownership and role. The independently retained source-role audit covers **739 files** at immutable source commit `372733fd7b67ec3bee9efe6322f0229db77b160d`; all 739 source hashes were unchanged. It establishes source disposition, not completed operational migration.

| Source role | Files |
| --- | ---: |
| Historical evidence | 125 |
| Expert guidance replaced | 24 |
| Build metadata | 48 |
| Verified extraction or preservation | 230 |
| Documentation replaced | 62 |
| Harness or Host schema | 64 |
| Legacy test evidence | 96 |
| Equivalent Ontology asset fixture | 1 |
| Harness presentation/catalog | 60 |
| Mixed entry replaced | 4 |
| Harness quality | 11 |
| Harness consumer | 2 |
| Mixed read model replaced | 1 |
| Harness infrastructure | 1 |
| Infrastructure replaced | 5 |
| Host presentation replaced | 4 |
| Mixed state replaced | 1 |

The 230 verified extracted/preserved files and one equivalent Ontology fixture are distinct dispositions. The audit also identifies 38 duplicated schemas; that cross-cutting count must not be added to the 739-file total. Immutable origin/revision/digest records preserve attribution and traceability. Historical tests and decisions remain evidence, never current authorization.

The operational inventory includes 45 retained Ontology operations plus seven classification operations. Retained producers require decided plans; classification requires explicit trusted source/advisor/model bindings. Harness and Ontology Catalog formats remain distinct. Source recognition does not imply semantic validity or convert a legacy lifecycle label into native approval.

Independently recorded new-workspace imports comprise **5 Ontology sources** (4 public, 1 private) and **146 Harness sources** (101 public, 45 private). These are source-only records with retained raw bytes and origin identity. Approval is not inherited. Native use still requires current review, real human decision and separate publication in the exact project/visibility scope.

Use [first journey](first-journey.md) to distinguish native repository reverse modeling from structured legacy import/derive, and [recovery](recovery.md) for uncertain operations. Preserve current workspace data and credentials during product changes.

Source-role review of the 739-file inventory is complete. Operational migration closure is established only by E03 evidence in the exact candidate-bound local report described in [testing](testing.md). Candidate-bound operation/source ledgers, exact installed product and Expert readback, Host evidence and final installed-link proof remain required. Technical assembly and passive installation do not close these requirements. Without a current report and review of its real receipts, no operational closure is claimed.
