# GitHub delivery — v0.6.0 Preview candidate

The active v0.6 Target authorizes implementation and local installation. It does **not** record a new GitHub publication decision. The workflow below prepares the process for a separately authorized exact candidate; source version changes and prior v0.5 release authority do not authorize publishing v0.6.

The release repositories are [EvoPilot](https://github.com/yeliang-wang/evopilot), [Runtime](https://github.com/yeliang-wang/evopilot-runtime), [Harness](https://github.com/yeliang-wang/evopilot-harness) and [Ontology](https://github.com/yeliang-wang/evopilot-ontology). Each child owns its release. Parent gitlinks bind exact child commits. The existing v0.1.0 tags, artifacts and evidence remain immutable history.

Source CI recursively checks out pinned children, installs parent development tools from the complete lock, binds child public packages using npm --no-save --package-lock=false, then runs npm ci from each child lock and builds each child before building, checking and testing the parent. Binding must precede the final child npm ci so child transitive dependencies retain their locked versions. Offline artifact verification precedes portable assembly. See [development](development.md) for the commands.

The parent candidate has exactly eight distribution assets: evopilot-0.6.0-preview.tar.gz; one tgz in each runtime, harness and ontology directory; harness/dependency-lock.json; ontology/dependency-lock.json; source-revision.txt; and SHA256SUMS. Runtime has no production dependency lock. Release notes form the Release body and are not a ninth asset.

Delivery follows this sequence:

1. Complete source CI for the exact commit and retain its run identity and candidate checksums.
2. Review full acceptance evidence for that exact source, package set, bundle and installed candidate, including real Host journeys and retained receipts.
3. Dispatch the common release workflow with publish=false, expected_commit, source_run_id, expected_digest and decision_ref. Inspect the prepared exact assets and notes.
4. Publish only when the genuine user decision covers the exact accepted candidate and the release gate passes. The public scope document itself grants no authority.
5. Verify the remote tag resolves to the exact commit, download the published assets, compare their checksums and inventory, and retain delivery evidence.

The identical common release workflow, gate and gate tests are maintained across repositories. Preparation retains read-only repository permissions; the separate publish job is the only writer. The gate validates source workflow/run identity, repository and version, candidate digest, exact layout and prepared file bindings. A decision_ref is a traceable binding to the real decision, not a free-form substitute for acceptance.

Existing tags or Releases must be inspected before retry. An uncertain result requires remote readback and reconciliation; never overwrite an existing tag, delete an existing Release, or assume a timed-out request did nothing. The workflow does not publish npm packages or alter daily installations.

The immutable M0/M1 governance remains separately checked. governance/delivery-repair-v011.json preserves historical repair scope; governance/workspace-v02.json preserves Workspace scope without overwriting acceptance history. Technical CI, fixture tests, assembly and discovery alone do not prove acceptance. See [testing and evidence](testing.md).

For local template regression checking in a suitable source environment:

~~~sh
OPENSSL_CONF=/dev/null node --test integration/e2e/release-gate.test.mjs
~~~

Record actual results for each candidate; these instructions do not claim a run or publication occurred.

## Historical v0.3 native acceptance

The approved [standards Target](../governance/standards-v03.json) freezes 65 criteria and 364 variants: 356 must pass before publication and eight concern post-release verification. Actual real-project scope/domain decisions, raw execution receipts, the independent instance plan and exact Codex Host evidence remain private. See the [acceptance evidence contract](native-acceptance.md).

The completeness verifier rejects omitted/duplicate instances and stale candidates; it cannot certify semantics, authenticate human statements or authorize release. Verify every actual expected outcome, installed identity, privacy scan, owner-standard pin and recovered receipt. Only the conditionally authorized exact candidate may be published. After publication compare every downloaded artifact, checksum, version, installed guide and owner readback before final closure. Historical v0.1/v0.2 reports cannot certify this correction.

## v0.4 feedback acceptance

The [feedback Target](../governance/feedback-v04.json) fixes 12 criteria and 36 variants. Bind results to the exact four source revisions and artifacts. Registered Run capture, durable recovery, source/scope guards, native owner updates and reuse, real installed Codex journeys, old-reader rejection and backup restore must each have their own evidence. Publication is conditional on all required pre-release evidence; actual public download and installed readback close the post-release part of F12.03. v0.3's frozen 497 instances remain historical evidence and are not relabeled as v0.4 results.

## v0.5 online Harness acceptance

The [online Harness Target](../governance/online-harness-v05.json) fixes P01–P12 and all 36 variants. Retain real provider, native evaluation, durable scheduler, supervised lifecycle, fault/recovery, repair feedback, stopped-state upgrade/restore and installed Codex evidence for the exact candidate. Earlier feedback results do not substitute for these checks. Only conditional publication followed by actual public download and installed readback closes P12.03. The supported profile, supervisor and provider boundaries are specified in the [online guide](online-harness.md); private service evidence and credentials never enter release artifacts.
