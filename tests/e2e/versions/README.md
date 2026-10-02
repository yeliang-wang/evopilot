# Semantic convergence: versioned development corpus

For completed 4.8.1 / 6.3.0 / 2.3.0 acceptance, public publication and explicit
exclusions, see [the current release ledger](../../../docs/releases/current-release.md).
The sections below document individual runners and their evidence boundaries;
a source or synthetic runner alone is not the release acceptance verdict.

This reference is for maintainers of the unreleased Runtime **6.3.0** and
Evolution Expert **2.3.0** source work. It is not a release or installation guide.

- [Runtime 6.3.0 case definitions](runtime/6.3.0/case-plan.json)
- [Expert 2.3.0 case definitions](expert/2.3.0/case-plan.json)
- [Fixed validator and local source runner](../../../scripts/validate-semantic-convergence-corpus.mjs)
- [Corpus regression tests](../semantic-convergence-corpus.test.mjs)
- [Preserved Expert 2.2.1 / Runtime 6.2.0 secure-input corpus](../expert-host-integration/README.md)

Each product keeps its own five RC journey families, ten machine variants,
current criteria (Runtime: 12; Expert: 11), and all 388 inherited obligation
bindings. A shared journey does not permit one product's result to close the
other product's assertions. Each inherited item retains its exact approved
Target pointer, full-definition digest, and lineage digest. Private historical
evidence paths remain in the external Target, not in this repository.

## Local validation

The following commands use an explicit, read-only copy of the independently
approved successor Target revision 2. Substitute its actual local path. The
validator rejects a different Target, changed bytes, omitted variants, changed
Host requirements, inherited PASS, or additional executable commands.

```bash
node scripts/validate-semantic-convergence-corpus.mjs --product runtime --target /absolute/path/runtime-target.json
node scripts/validate-semantic-convergence-corpus.mjs --product expert --target /absolute/path/expert-target.json
node --test tests/e2e/semantic-convergence-corpus.test.mjs
```

The first two commands additionally verify the exact external Target bytes.
The repository test verifies only the pinned case definitions and refusal
controls; it does not read private external Targets.

After local source builds of server, CLI, MCP, OpenCode adapter and Expert are
available, append `--run-local` to either validator command to run that product's
fixed supporting source suites. These suites include localhost HTTP, CLI and
stdio MCP integration with synthetic scope and input, not installed-artifact or
real-Host E2E. The runner never accepts commands from a manifest, builds release
artifacts, contacts a paid provider, or modifies corpus/Target status.

## Executable read-only probes (partial RC support)

### Resumable subjourney batch (maintainer API)

The [installed batch runner](run-installed-batch.mjs) connects the existing
Runtime discovery/capability/refusal/binding/transition/execution/recovery
entries and Expert declaration/binding/execution/recovery entries in a frozen
serial order. It is source-development acceptance tooling, not an installer,
Candidate builder, complete RC implementation or Release operation. The owning
case definitions still say `installedRunner: NOT_IMPLEMENTED` for complete
journeys: this batch mechanism does not fill missing scenario or inherited
assertions, real Host qualification, active soak or terminal series E2E.

`preflightInstalledBatch({planBytes, expectedPlanDigest, materials})` verifies
the exact plan bytes, pinned corpus definitions, declared products/versions,
case/variant identities, complete supplied context/input coverage and each
installation inventory. The plan schema is
`evopilot-installed-subjourney-batch/v1` with exact fields:

- `id`, `products` (`product`, `version`, `targetDigest`, `artifactSetDigest`),
  `acceptanceBindingDigest`, `host` (`id`, `version`, `qualificationDigest`),
  and ordered `steps`;
- each step has `id`, `product`, `caseId`, `variantId`, a fixed `runner` id,
  `contextDigest` and `inputDigest` (SHA-256 of exact supplied bytes);
- each material has only `id`, `contextBytes` and `inputBytes`. The context
  additionally binds the parsed input via the existing `probeDigest` contract.

No shell command, executable path, dynamic module, credentials or pass/fail
override is accepted in the plan. Limit: 1 MiB plan, 2 products, 2048 steps,
8 MiB context and 4 MiB input per step; each underlying runner may impose a
smaller input limit and validates its own scenario semantics before operation.
Mechanical preflight does **not** certify complete scenario coverage, current
external Target state, artifact provenance, Host qualification or effect authority.

`runInstalledBatch` takes those inputs plus `journalFile`, `authorizeCampaign`,
`authorizeInvocation`, `persistEvidence`, `verifyEvidence`, optional `signal`,
and `timeoutMs` (default 120000, maximum 3600000). Expert SDK steps also require
`invokeMcp`. This is programmatic only; there is no flag that grants approval.
Before any real use, an independently reviewed campaign must supply:

- `authorizeCampaign(frame, {signal})`: recheck the current approved Target,
  exact Candidate handoff and independently materialized artifacts, Host,
  acceptance binding, controlled decisions and replay/previous-effect ledger.
  Return exactly `true` only for that precise step. A self-declared digest or
  Host label is not evidence. For the approved Runtime 6.3.0 / Expert 2.3.0
  campaign, the exact Host id must be `Codex` and each selected case and variant
  must retain that same Host scope. Other Hosts, generic labels and lookalikes
  are rejected before process execution. Exact version and qualification still
  require independent campaign verification; a `Codex` label alone grants nothing.
- `authorizeInvocation(frame, {signal})`: enforce each underlying effect frame;
  it is nested as `invocation` beneath the batch plan/product/Host/step binding.
- `persistEvidence(frame, {signal})`: durably save the exact `report` under its
  canonical `reportDigest`, with the plan and step binding, before returning
  exactly `true`. Raw reports stay in the external evidence store, not the
  compact journal.
- `verifyEvidence(frame, {signal})`: independently load and verify the report,
  digest, status and binding. It must return exactly `true` before a new step
  becomes completed and before a completed step is reused on resume.

Never use blanket-true callbacks outside disposable synthetic tests. All
callbacks, including MCP relay, must honor cancellation; this is cooperative
deadline handling, not OS-level preemption of arbitrary callback code.

The private external journal uses an exclusive `.lock`, ordered hash-linked
records and fsync. It checks original file identity and complete prior bytes
before appending. A `STARTED` record is durable before invocation; evidence is
persisted and checked before `COMPLETED`. Completed steps are skipped only after
fresh installation checks and independent evidence verification. A pending
decision, unknown outcome, failed assertion or evidence-write failure stops
the batch. A leftover `STARTED` or `STOPPED` never authorizes replay; a crash-left
lock, damaged journal or missing evidence requires external reconciliation.
The runner does not remove a stale lock, truncate a journal, infer mutation
failure, rebuild a Candidate or decide that retrying is safe. Hash links do not
authenticate hostile writers or prove that a deleted journal never existed;
the independent campaign ledger remains necessary.

`SUBJOURNEYS_COMPLETED_NOT_ACCEPTED` means only the listed fragments ran or were
verified for reuse. It always closes zero Target criteria and leaves full RC,
installed-artifact/real-Host acceptance and Release unapproved. Tests use toy
executables and synthetic MCP responses, not production packages:

```bash
node --test tests/e2e/installed-batch.test.mjs
```

### Individual probe entry

The [installed probe entry](run-installed-probe.mjs) runs fixed public CLI
assertions for [Runtime discovery](runtime/6.3.0/discovery-probe.mjs) and
[Expert declarations](expert/2.3.0/declaration-probe.mjs). Runtime checks a
preselected compatible pair through capability negotiation, discovery,
compatibility, onboarding, gap and repeated discovery. Expert checks its Core,
all five declared adapters, default / explicit 6.3.0 and explicit 6.2.0
compatibility, and unsupported-version/Host refusals. Its 164 child-process
observations include empty/whitespace, partial, junk-suffix, leading-zero and
prerelease versions for both commands on every adapter. Stable unsupported
versions must return `INCOMPATIBLE`; malformed versions and unknown Hosts must
produce their specific allowlisted diagnostic codes, not arbitrary crashes.
Observed missing-Host-capability checks are still outside this declaration-only
probe and remain required for acceptance. Inspecting the WorkBuddy declaration
does not operate or observe WorkBuddy.

After separately authorized artifact materialization and campaign preflight,
the external campaign supplies an exact context and input:

```bash
node tests/e2e/versions/run-installed-probe.mjs --context /absolute/context.json --context-digest sha256:<exact-context-bytes> --input /absolute/input.json
```

This is an invocation template, not authorization to create or install a build.
The context schema is `evopilot-installed-readonly-probe-context/v1`; it binds
`product`, `version`, `installationRoot`, the complete `files` array of
`{path,digest}`, `artifactSetDigest`, `acceptanceBindingDigest` and
`probeInputDigest`. The latter uses the exported `probeDigest` over parsed input;
the context digest is SHA-256 over exact file bytes. Runtime additionally binds
an explicit `server` origin, private `configFile` and its exact `configDigest`.
Never place credentials in either context or input. Runtime input is
`{selection:{projectId,catalogId,artifactSetDigest,bundleDigest},scope:{tenantId,workspaceId,projectId}}`;
Expert input is `{}`.

The [transport](installed-transport.mjs) accepts only fixed read-only commands,
checks all installation files before and after each process, requires a fresh
external layout rather than a source checkout, and rejects symlinks (including
bin links), extra files, changed bytes, command injection and ambient preload
hooks. Installation materialization must therefore supply a no-bin-links layout.
Its inventory limit is 32768 entries, depth 32, 32 MiB per file and 512 MiB total;
each process is bounded to 10 seconds and 1 MiB output. Transport/cancellation
failures cannot count as expected negative product results. Context digest checks
prove input consistency, not authorization or artifact provenance: the campaign
must independently verify the exact artifacts and every dependency first.

Successful output is `PROBE_ASSERTIONS_PASSED`, not RC acceptance. It stores
command/response hashes rather than response bodies, closes zero Target criteria,
and explicitly leaves installed provenance, real Host qualification and formal
acceptance to the independent campaign. Local validation:

```bash
node --test tests/e2e/versioned-readonly-probes.test.mjs tests/e2e/installed-probe-transport.test.mjs tests/functional/project-semantic-transports.test.mjs
```

The transport tests use tiny toy files; the public-contract tests use built
source CLI against a synthetic local Runtime. Neither is a Candidate install.

## RC01 Runtime binding subjourney

The [binding subjourney](runtime/6.3.0/binding-journey.mjs) adds fixed public CLI
steps for maintainers preparing the RC01 campaign. `runRuntimeBindingJourney`
takes the same explicit `selection` and `scope` as discovery, plus an externally
supplied `invoke(args, {signal})` transport. Its phases are:

- `prepare` (default): validate discovery and ask Runtime to prepare the exact
  review. Returns `WAITING_EXACT_DECISION` and the governed review, without
  approving a binding. Preparing a review is a persisted Runtime operation,
  not a read-only probe.
- `submit`: requires that exact `review` and a `decision` object containing only
  `reviewDigest`, `decision: "APPROVE"` and the expected `principalId`. Revalidates
  the review before one approval call, then checks binding and onboarding
  readback. The principal comes from Runtime authentication, never an actor flag.
- `readback`: accepts the same exact review/decision expectation but performs
  only binding/onboarding reads. Use this after an unknown approval outcome; never blindly
  repeat `submit` after a lost response, timeout or cancellation.

An invoked review write remains uncertain until its response and exact review
have both passed validation. Loss, cancellation, deadline or invalid evidence
then returns `UNKNOWN_OUTCOME`, `uncertainOperation: "review"` and
`reconcile-review-only-no-submission-replay`. This applies to preparation and
the refreshed review during submit. It does not return an unverified review or
infer its digest from an earlier decision. Reconcile the authoritative review
state outside this runner; do not retry preparation or treat approval readback
as proof that the review write succeeded. A fully validated but changed review
still fails with `RC01_REVIEW_DRIFT` before approval.

The decision object is an expected-value input, **not campaign authorization**.
The caller must independently authorize and bind any real installed campaign,
including its transport, scope and controlled decisions. The existing
`run-installed-probe.mjs` entry deliberately cannot execute these persisted
review/approval operations.

The separate [programmatic installed binding bridge](run-installed-binding.mjs)
connects this subjourney to the pinned CLI transport. It accepts `contextBytes`,
`expectedContextDigest`, `inputBytes`, `authorizeInvocation` and optional `signal`.
Its context schema is `evopilot-installed-runtime-binding-context/v1`, with the
same inventory/configuration fields as Runtime's read-only context. Parsed input
contains `phase`, `selection`, `scope`, and (for submit/readback) `review` and
`decision`; `probeInputDigest` binds this entire input. Input is limited to 64 KiB.

Before each command the external `authorizeInvocation(frame, {signal})` must
verify the independently approved campaign and return exactly `true`. Its frame
contains `contextDigest`, `acceptanceBindingDigest`, `commandDigest`, copied
`args` and one effect: `READ`, `PREPARE_REVIEW` or `APPROVE_PROJECT_BINDING`.
Do not provide a blanket-true callback outside a disposable synthetic test.
The bridge does not verify approval provenance itself: callback presence,
context digests and expected decisions cannot grant authority. There is no
standalone CLI entry that implicitly approves a campaign. Mutating frame arguments
cannot change dispatched bytes; inventory, private configuration and cancellation
are checked again after the authorization await. Unrelated mutations remain
blocked. Local bridge tests use toy executables, not installed product packages.

Success is `BINDING_SUBJOURNEY_ASSERTIONS_PASSED`, never full RC01 acceptance.
The runner checks review/decision/binding digests, pins, principal, scope,
non-execution status and stable readback. It retains validated CLI request IDs
separately from governed record content and uses a 30-second default overall
deadline (maximum 120 seconds). The functional test exercises actual source
CLI/Runtime and independent MCP readback, lost-response recovery, cancellation,
review drift and forged records. It does not activate a binding, create a Goal,
publish assets, run a model, install a package or operate a real Host. RC01's
inherited setup/security variants and independent Expert/Harness assertions
remain required.

The [independent Expert presentation assertions](expert/2.3.0/binding-assertions.mjs)
compare actual Expert explanations with separately supplied Runtime MCP replies
for onboarding, review, approval and binding readback. They import neither product
implementation, perform no calls, and reject invented completion/execution
authority, changed review/binding digests and scope mismatch. Source integration
tests feed actual Core-to-MCP results; this is not installed Expert SDK or real
Host qualification. Harness supply assertions remain owned by its repository.

The programmatic [installed Expert SDK connection](run-installed-expert-binding.mjs)
accepts exact context bytes/digest, input bytes, an externally verified `invokeMcp`
transport and `authorizeInvocation` callback. Its distinct context schema is
`evopilot-installed-expert-sdk-context/v1`, with the same Expert identity fields
as the read-only context. The complete tree must include `dist/index.js` and all
dependencies. Input is `{operation,selection,scope}`, with operation `onboarding`,
`review`, `approve` or `binding`; `approve` additionally requires
`decision:{authorizationDigest,evidenceRef}`. Selection and scope use the Runtime
binding subjourney fields. `probeInputDigest` binds the complete parsed input.

The parent independently validates the normal capability response before
relaying any business operation: exact MCP envelope, request identity, current
project, Runtime authority, distinct known operation names, requested operation
availability and denied execution/completion authority. An empty or forged
capability reply is not accepted even if the SDK would continue. This normal
path is separate from the intentionally missing-capability refusal probe.
The operation still requires its own campaign authorization after that check.

`PREPARE_REVIEW` and `PREPARE_TRANSITION_REVIEW` persist review records and are
write effects, just like their corresponding approval effects. Once any such
request is sent, a lost response, timeout, cancellation, inventory drift or
unverifiable reply returns `UNKNOWN_OUTCOME` with
`READBACK_ONLY_NO_SUBMISSION_REPLAY`. A denial before sending the request remains
a refusal, not an unknown write. These are runner safety checks on synthetic
fixtures; they do not establish installed-artifact or real Host acceptance.

A fixed worker loads that installed SDK directly, with clean environment and no
Node preload options, and relays only the expected capabilities call followed by
the exact requested semantic call. It never uses a CLI fallback. Every call
requires independent authorization, and installation bytes are rechecked after
awaits. The final Expert explanation is compared with the actual relayed MCP
reply, not an SDK-substituted reply. Context hashes and an authorization callback
are not independent proof of campaign provenance. The worker isolates module
state and timeouts, not malicious code; use only independently trusted artifacts.

Default deadline is 30 seconds (maximum 120), input 64 KiB, each message and total
stdout/stderr 1 MiB. Cancellation or failure after approval dispatch returns
`UNKNOWN_OUTCOME` and `READBACK_ONLY_NO_SUBMISSION_REPLAY`. Success is only
`EXPERT_SDK_BINDING_ASSERTIONS_PASSED`, with zero formal criteria closed. Tests
exercise a toy installation and a separate actual source SDK-to-MCP worker; they
do not install a product or qualify Codex, WorkBuddy, or another real Host.

## RC02 transition execution and independent Expert assertions

The source integration suite
[`project-semantic-transports.test.mjs`](../../functional/project-semantic-transports.test.mjs)
also exercises onboarding before any transition. A checked-in
[synthetic Catalog fixture](../../fixtures/semantic-onboarding-catalogs.json)
contains six independently prepared branches: one compatible pair, no compatible
match, undeclared requirements, two compatible choices, one compatible choice
mixed with undeclared requirements, and incompatible/undeclared choices.
Each branch runs through the actual source CLI/Runtime and Expert SDK/stdio MCP
as both viewer and operator. Assertions pin candidate identities, compatibility
reasons, response digests and read-only HTTP operations; Catalog bytes, project
state and audit are unchanged, and no semantic binding store is created.

Additional source cases preserve an already reviewed binding despite ambiguous
choices or another requested Catalog, and check that incompatible/undeclared
gaps only identify review destinations without selecting a successor. Disabled
Catalogs and missing publication pointers must return a named `UNAVAILABLE`
refusal, never fabricated `NO_PUBLISHED_CANDIDATE` guidance or legacy fallback.
The pure empty-candidate presentation test is not evidence of a successfully
read empty published Catalog. These fixtures contain synthetic publication
metadata only; their preparation neither publishes assets nor qualifies an
installed package, real Host, complete RC02 or final acceptance.

The [transition journey](runtime/6.3.0/transition-journey.mjs) supports explicit
`ACTIVATE`, `MIGRATE` and `ROLLBACK`, each split into `prepare`, `submit` and
`readback`. Callers pin `scope`, the full `initial` binding record, `targetReview`
and `transition:{action,expectedHeadDigest,destinationDigest}`. Submit/readback
also require the exact prepared `review` and
`decision:{transitionReviewDigest,decision:"APPROVE",principalId}`. Prepare does
not submit approval. Submit refreshes the current head and reviewed frame first.
Readback only reads activation history and never retries approval.

Its independent history assertion recomputes record digests, ordered predecessor
links, scope, principal, changed-field sets and retained rollback destinations.
Historical receipt recovery reports `receiptPosition:"HISTORICAL"` separately
from `CURRENT_HEAD`; an old committed transition is not the current selection.
Loss, cancellation or failure after approval submission reports `UNKNOWN_OUTCOME`, not a
safe-to-retry write. An invoked `transitionReview` whose response cannot be
validated reports `UNKNOWN_OUTCOME`, `uncertainOperation: "transitionReview"`
and `reconcile-review-only-no-submission-replay`, without a claimed review digest.
It requires authoritative review reconciliation, not approval replay or an
assumed completed transition. A valid refreshed review that differs from the
exact decision still fails with `RC02_REVIEW_DRIFT` before approval.
The default overall deadline is 30 seconds, maximum 120;
CLI response limit is 1 MiB. This tests future-default transitions, not the
immutability of a real existing execution, and cannot close full RC02.

The programmatic [installed transition connection](run-installed-transition.mjs)
requires distinct `evopilot-installed-runtime-transition-context/v1` context
bytes and the Runtime configuration/inventory fields described above. Its input
is the journey input without functions, signal or timeout, including explicit
`phase`. Input size is 64 KiB. `authorizeInvocation` separately gates each fixed
activation/read/review/approval call. The older binding/read-only context does
not gain permission to execute transitions.

The installed Expert SDK connection also accepts `activation`, `transitionReview`
and `transitionApprove`. For these operations input has `operation,scope,initial`
instead of selection. Review and approval additionally require
`beforeState,targetReview,transition`; approval adds `review,decision`, with the
same SDK `authorizationDigest,evidenceRef` decision shape. An independently
pinned initial binding and history frame drive the
[Expert transition oracle](expert/2.3.0/transition-assertions.mjs). It checks
displayed head, count, receipt digests and future-only semantics; no displayed
receipt grants execution or release authority. Tests use actual source
CLI/Runtime/MCP plus toy installed transports, not final artifacts or real Hosts.

## Independent source consumer handoff support

[Source consumer worker](runtime/6.3.0/source-consumer-worker.mjs) is a test-only
separate-process entry for an external producer/consumer campaign. It imports
only Runtime's built source validators: the actual old v3 Catalog reader and
the fixed composed semantic material/legacy validator. It is not a public CLI,
HTTP endpoint, installed-package adapter or qualified Agent Host. Prepare the
existing server dist through the approved source-check workflow before use.

The worker accepts one JSON object on stdin: either
`{mode:"legacy",catalogRoot}` or
`{mode:"semantic",registryConfigPath,policyPath,catalogId,subject}`. Paths are
absolute and supplied by the trusted synthetic campaign; `subject` is its
synthetic current `{scope,role,active}` subject, not authentication for a real
user. No injected validator, write mode or extra field is accepted. The parent
must bound input, output and child lifetime; repository tests use 15 seconds
and a 1 MiB output limit. Failures emit finite codes without source error text.

Semantic evidence includes exact Registry/policy hashes, pointer, generation,
receipt, material document hashes and legacy Catalog membership. A valid read
retains `eligibleForExecution: false`; it never creates a project or an
execution binding. The cross-repository coordinator lives outside both product
repositories. Harness receives only its independent evidence, not ownership of
Runtime operations. Local tests are in
[source worker tests](../../unit/semantic-source-consumer-worker.test.mjs).
Source-process success cannot satisfy fresh-install or real-Host acceptance.

## RC03 named refusal and compatibility-stop subcases

Acceptance-runner maintainers can use the read-only
[Runtime refusal probe](runtime/6.3.0/refusal-probe.mjs) with an independently
prepared negative Catalog condition. Input is `selection,scope,expected` plus
the injected `invoke` function and optional `signal,timeoutMs`. Selection and
scope use the exact shapes of the discovery probe. Expected is either
`{kind:"CATALOG_REFUSAL",code}` or
`{kind:"COMPATIBILITY_STOP",status,reasons}`. Codes are the closed deterministic
allowlist in the module; compatibility status is `INCOMPATIBLE` or
`INDETERMINATE`, with the exact preselected sorted reason set. Do not derive the
expectation from the response being tested.

The probe reads `inspect` or `compatibility` twice. Refusals require the exact
named code, request id, next action and validated HTTP usage-metadata shape.
Compatibility stops additionally require the selected pair, scope, stable pins,
recomputed report/inspection digests and no execution/binding authority.
Empty output, crash, generic IO failure, timeout, cancellation, the wrong
refusal and ordinary nonzero exit cannot pass. CLI JSON errors are decoded from
stderr; HTTP status is not invented because this CLI error format omits it.
Response metadata is server metadata, not a measurement of this probe's model
usage. Output retains only response hashes, not raw metadata or paths.

The programmatic [installed refusal connection](run-installed-refusal.mjs)
accepts context bytes/digest, input bytes, signal and timeout. It uses the
existing read-only Runtime installation context, verifies input identity and
inventory, and narrows calls to `inspect` and `compatibility`. Context/input
limits are 8 MiB/64 KiB; response limit is 1 MiB; overall timeout is 30 seconds by
default and at most 120. It neither prepares faults nor repairs a Catalog.
The campaign must independently bind fixture preparation, accepted installation
bytes and complete case coverage. A caller-supplied expected code proves none
of those prerequisites.

The installed Expert SDK connection also accepts `inspect` and `compatibility`
with input `operation,selection,scope,expected`. The
[independent Expert refusal oracle](expert/2.3.0/refusal-assertions.mjs) compares
the actual MCP envelope's code, HTTP status and request id with the SDK's
blocking explanation, or validates the exact incompatible/indeterminate
report. The connection permits only the capability read followed by the exact
requested read; it cannot create a review, select alternatives or retry a
mutation. Both calls retain independent campaign authorization callbacks.

Source tests cover positive discovery before eight isolated Catalog faults,
actual CLI and SDK/MCP refusal readback, and undeclared compatibility remaining
indeterminate. Toy installed tests cover transport/identity/refusal controls;
they are not product installations. `REFUSAL_SUBCASE_ASSERTIONS_PASSED` and
`EXPERT_SDK_REFUSAL_ASSERTIONS_PASSED` close zero formal criteria. Full RC03
inherited field/Host/security/native-input coverage is still pending; these
subcases do not certify the complete matrix or a real Host.

## RC03 missing-capability stop subcases

The [capability-stop probe](runtime/6.3.0/capability-probe.mjs) verifies a
different refusal boundary: a valid Runtime capability response omits the
explicitly requested operation. Input is `operation,selection,scope,expected`,
where `expected` is `{kind:"CAPABILITY_MISSING",capabilityDigest}`. The digest
must bind independently prepared capability data, without the CLI request id.
The oracle also checks the exact schema, project, authority, non-execution
flags, known unique operations and actual absence of the requested operation;
a matching digest alone cannot prove that absence.

The Runtime probe allows only `inspect`, `compatibility`, `onboarding` and
`gap`. It reads capabilities, invokes the requested read, requires the exact
named `SEMANTIC_CAPABILITY_REQUIRED` JSON error, then reads the same capability
data again. It never invokes review/approval, even as a negative test. The
[installed capability connection](run-installed-capability.mjs) takes the same
context/input-byte arguments as the installed refusal connection and preserves
its read-only installation identity, size, response and timeout bounds.
CLI observations alone do not prove absence of server dispatch: the campaign
must independently inspect the authorized transport trace.

For the installed Expert SDK connection, `expected.kind:"CAPABILITY_MISSING"`
enables the same input shape for `inspect`, `compatibility`, `onboarding`, `gap`
or `review`. Only one MCP capability read is permitted and separately authorized.
Its actual successful envelope and capability data must match the independent
oracle; only then may the SDK's exact named capability refusal satisfy the
subcase. The fixed worker forwards a closed error code, not arbitrary error
text or a stack. An error before the capability read, a generic failure, a
normal result, an extra MCP call or a timeout cannot pass. A review request in
this mode must stop before preparing any review.

Success reports `CAPABILITY_STOP_SUBCASE_ASSERTIONS_PASSED` for Runtime or
`EXPERT_SDK_CAPABILITY_STOP_ASSERTIONS_PASSED` for Expert; formal criteria stay
unclosed. Source tests run actual CLI/SDK/MCP against a controlled incomplete
Runtime advertisement and check that every HTTP request is a capability GET.
This is not an actual older Runtime installation or a qualified Host. Toy
installed tests verify the bridge and negative controls, not accepted package
provenance. The full inherited Host/CLI/security matrix remains required.

## RC04 reviewed execution tail and installation connections

The transport-neutral [execution journey](runtime/6.3.0/execution-journey.mjs)
accepts a frozen `frame`, exact `decision`, externally authorized `invoke` and
`authorize` callbacks, and optional `signal,timeoutMs`. The campaign must first
prepare, bind, resolve and review the execution through governed transports.
The frame pins scope, identity, run, source request, binding, slice and review;
its independent expectations include principal, Lifecycle binding, original
criteria/coverage, full published obligations and per-rule business/Harness
statuses. Never derive expected statuses from the returned outcome itself.
Harness, Lifecycle and semantic execution binding digests are distinct.

The fixed sequence refreshes the slice and review, approves only the exact
review, dispatches once, collects evidence and evaluates. Each operation requires
`authorize({operation,payload},{signal})` to return exactly `true`; the callback
must verify real campaign authority outside disposable synthetic tests. The
transport returns `{requestId,data}`. A supplied decision, callback or digest
does not prove approval provenance or grant dispatch authority.

Independent assertions verify record hashes and cross-record correlations,
criteria/rule coverage, separate business and Harness results, collector trust,
process observation references and non-completion/non-release flags. Agent
`SUCCEEDED` cannot stand in for either acceptance result. A valid negative
scenario may pass the runner's assertions while the product outcome is `FAILED`.
The runner never commits a stage, advances Lifecycle or completes a Goal.

Default overall deadline is 30 seconds, maximum 120; each JSON frame or response
is limited to 4 MiB. Cancellation, transport errors and assertion failures after
a persisted operation return `UNVERIFIED_OUTCOME` with the last attempted
operation and require external read-only reconciliation. No mutation is retried.
Reports retain request IDs and hashes, not raw business records.

[Source integration and tamper tests](../../functional/semantic-completion-http.test.mjs)
use actual Expert SDK/MCP/HTTP plus CLI mapping readback. They cover dual success,
business failure, Harness failure, correlation forgeries, authority escalation,
lost/hung dispatch and guarded subsequent completion. All collector/process
provenance is synthetic, including branches labeled independent/native.
Success is `EXECUTION_SUBJOURNEY_ASSERTIONS_PASSED`, closes zero formal criteria,
and does not qualify installed bytes, real Hosts, full RC04 or RC05. Actual
source CLI tests also cover all six operations, dual-result failures and a
response lost after dispatch has occurred, with no second dispatch.

The separate [Expert execution presentation oracle](expert/2.3.0/execution-assertions.mjs)
compares resolve/review/approval/dispatch/collection/evaluation explanations with
the actual MCP response and request ID. It independently rejects substituted
business/Harness results, lost collector-trust qualifiers and invented execution,
completion or release permission. It does not reuse Runtime's verdict as Expert
acceptance and closes zero criteria.

The programmatic [Runtime installation connection](run-installed-execution.mjs)
takes `contextBytes,expectedContextDigest,inputBytes,authorizeInvocation` and
optional `signal,timeoutMs`. Its distinct context schema is
`evopilot-installed-runtime-execution-context/v1`, with the Runtime identity and
private configuration fields described above. Input is exactly `{frame,decision}`
and must match `probeInputDigest`. All six payloads are checked before the first
call; each is limited to 64 KiB. The connection invokes only the fixed public CLI
execution operations, with a private temporary input file removed after each
child exits. Installation inventory and configuration are rechecked around
authorization and invocation; no source fallback or installer is exposed.

CLI dispatch has an important identity distinction: its `requestId` is the
Agent execution request ID already present in the data, **not** the HTTP
correlation ID. Other operations receive the HTTP ID from the CLI wrapper. The
report preserves this distinction and explicitly requires independent transport
evidence for dispatch HTTP correlation; it never fabricates that ID.

The separate [Expert SDK installation connection](run-installed-expert-execution.mjs)
uses `evopilot-installed-expert-execution-sdk-context/v1` and the Expert identity
fields above. Input is `{operation,frame}`, plus exact
`decision:{authorizationDigest,evidenceRef}` only for `approveReview`. It executes
one SDK turn, not an automatic chain. An externally supplied `invokeMcp` callback
may receive only the exact scoped capabilities read followed by the requested
operation; `authorizeInvocation` independently authorizes each call. Capabilities,
payloads, inventory, observed replies and presentation are checked independently.
The worker cannot substitute a reply, add a call, or silently fall back to CLI.
Its checks do not replace Runtime's full receipt/outcome oracle.

Both connections require independent campaign verification of artifact
provenance, exact authorization and current transport scope. Context hashes and
callbacks alone establish none of those facts. Default overall timeout is 30
seconds, maximum 120; child responses/output are bounded to 1 MiB. Cancellation
or failure after a persisted operation yields `UNVERIFIED_OUTCOME`, never a
replay. The SDK worker runs trusted verified artifacts, not hostile code in a
security sandbox. A caller-owned MCP transport must honor cancellation and
reconcile uncertain writes through authoritative read-only inspection.

[Installation-connection tests](../installed-execution-transport.test.mjs) use
disposable toy CLI/SDK implementations seeded with synthetic source receipts.
They cover exact operations, identity/configuration drift, denied authorization,
capability mismatch, changed calls/replies, false completion and uncertain
dispatch. Passing these tests does not prove an installed Candidate or real Host.

## RC05 read-only completion recovery (partial source coverage)

The [completion recovery subjourney](runtime/6.3.0/recovery-journey.mjs) is for
campaign authors testing a lost completion response. It accepts an independently
frozen `frame:{scope,identity,runId,targets,completedBy}`, `invoke`, `authorize`,
and optional `signal,timeoutMs`. `targets` is the expected ordered inventory of
`{targetId,required}` from before recovery, not inferred from the returned report.
Only a non-phase Target receipt is supported; phase packages and final Goal
receipts require their own coverage.

It performs exactly `completionReceipt` then `completionStatus`. The transport
returns `{requestId,data}` and each call requires explicit read authorization.
These public APIs use HTTP POST for typed input but do not replay the completion
mutation. Authorization failure, timeout, cancellation, missing evidence,
permission denial or malformed replies stop without retry, fallback or dispatch.
Default timeout is 30 seconds, maximum 120; each input/response is limited to
4 MiB. Caller-owned transports must honor the supplied abort signal.

Independent assertions check record hashes, expected scope/identity/run/principal,
terminal-evidence correlation, receipt-to-report links, the Target inventory,
progress arithmetic, retained blockers and denied release/execution authority.
The separate [Expert recovery oracle](expert/2.3.0/recovery-assertions.mjs) checks
presentation against observed MCP replies. A Target receipt alone must not be
presented as Goal completion; a verified completion report may report that state,
but neither result grants Release authority.

The [source integration tests](../../functional/semantic-completion-http.test.mjs)
lose the actual HTTP completion response after persistence, start a new server
instance and use actual CLI and Expert SDK/MCP readers. They verify unchanged
Goal/Lifecycle records, one executor call, no completion replay, retained pending
Target/phase blockers, rehashed forgeries and current read permission failures.
All process and business evidence remains synthetic. This tests a source-level
server restart, not a real Host restart, process crash or cross-Host qualification.
`READ_ONLY_RECOVERY_ASSERTIONS_PASSED` closes zero formal criteria; it does not
revalidate business truth or current permission to execute again. Complete RC05
growth/revocation/restart/Host variants and active soak remain outstanding.

## Remaining formal qualification

### Runtime recovery installation connection

Campaign authors may connect the RC05 two-read subjourney to a separately
authorized Runtime 6.3.0 installation with
[`runInstalledRecovery`](run-installed-recovery.mjs). It accepts
`contextBytes, expectedContextDigest, inputBytes, authorizeInvocation` and
optional `signal, timeoutMs`; `inputBytes` encodes only `{frame}` as defined above.
The context uses `evopilot-installed-runtime-recovery-context/v1` with the exact
external installation inventory, artifact-set/acceptance/input digests and
private Runtime configuration. An execution or discovery context is rejected.
An inventory proves byte identity only; accepted-artifact provenance and current
campaign authority must be verified independently before real use.

Each of the two reads requires `READ_RECOVERY_EVIDENCE` authorization bound to
the context, acceptance binding, input, project, operation and payload digest.
Installation and configuration are checked before and after authorization and
execution. The runner writes only a private temporary request, invokes the exact
CLI entry with a sanitized environment, then removes its own request file and
empty directory. It accepts no completion/dispatch command and performs no
automatic retry. Timeout, cancellation, permission refusal, malformed output,
stderr, byte drift or failed independent receipt/report assertions stop the run.
The journey timeout is 30 seconds by default (maximum 120); each child is capped
at 10 seconds and 1 MiB of output. Pending children are settled before returning.

Success remains `READ_ONLY_RECOVERY_ASSERTIONS_PASSED`, with zero mutations and
zero formal criteria closed. The
[transport tests](../installed-recovery-transport.test.mjs) use disposable toy
executables and source-generated synthetic receipts, not installed release
artifacts or real Hosts. They cover complete and still-pending Goals, per-read
authorization, timeout/cancel, configuration/inventory drift, context isolation
and rehashed evidence forgeries. The full RC05 runner remains incomplete.

### Expert installation qualification

The [Expert recovery connection](run-installed-expert-recovery.mjs) exposes
`runInstalledExpertRecovery` to campaign authors. Inputs are
`contextBytes, expectedContextDigest, inputBytes, invokeMcp, authorizeInvocation`
and optional `signal, timeoutMs`; `inputBytes` contains the same independent
`{frame}` used by Runtime recovery. Its dedicated context schema is
`evopilot-installed-expert-recovery-sdk-context/v1`, bound to Expert 2.3.0, the
complete external inventory and exact artifact-set/acceptance/input digests.
Execution and ordinary SDK contexts cannot be substituted for this context.

A bounded worker imports only that exact SDK entry. The parent permits exactly
four MCP calls: capabilities, completionReceipt, capabilities, completionStatus.
Every call requires its own campaign authorization and inventory recheck; a
capability reply must identify the current project and requested read operation.
The parent compares each SDK response and explanation with the independently
observed MCP reply, then applies the Runtime receipt/report correlation oracle.
It rejects concurrent, altered or extra calls, response substitution, false
completion/authority claims and invalid readback evidence. No mutation, retry,
CLI fallback or decision replay is available.

The default deadline is 30 seconds, maximum 120. Worker messages and captured
output are bounded to 1 MiB; the worker is terminated when the runner settles.
External authorization and MCP callbacks must honor the abort signal. The
worker is **not a sandbox for untrusted code**: independently verified artifact
provenance and campaign authority remain prerequisites. Inventory hashes alone
do not establish either.

`EXPERT_SDK_RECOVERY_ASSERTIONS_PASSED` means only that these partial recovery
assertions passed. It closes zero formal criteria and never qualifies a Host.
The [SDK transport tests](../installed-expert-recovery-transport.test.mjs) use
toy SDK modules and source-generated synthetic receipts. Actual SDK/MCP source
behavior has separate tests in the completion HTTP suite; neither test class
is an installed release run, cross-Host acceptance or active soak.

The separate [Expert installed-byte verifier](../../../scripts/verify-expert-public-install.mjs)
now checks the complete Expert file inventory, rejects duplicate archive members
and symlink substitution, and checks for changes before and after bounded CLI
probes. It requires independent archive integrity/provenance verification first.
Probes do not inherit Node preload hooks or credentials. Limits are 64 MiB per
archive, 16 MiB per file, 256 MiB total installed files, 4096 files and 4096
directories, depth 32, and a 120-second deadline (10 seconds per archive command;
5 seconds and 1 MiB output per CLI probe). Runtime dependency bytes still require
their own exact-artifact verification. Local synthetic fixtures test the
verifier, not actual installed-artifact E2E or real Host qualification.

The complete installed-version RC runners are **NOT_IMPLEMENTED**; the partial
read-only probes and binding/transition/execution connections do not cover the
full journeys. Every current,
inherited and case status stays **PENDING**; zero formal criteria are closed by
these checks. Coverage pointers are retained requirements, not proof that all
inherited behaviors have already been rerun. Local source tests cover only the
implemented subset. They cannot close dual-bound production execution,
successor/migration/rollback, or final packaging and Host requirements.

Formal acceptance still requires a separate exact Candidate/campaign binding,
fresh installed final artifacts and real published Harness 4.8.1 supply,
independent Host qualification, all criterion/negative/impact assertions,
NO_REGRESSION and a fresh 5400-second active soak. WorkBuddy is operated only by
the designated human with complete runbooks and a final RC-range declaration;
machines neither operate nor observe it.

The terminal `E2E-SERIES-SEMANTIC-CONVERGENCE-4.8.1-6.3.0-2.3.0` remains separately
named and unexecuted after independent product acceptance. Dashboard is not a
dependency. Commit, Candidate formation, publication and Release require their
own authority; this corpus grants none of them.

### Fixed installed Expert project-definition journey

`runInstalledExpertProject` in [the project runner](run-installed-expert-project.mjs)
loads only a verified installed Expert SDK through a fixed worker. It executes
13 exact turns: discovery, fresh-id list check, first registration and readback,
successor registration without automatic selection, impact inspection, explicit
activation and rollback with readback, and retained-version/list checks. Inputs
are two complete canonical minimal declarations and a decision evidence reference;
credential references are empty in this fixture. Secret-bearing fields and
credential URLs are rejected by preflight.

The entry uses the existing `evopilot-installed-expert-sdk-context/v1` binding
and requires independently reviewed `authorizeInvocation` and `invokeMcp`
callbacks. Every call must exactly match its fixed expected tool and payload;
installation bytes are checked around asynchronous authorization and transport.
The worker has no ambient credential or preload environment. Denial, timeout,
extra calls, substituted results and unknown writes stop without replay. The
campaign must persist each invocation and reconcile any incomplete journey
before attempting further mutations. Its `expert-project` batch entry retains
the batch journal's no-replay boundary.

`PROJECT_DEFINITION_JOURNEY_ASSERTIONS_PASSED` verifies declarations only. It
closes no complete RC or Target criterion and does not prove operational project
onboarding, existing execution-binding preservation, process restart, real Host
qualification or Release. Source tests use a deliberately toy SDK and an actual
local source Runtime; that is not an installed Candidate acceptance result.

`run-installed-expert-guidance.mjs` adds the `expert-guidance` batch entry for
exactly eight turns: help, tutorial, three read-only inventory presentations,
and bounded retry, exhausted-budget and uncertain-outcome recovery decisions.
It binds the supplied inventory, session and execution-binding digest before
loading the verified SDK. Each isolated worker call must match an independent
expected MCP request and return the unmodified transport response. Recovery
classification grants no permission to execute the returned next action.

The runner shares the existing verified SDK context and frozen batch journal;
it does not install a package or qualify a Host. Caller-supplied Suite inventory
is not proof of source acquisition. `GOVERNED_GUIDANCE_ASSERTIONS_PASSED` closes
no full RC or Target criterion and does not cover controlled Lifecycle mutation,
real production-reference acquisition, actual retries, or release. Source
verification uses a toy SDK and local Runtime, and preserves uncertainty without
replay. The campaign still owns invocation authorization and evidence persistence.

### Expert Lifecycle state subjourney

`run-installed-expert-lifecycle.mjs` adds the fixed `expert-lifecycle` batch
runner. Its 22 turns cover a fresh fixture's registration, explicit activation,
successor diff and activation, deactivation, archive, restore without automatic
activation, predecessor rollback, and exact mutation audit counts. The fixed
fixture uses versions 1.0.0 and 1.1.0 with `project.read`; it never starts a run.

Input consists of `lifecycleId`, `evidenceRef`, and `decisions`. The latter has
exactly `activateInitial`, `activateSuccessor`, `deactivate`, `archive`, `restore`,
and `rollback`, each containing `authorizationDigest` and `evidenceRef`. The
outer campaign must independently authorize each exact command and decision;
these fields alone grant no authority. The existing complete SDK inventory and
input digest checks apply. An existing fixture id stops before registration.
Unknown write outcomes stop without replay. A verified batch journal can skip
an already completed subjourney only after independent evidence verification.

This adds a partial installed validation path, not complete RC acceptance.
Existing-run retention, process restart, tenant/refusal variants and qualified
real Hosts remain separate obligations. Local tests use source SDK/public MCP
and explicitly synthetic toy installed packages; no Candidate, real Host,
WorkBuddy execution, or formal criterion closure is claimed.

### Original-scheme trace audit

The [trace auditor](../../../scripts/audit-semantic-convergence-trace.mjs)
checks development trace definitions against exact approved Runtime/Expert
Target bytes. It retains complete current and inherited definitions, lineage,
include/exclude clauses, source evidence references, Roadmap bindings and every
journey's starting state, terminal state, Hosts and prohibited effects.
Generated output contains private Target references; keep it outside the
repository and distribution artifacts.

```bash
node scripts/audit-semantic-convergence-trace.mjs --product runtime --target /absolute/path/runtime-target.json --project > /private/tmp/runtime-trace.json
node scripts/audit-semantic-convergence-trace.mjs --product runtime --target /absolute/path/runtime-target.json --trace /private/tmp/runtime-trace.json
node --test tests/e2e/semantic-convergence-trace.test.mjs
```

Use `--product expert` and its separately approved Target for Expert. Projection
exits zero; an incomplete audit exits **2** and reports `INCOMPLETE`, while a
changed binding reports `BLOCKED`. This is a development gap report, not a
release-readiness command. Current drafts expose 400 Runtime and 399 Expert
criterion slots without installed validators, and 388 inherited routes per
product still require reviewed executable assertions. These numbers count
unbound validation slots, not absent product capabilities.

The explicit current retention criterion links inherited ownership only. It
cannot assign every inherited behavior to a catch-all RC. Until individually
reviewed assertion routes are implemented, inherited executable routes remain
empty and invented assignments are refused. A validator declaration must bind
one exact criterion and evidence contract; duplicate IDs, aggregate entrypoints,
empty assertions, extra fields and shell commands are refused. Declarations
still report `VALIDATOR_IMPLEMENTATION_AND_INDEPENDENCE_UNVERIFIED`: no module
is loaded, command executed, or source test promoted to installed evidence.

Historical scheme inventories need their own exact source-byte recovery and
semantic reconciliation. Current files may differ from historical referenced
bytes; never rewrite an old digest to make that check pass. An externally saved
historical trace can preserve old declared links, but it cannot certify their
semantic sufficiency, transfer a historical PASS or close TRACE01–TRACE04.

### Project-definition readback after restart

`runInstalledExpertProjectReadback` and batch runner `expert-project-readback`
provide a separate read-only stage following the declaration journey. With the
same frozen definition inputs and installed Expert SDK inventory, they inspect
the active definition, both exact versions, and the complete project revision
list. The expected active version is the original version selected by the
preceding rollback. Missing revisions, changed content or a different active
version stop the stage; no register, activate or rollback request is made.

The campaign must perform and independently record the Runtime restart and
provide the fresh MCP connection. The readback report does not infer that a
restart happened. Its successful batch checkpoint may be reused only after
normal artifact and evidence verification. Qualification, full RC coverage and
release remain separate. Functional tests restart an actual source Runtime
and use public stdio MCP with a synthetic installed SDK; they do not claim a
Candidate or real Codex acceptance run.

### Isolated compiled-package integration checks

The functional project, Lifecycle and governed-guidance tests also stage the
actual compiled Expert SDK and contracts in fresh directories outside the source
checkout. The SDK worker reaches the source Runtime through public stdio MCP;
the project test restarts that Runtime before checking the original and successor
revisions. The transport suite additionally exercises all six semantic execution
operations with the real SDK against recorded source responses, and the real
compiled Runtime CLI against a live fixture HTTP server. The CLI cases cover
independent business and Harness failures and loss of the dispatch response:
the latter stops without replay or subsequent collection/evaluation.

These helpers copy local compiled bytes and inventory their digests; they do not
build or install a release Candidate. Test decisions, Agent execution, collection
and Host qualification remain synthetic. Recorded MCP responses do not establish
a live MCP journey. Package tampering is rejected before transport, but these
checks close no formal acceptance criterion and establish no real-model or
qualified Codex acceptance. Candidate artifact provenance, real Host execution
and the full Target matrix remain required.
