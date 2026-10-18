# Workspace migration and source boundaries

## Upgrade from v0.2–v0.4 to v0.5.0

This is a same-machine, same-OS-user upgrade of an existing Workspace. It does not require moving the editable project or protected service state. Use the exact [v0.5.0 Preview bundle](https://github.com/yeliang-wang/evopilot/releases/tag/v0.5.0) and a new versioned program directory; preserve the previous installation. Publication does not switch a user's daily plugin.

1. Inspect the old installation, Workspace binding and unresolved owner operations. Stop its authenticated connection and any independently enabled online worker. If a control record is stale, use [verified recovery](recovery.md#connection-recovery); retain the record and never kill an unidentified process or replay an uncertain request.
2. Use Workspace maintenance to back up both editable project files and owner state into a new private directory. Verify the backup manifest, protected anchor and required relocation keys. Retain the exact old installation and binding with the backup.
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
