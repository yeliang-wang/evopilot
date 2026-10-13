# GitHub delivery — v0.2.0 Preview

The release repositories are [EvoPilot](https://github.com/yeliang-wang/evopilot), [Runtime](https://github.com/yeliang-wang/evopilot-runtime), [Harness](https://github.com/yeliang-wang/evopilot-harness) and [Ontology](https://github.com/yeliang-wang/evopilot-ontology). Each child owns its release. Parent gitlinks bind exact child commits. The existing v0.1.0 tags, artifacts and evidence remain immutable history.

Source CI recursively checks out pinned children, installs parent development tools from the complete lock, binds child public packages using npm --no-save --package-lock=false, then runs npm ci from each child lock and builds each child before building, checking and testing the parent. Binding must precede the final child npm ci so child transitive dependencies retain their locked versions. Offline artifact verification precedes portable assembly. See [development](development.md) for the commands.

The parent candidate has exactly eight distribution assets: evopilot-0.2.0-preview.tar.gz; one tgz in each runtime, harness and ontology directory; harness/dependency-lock.json; ontology/dependency-lock.json; source-revision.txt; and SHA256SUMS. Runtime has no production dependency lock. Release notes form the Release body and are not a ninth asset.

Delivery follows this sequence:

1. Complete source CI for the exact commit and retain its run identity and candidate checksums.
2. Review full acceptance evidence for that exact source, package set, bundle and installed candidate, including real Host journeys and retained receipts.
3. Dispatch the common release workflow with publish=false, expected_commit, source_run_id, expected_digest and decision_ref. Inspect the prepared exact assets and notes.
4. Publish only when the genuine decision binding covers the exact accepted candidate. The approved v0.2.0 target conditionally authorizes the four Preview releases after full acceptance. The public scope document itself grants no authority.
5. Verify the remote tag resolves to the exact commit, download the published assets, compare their checksums and inventory, and retain delivery evidence.

The identical common release workflow, gate and gate tests are maintained across repositories. Preparation retains read-only repository permissions; the separate publish job is the only writer. The gate validates source workflow/run identity, repository and version, candidate digest, exact layout and prepared file bindings. A decision_ref is a traceable binding to the real decision, not a free-form substitute for acceptance.

Existing tags or Releases must be inspected before retry. An uncertain result requires remote readback and reconciliation; never overwrite an existing tag, delete an existing Release, or assume a timed-out request did nothing. The workflow does not publish npm packages or alter daily installations.

The immutable M0/M1 governance remains separately checked. governance/delivery-repair-v011.json preserves historical repair scope; governance/workspace-v02.json defines current scope without overwriting acceptance history. Technical CI, fixture tests, assembly and discovery alone do not prove acceptance. See [testing and evidence](testing.md).

For local template regression checking in a suitable source environment:

~~~sh
OPENSSL_CONF=/dev/null node --test integration/e2e/release-gate.test.mjs
~~~

Record actual results for each candidate; these instructions do not claim a run or publication occurred.

## v0.2 Workspace acceptance

Before publication, review all 27 exact-candidate scenarios, actual Codex receipts, isolated recovery tests and real-data migration/readback evidence. `node scripts/verify-workspace-acceptance.mjs --report PRIVATE_REPORT --installation-digest DIGEST` verifies retained bytes and metadata completeness only. It cannot infer semantic acceptance or create release authority. Keep the private report and source project data outside public release artifacts. Historical M0–M5 reports do not certify v0.2.
