# Corrected-v1 native workflow

This documents the v0.3 implementation candidate. It is not a release, installed
Host acceptance or project completion certificate. The two owners define their
native standards; the parent defines the [project contract](../specifications/project/v1/README.md).

1. Inspect/initialize your Workspace, inspect the locked toolchain, explicitly
   prepare missing dependencies, then activate this chat. Toolchain preparation
   stops the shared Workspace connection; reactivate afterward. Inspection never
   downloads. The verified native platform is currently macOS arm64 only.
   Download failures report `TOOLCHAIN_DOWNLOAD_TIMEOUT`,
   `TOOLCHAIN_DOWNLOAD_NETWORK`, or `TOOLCHAIN_DOWNLOAD` for an HTTP/bounds
   failure. Each artifact download has a bounded fifteen-minute total deadline,
   including its response body; validation keeps its separate execution limits.
   The plugin returns a retained preparation status after admission; inspect
   progress with backoff. Do not repeat RUNNING/UNKNOWN requests or treat their
   receipts as readiness. A terminal FAILED operation can be followed by an
   explicitly authorized new request after diagnosis. Only complete hash-verified downloads are reused; partial downloads
   cannot make the toolchain ready. No business collection or Run is dispatched
   by preparation.
2. Read both owners' `standard.inspect` through `evopilot_v01_native`.
   `native_project.prepare` inventories an exact source snapshot and accepts an
   independent requirement set. Reverse mode requires a clean exact Git HEAD;
   forward mode uses a dedicated requirements directory. The returned review
   binds scope, variants, sources, modules and standards. `freeze` records only
   the human review that actually occurred.
3. Author native packages from those sources. Ontology requires Turtle models,
   instances, SHACL shapes and positive/negative cases. Harness requires Rego,
   configuration, rule catalog, cases and explicit missing-input behavior. Both
   include precise source mappings and observed/inferred status.
   For each requirement, mappings must cover exactly its reviewed `sourceIds`.
   A source file copied into the package without a mapping does not count.
   `PROJECT_SOURCE_COVERAGE` identifies a gap between the frozen source set and
   the mapped sources. Repair the grounded target/fragment/rationale links in a
   new candidate, validate again, and obtain an exact domain review; do not
   narrow the source set or reuse the previous candidate's decision.
4. `native_project.materialize` writes the package into an isolated candidate
   project; `check-layout` compares the exact bytes, directory, scope and cases.
   `candidate-location` returns its path. Existing current assets remain intact.
   README local links must resolve to files or directories within that candidate;
   broken links, escaping paths and symlinks return `PROJECT_NAVIGATION` and
   prevent the directory check from passing. Inline and reference-style links
   are checked; fenced/indented code and inline code examples are excluded.
   HTTP, HTTPS and mail links are not fetched, so this check does not certify
   remote availability or Markdown heading anchors.
   Put, validate, review, decide and publish each package through its owner:
   `native.package.put/validate/review/decide/publish`. Read immutable publication
   with `native.package.readback`. A test fixture decision is never business evidence.
5. Runtime `project.prepare` binds the frozen source/requirements and owner
   standard pins. `native_project.prepare-execution` creates an isolated copy
   from that source; the currently installed binding is `toolchainId: node`.
   Prepare an exact collection recipe through Runtime `collection.prepare`.
   Review its executable, arguments, environment, allowed outputs, selectors,
   timeout and network policy before `collection.decide` and `collection.execute`.
   The supported local sandbox restricts writes and network, not ordinary host
   read access. Subprocess executables must also be in the pinned tool closure.
   It is not a confidentiality sandbox for untrusted software.
6. Raw outputs and selectors form the protected observations. Runtime
   `run.prepare` binds the project candidate, published owner references,
   effective parameters and collection receipts. Decide the exact Run and call
   `run.dispatch` once. Both owner reports are reread and compared by scope,
   claim, inputs, toolchain and package digest. A separate successful process
   exit cannot override a failed owner validation.
7. `native_project.review-domain` binds the actual reviewed Runtime candidate,
   package digests, source bindings and every inferred mapping. `project.validate`
   must cover the complete fixed union of owner, project and domain criteria.
   `project.complete` requires the actual final decision and eligible exact review.
   Staging is not current-delivery cutover or a production claim.
8. `native_project.promote` reads protected Runtime completion and verifies the
   exact candidate, packages, domain review and fixed criteria. It stages a copy,
   preserves the complete old project under its version history, and switches the
   editable current projection. Both staging and directory moves have retained
   journals; retries recover only matching bytes and refuse unknown changes.
   Existing campaign records and unmanaged user files are preserved. The previous
   complete tree remains readable after promotion; this is not a software release.

Owner writes use explicit `requestId` and current `expectedRevision`. Native
project operations use immutable candidate IDs and content-bound records; no
request can register an executor or replace trusted providers. Public visibility
does not authorize upload. Required native package manifest files are sorted by
path (`localeCompare` with `en`), with no duplicate or case-colliding path.

After timeout or disconnect, inspect the exact retained collection/Run/owner
receipt and reconcile. Do not redispatch or choose another request ID to conceal
an uncertain outcome. Source or candidate drift requires review again. Historical
records remain readable under their original semantics. For a new revision,
create a separate candidate and explain changed assets or justified reuse.

The bounded current collector allows no network by default. Declared network
access supports explicit loopback ports; arbitrary remote endpoints are not
supported. No WorkBuddy, background asset synchronization, automatic Warning
patch release, database/deployment access or second-project onboarding is implied.

A corrected interpretation of the same frozen source is a new immutable modeling
candidate ID. Equivalent source/requirement scopes may coexist. Exact asset
checks select the matching package digests; they never reuse a different draft’s
domain decision. Duplicate matching asset candidates are ambiguous and must be
resolved explicitly. Old candidate files and receipts remain unchanged.

Verified frozen candidates under a retired project standard remain historical.
Source and requirement resolution selects only candidates under the installed
standard; old records cannot prevent a corrected candidate from being prepared.
Their integrity is still checked, explicit old-candidate operations fail with
`STANDARD_MISMATCH`, and the resolver never falls back to an old standard when
no current candidate exists.

Before a new decision, retain the actual authorization source and bind it using the [decision evidence format](native-decisions.md). Opaque approval labels no longer authorize new native work; historical receipts remain unchanged.
