# Migrate 0.8.0 to 0.8.1 Preview

English | [简体中文](zh-CN/migration.md)

The new content standard is additive and explicitly named v2. Native RDF/SHACL/Rego v1 standards, immutable asset versions, decision records, request receipts and historical usability v1 assessments retain their original bytes and meaning. There is no automatic asset upgrade or relabeling of old L3.

## Before cutover

Verify the four exact source commits, component lock, release checksums and installed manifest. Stop the shared Workspace connection and independent worker using the supported maintenance workflow; deactivating a chat alone does not stop either. Make and verify a stopped backup of the complete nonempty Workspace state and its identity/configuration. Record the old installation path and identity. Do not copy a live SQLite database or restore synthetic fixtures over real data.

First perform the upgrade and recovery exercise in an isolated clone of that backup. Read old assets, decisions, receipts and v1 assessment digests before and after upgrade. Run the explicit v2 content flow in that clone and verify old writers refuse the resulting new state. Restore the matching stopped pre-upgrade backup and verify the old installation reads its original records. This is rollback of an installation, not erasure of new audit evidence; retain the failed candidate state separately.

## State and client compatibility

New Runtime/Harness readiness writes set their SQLite user-version markers to 8. Native Ontology writes containing `readiness/specification-v2.json` set its marker to 5. These versions prevent a 0.8.0 writer from accepting unsupported state. New readers understand the previous markers. Native v1 standard content is not regenerated under a different definition.

Old `usability.*` requests and `/v1/assets` keep v1 semantics. New owner `readiness.*` requests require `input.standardVersion: "v2"`; new HTTP requests use `/v2/assets` and `assets.readiness` or `assets.specification.v2`. Missing/unknown versions fail rather than silently changing a caller's interpretation. SDK discriminated operations separate the two protocols.

For each project, record a new v2 modeling intent and new asset versions. Preserve the old sources, asset pins, reviewed decisions and actual reconstruction history. A prior v1 L3 does not imply new full-project v2 L3; review the whole chosen scope. Content qualification never starts reconstruction. An explicitly linked v1 reconstruction assessment is labeled v1 and must bind the same exact asset digest; historical evidence cannot certify changed assets.

## Current installation

After all candidate checks, install the verified public download to a new versioned installation directory, bind the existing Workspace with supported maintenance, reconnect Codex and inspect the actual plugin and all three component versions. Read the v2 standard, content assessment and independent reconstruction state through the actual installed Host. Keep the previous installation and verified backup until cutover evidence is complete.

Rollback requires stopping the new services and restoring the matching pre-upgrade backup into its original supported identity before reconnecting the old installation. Do not open new marker-8/marker-5 state with an old writer, downgrade markers by hand, rewrite receipts or replay uncertain business requests.

See [maintenance and backup](preflight-maintenance.md), [installation](installation.md), [general migration](migration.md) and [v2 workflow](asset-readiness-v081-workflow.md).
