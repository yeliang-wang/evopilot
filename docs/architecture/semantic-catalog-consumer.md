# Semantic Catalog Reader — Implementation Status

Audience: Runtime maintainers implementing the approved 6.3.0 semantic consumer.
This is source-checkout implementation, not a released API or
completed semantic acceptance. Package versions have not changed. Existing
[published Harness Catalog consumption](published-harness-catalog.md) is unchanged.

## Implemented boundary

The project discovery/review HTTP surface is now reachable through the ten
`project semantic` CLI operations and matching `evopilot_project_semantic_*` MCP
tools. Both use a shared strict request-selection contract and negotiate current
project-scoped Runtime capability; they do not infer support from package version,
select assets, copy Catalogs or fall back to Harness-only execution. Actual
localhost HTTP plus CLI processes and stdio MCP source tests cover review/approval,
cross-entry inspection, current principal/scope, policy revocation, unsupported
Runtime, redirect refusal and uncertain-response readback without automatic replay.
These source tests are not installed-package or real-Host acceptance. Semantic
execution/outcome review and guarded completion use the separate capability and
authority surfaces described below; discovery/transition capability never grants
execution or completion and explicitly marks them unavailable on this surface.

Read-only semantic onboarding now composes current project/binding state with a
single explicitly selected verified Catalog. It never registers or alters a project.
Compatible unbound projects are guided to reviewed dual binding, with exact pair
selection and separate approval even when unique. Existing bindings are revalidated
and preserved without searching another Catalog; failed validation never becomes an
unbound/default state. Ambiguity, missing matches and indeterminate evidence remain
explicit. Candidate comparison is bounded to 64 pairs, includes cancellation and
the read timeout, and never silently truncates. A concurrent initial approval or
project/authority change blocks stale guidance. CLI/MCP and Expert expose this same
Runtime result, without storing local truth or inferring business classification.

`packages/server/src/domains/harness-template/semantic-catalog-reader.ts` reads a
single semantic snapshot selected by catalog id from a **trusted server-owned
Registry binding**. Its binding parameter is not an HTTP request or CLI payload.
Disabled or unconfigured ids are unavailable; duplicate enabled ids fail closed.
The transport itself does not load Registry YAML, scan directories, fetch network resources,
write files, import producer code, publish assets, or execute embedded Skill text.

The reader verifies the pointer, immutable generation and publication receipt
digests, their cross-references, exact wire fields, scoped entry identities,
dependency graph and embedded Skill parent. It reads each unique material file
once, bounds allocation by the declared entry size, and checks the raw file hash.
Material schema/object-digest/ontology correctness is a **separate mandatory
trusted validator**, not something proved by the file hash or `AUTHORIZED` text.

The server must supply all four policy functions: Catalog permission, independent
publication authorization, per-entry permission, and complete material validation.
There is no permissive default. All entries are authorized before the first
material is opened, including entries sharing an embedded Skill's parent file.
Current permissions and publication authority are checked again after material
validation. Signing is not mandatory under this contract.

`semantic-catalog-configuration.ts` now provides the separate server-side
configuration adapter. It loads an explicitly supplied Registry v1/v2 file and
an independently supplied operator-owned
`evopilot-harness-semantic-catalog-policy/v1` JSON file. Both use the existing
4 MiB generation budget and the same operation deadline as material reads.
YAML aliases, duplicate keys, unknown tags, embedded asset lists, invalid ids,
URL roots and ambiguous duplicates are rejected. Relative roots are resolved
against the Registry directory; explicit absolute local roots remain supported.
There is no legacy-directory fallback on this semantic path.

The adapter requires a trusted current-subject resolver with active status, an
existing Runtime role and exact tenant/workspace/project scope. It checks the
policy's Catalog root binding, trust context and visibility. Catalog publication
and separately published assets each require a matching actor, authorization
digest, purpose and subject digest in a current, unexpired, non-revoked grant.
Known ArtifactSet/Closure kinds cannot bypass this check by changing category.
Duplicate conflicting grants fail closed. `PUBLIC` and the admin role do not
override scope checks. Registry bytes, current subject and policy are reread
after material validation; configuration drift or revoked access stops the read.
These files are never written by the consumer or taken from request parameters.

`semantic-material-bindings.ts` independently checks known object-digest
conventions and key snapshot, manifest, Skill, profile, index, projection,
computation and closure references using Runtime code. Its result is explicitly
`MATERIAL_BINDINGS_INSPECTED` with `eligibleForExecution=false`. This intermediate
inspection is **not** complete schema validation, semantic recomputation or proof
of original v3 Catalog/lock membership, and must not be the sole material validator.

`semantic-schema-validation.ts` validates known material documents with Ajv 2020
against 17 checked-in, pinned Harness schema contracts. Source filenames and raw
SHA-256 digests are recorded in `semantic-schemas.ts`. Validation does not load
remote schemas, coerce values, insert defaults, remove properties or execute Skill
instructions. The schema bundle is read-only contract data, not a producer import.

`semantic-derived-materials.ts` adds schema checks (including nested snapshot,
pack set, project projections and Skill), independently reconstructs the Semantic
Index, verifies FULL/INCREMENTAL canonical-state outcomes and proof digests,
recreates all five interoperability format contents, and reconstructs the
round-trip/equivalence report. Rehashing a forged result does not make it valid.
Text definitions and projection contents use raw UTF-8 hashes; structured
documents use canonical JSON hashes. Node/edge/cache and declared computation
budgets are checked without calling a model or external reasoner.

`semantic-project-materials.ts` now independently verifies the fixed Foundation,
exact Pack imports and digests, private-root restrictions, non-executable Pack
content, bounded dependency cycles/depth, producer-defined Pack ordering and
concept merge. It reconstructs the approved-proposal snapshot, all project
projection contents (including SWRL applicability), Skill concept index,
manifest, provenance and dependency lock. Supplied base/prior documents are
schema/digest checked; predecessor project scope cannot change, though its source
snapshot may differ. These checks consume evidence and do not approve, resolve
new authoring decisions, publish or install assets.

`semantic-legacy-membership.ts` separately verifies original v3 membership. It
reads bounded `CATALOG.md` and `catalog.lock.json`, verifies their correspondence,
Catalog digest and unique identities, then checks each exact published entry and
its original asset file against the supplied semantic material. Unrelated Catalog
growth is permitted; a changing Catalog during the read fails with `DRIFT`.
Paths are checked before asset reads; the existing root reader enforces file and
symlink restrictions. Distinct legacy asset bytes also count toward the total
material budget. Duplicate references to one file are read only once.

The trusted validation callback now receives a capability for the same already
authorized root and the same operation deadline's check function. It does not
receive a new timeout or a caller-selected root. The legacy checker must run
inside that callback, before the reader's final permission and head checks. Its
`LEGACY_MEMBERSHIP_INSPECTED` result is not permission or execution eligibility.

`semantic-closure-materials.ts` adds complete-set support-reference checks:
dependency locks must resolve to the bound Pack set, evaluations to the bound
report/computations, and rollback links to the current artifact lifecycle or
supplied predecessor snapshot. Exact Harness identities and Bundle/Profile/
Component references are checked. The terminal closure is reconstructed from
its actual inputs, including inventories, statistics, provenance, publication
version and non-authoritative flags. Closure version remains `4.8.0`; it is not
the producer Engine's package version.

The same inspector reconstructs expected generation entries and set references
in memory: canonical material bytes, metadata, scope, conservative shared
visibility, provenance, embedded Skill parent, dependency edges and ordering.
Extra entries/materials and rehashed metadata forgeries fail closed. This is
read-only verification, not a Catalog generation/publication API.

`semantic-catalog-consumer.ts:readVerifiedSemanticCatalog` now composes the
configured permission-aware reader, all material inspection layers and original
v3 membership checks into one fixed internal entry. Callers cannot replace its
material validator. The shared deadline and final permission/head rechecks still
apply. Successful reads report `CONFIGURED_MATERIALS_VERIFIED`, but always retain
`eligibleForExecution=false`: no project binding or execution decision is made.
The lower-level transport and partial inspectors are not production eligibility
substitutes. A read-only project-scoped HTTP endpoint now uses this fixed entry;
CLI/MCP and execution integration remain unfinished.

`project-semantic-discovery.ts` and `project-semantics.ts` compose it into
`GET /api/v1/projects/{projectId}/semantic-catalogs/{catalogId}`. Startup options
`harnessRegistryConfig` and `semanticCatalogPolicyPath` (environment:
`EVOPILOT_HARNESS_REGISTRY_CONFIG`, `EVOPILOT_SEMANTIC_CATALOG_POLICY_PATH`)
are server-owned. Both are mandatory on this path. Requests accept identities
only: no query parameters, request body, filesystem paths, limits or callbacks.

The semantic bearer resolver refreshes configured/current users, persisted account
status and role/scope on every read boundary. Anonymous debug access is denied;
the caller's actor header cannot select an account. Suspended users, required
password changes and stale static credentials fail closed. The registered project
must match the credential's tenant/workspace, including for platform admins.
Principal, role, project scope/profile/revision are pinned across the read;
revocation, replacement or drift prevents a response. The existing production
setup-only LLM readiness gate remains ahead of this endpoint.

The result is `VERIFIED_DISCOVERY_ONLY`, with an allowlisted digest inventory,
scope and configured limits. `discoveryDigest` binds that evidence; it is not a
`ProjectSemanticBinding`, compatibility decision or approval. Raw materials,
Skill prose, policy grants and local paths are not returned. `bindingCreated`
and `eligibleForExecution` are always false. Responses use `Cache-Control:
no-store`; request disconnect cancels the shared bounded read. Failures carry a
redacted finite code and request id. These discovery routes do not mutate projects
or assets; the separate Runtime binding routes below persist review records only.

### Read-only compatibility inspection

Discovery now lists the exact Harness Bundle id/version/digest references in each
verified semantic set. The separate GET suffix `/compatibility` requires exactly
two query parameters, `artifactSetDigest` and `bundleDigest` (full SHA-256 values).
No implicit first-match selection occurs. Both must resolve in exactly one set;
missing members fail with `UNAVAILABLE` and ambiguous sets with `IDENTITY_CONFLICT`.
The service rereads and validates the complete current Catalog and permissions;
a previously returned discovery digest is not an authorization token.

`semantic-compatibility.ts` evaluates the published Bundle's pinned
`HarnessSemanticRequirements/v1` against explicit facts in the exact project
snapshot. It checks Foundation identity, required concept ids and meta-types,
deprecated concepts, prohibited ids and directed explicit relationships. It
rejects conflicting requirements and tampered digests. A minimal one-concept map
can satisfy an explicitly matching requirement; enterprise-wide completeness
is not imposed. Existing Harness-only execution is unchanged.

The result uses the Runtime-owned `evopilot-project-semantic-compatibility/v1`
schema, not the producer's Source-grounding report. Missing requirements return
`INDETERMINATE`, not an automatic semantic opt-in. Descriptive evidence requirements
are not executable assertions, so they remain unverified even when matching prose
or source-reference names exist. External-reasoner evidence remains unproved.
Known violations return `INCOMPATIBLE`; only fully satisfied supported explicit
requirements return `COMPATIBLE`. This implementation does not derive inferred
relationships or establish broader reasoning/evidence sufficiency.

The report pins ArtifactSet/snapshot/Skill, provenance, Bundle, its Profile and
Component reference closure, requirements and
reasoning-profile digests. Its enclosing inspection also pins project revision
and current Catalog/policy evidence. Neither digest grants approval, eligibility,
binding or execution authority. The separate project review/persistence workflow
below consumes fresh inspection. Internal execution binding/preflight is described
below; production execution integration, CLI/MCP transport and formal E2E remain unfinished.

### Reviewed project binding and future-plan activation

The Runtime-owned service exposes these source-checkout binding routes:

- `POST /api/v1/projects/{projectId}/semantic-binding/reviews`: supply exactly
  `catalogId`, `artifactSetDigest` and `bundleDigest`. Current scoped operators
  or admins may prepare an immutable review only for a `COMPATIBLE` selection.
- `POST /api/v1/projects/{projectId}/semantic-binding/approvals`: supply exactly
  `reviewDigest` and `decision: "APPROVE"`. Runtime repeats material, compatibility,
  current principal and project checks; the exact prepared inspection must still
  match. An arbitrary digest, stale report, actor header, Host response or Codex
  Target approval cannot substitute for this product API decision.
- `GET /api/v1/projects/{projectId}/semantic-binding`: scoped authenticated viewers
  and above may inspect the stored record only after fresh current-material and
  permission verification. Revocation, project revision drift and corruption
  fail closed; historical stored approval is not current permission.

POST bodies require JSON and are limited to 2 KiB. Unknown fields, query parameters,
invalid selectors and incorrect decision values are rejected. Responses are
`no-store`, errors are redacted `SEMANTIC_BINDING_*` codes plus request id; request
validation uses `SEMANTIC_REQUEST_INVALID`. Existing production readiness remains
in force. Preparation does not create a project binding. The approval result
contains the review, server-authenticated decision and
`evopilot-project-semantic-binding/v1` record, with separate canonical digests.
It pins scope/project revision, one ArtifactSet, snapshot, Skill, provenance,
semantic closure, selected Bundle, reasoning profile and compatibility report.

The binding is explicitly `REVIEWED_NOT_ACTIVATED`, with
`eligibleForExecution=false`. It does not change legacy project execution,
establish Harness eligibility, switch new-project defaults, approve a GoalTarget,
or create a `SemanticExecutionBinding`. The separate dual-binding application
consumes the reviewed record but still requires all current execution gates.
The immutable binding's status never changes; activation is a separate receipt.

Records reside in the trusted Runtime data root, separate from published assets.
Complete synced temporary files are linked into immutable hashed slots without
replacement. One slot exists per exact project scope; concurrent identical
approvals converge on its original timestamp and decision. Exact retry requires
the original principal and current permissions. Another review or approver cannot
overwrite the initial slot. Explicit transition APIs append successors instead;
do not delete a record to simulate migration or recovery.

`GET /api/v1/projects/{projectId}/semantic-binding/activation` returns the current
`headDigest`, selected `bindingDigest`, append-only transition history and
`grantsExecutionAuthority=false`. Before the first explicit activation the state
is `REVIEWED_DEFAULT` (retaining the earlier reviewed-binding behavior); afterward
it is `ACTIVE_FOR_FUTURE_PLANS`. A scoped viewer can read but cannot approve.

`POST .../semantic-binding/transition-reviews` accepts exactly `action`,
`expectedHeadDigest` and `destinationDigest`. `ACTIVATE` names the initial binding
digest and is allowed only once. `MIGRATE` names a newly prepared compatible
binding **review digest**, after activation. `ROLLBACK` names a previously used
**binding digest**, not an arbitrary record. The preview binds the exact head,
old binding, destination review, changed pin fields and the future-plan-only
effect. Even an empty semantic diff requires its exact explicit decision.

`POST .../semantic-binding/transition-approvals` accepts exactly
`transitionReviewDigest` and `decision: "APPROVE"`. The current scoped
operator/admin, destination permissions, project revision, material and expected
head are revalidated. Migration requires the exact fresh destination review;
rollback rechecks original selected pins and does not restore revoked authority.
The atomic no-replace slot is keyed by scope and predecessor head. It commits
review, destination binding and decision together. Identical concurrent decisions
converge; competing successors fail closed. Same-principal exact retry returns
the original receipt even after another transition, without moving the head back.
The shared audit event is `project-semantic-binding.transition-approved`.

The chain is bounded to 64 transitions; at capacity no further transition is
permitted. No automatic pruning, deletion, reset, retry or claim repair exists.
All transition bodies retain the 2 KiB, JSON-only and no-query rules. CLI/MCP expose
activation, transitionReview and transitionApprove with strict typed fields and
capability negotiation. Expert starts with activation state, asks for unresolved
selection and requires a separate exact transition decision. Lost responses are
reconciled from activation history, never replayed automatically; historical receipts
are not the current head. There is no automatic asset publication and no default
upgrade of Harness-only legacy projects.

New execution plans pin the selected project binding digest. Every later stage
of that run inherits its root plan's pin; migration or rollback cannot silently
retarget it. Existing execution bindings revalidate their original project record
against current permissions and published material, not the latest default.
Project revision or permission drift may therefore still block an old run.
The transition does not migrate in-flight execution, rewrite evidence, authorize
dispatch, complete a Goal or release a product. Initial and historical records
remain immutable. Source fixtures cover restart, concurrent decisions and a
two-stage run spanning a project migration; these are not installed/real-Host
acceptance or a production migration qualification.

Review, decision and binding are committed together. The shared Runtime audit is
at-least-once, correlated by `decisionDigest`; an uncertain response can be retried
exactly. Reads check bounded size, scope key and digest chains and reject symlinks,
hardlinks and malformed records. A crash during the brief hardlink transition may
leave a linked temporary inode: it fails closed and needs state reconciliation,
not blind approval replay or automatic deletion. This is a trusted local store,
not cryptographic protection from an administrator able to rewrite all records;
power-loss durability and hostile-filesystem race coverage remain incomplete.

Registry/policy inspection digests are review evidence, not permanent dependencies
of an approved record. Fresh inspection can accept unrelated Registry growth and
compatible policy metadata changes when selected pins still match and permission
remains valid. Full semantic-generation growth/rollback and active-run behavior
still require the Target's broader matrix.

The incremental change-seed proof
is not present in the supplied fixture, so only the declared evaluated ids and
canonical outcome are verified; external reasoner evidence is bound, not executed
or independently proved. The consumer does not implement general OWL/SWRL
inference. Full security/resource/variant coverage and Target acceptance remain
unfinished; these internal source checks do not establish release readiness.

### Internal execution binding/preflight (not execution permission)

`application/semantic-execution-binding.ts` now creates an immutable
`evopilot-semantic-execution-binding/v1` record in a separate scoped execution slot.
It connects the reviewed project record to an existing governed Harness binding,
checks the published Bundle/Profile/Component closure, and pins GoalTarget,
Lifecycle, resolver descriptor, Runtime LLM profile, Host executor, qualified Agent
Runtime, environment, policy, authority, permission and evidence-contract digests.
The Runtime LLM route and external Agent provider/model are separate identities.
The record contains no raw credentials and does not resolve SecretRefs.

The internal service repeats the fixed semantic Catalog/compatibility inspection,
current scoped permission checks and existing Harness lifecycle boundary checks
at `start`, `resume`, `retry` and `loop-iteration`. Owner state is compared around
asynchronous reads and immediately before persistence or returning a check.
Exact retries preserve the original immutable record; conflicting bindings,
revocation, drift, cross-scope access and inconsistent stored records fail closed.

Its status remains `BOUND_PENDING_EXECUTION_INTEGRATION` and
`eligibleForExecution=false`, including after a `VALIDATED` preflight. The current
owner-state callback is exercised with synthetic local fixtures. Strict adapters
for persisted Runtime project/Goal/Target/LLM, active governed-resource records
and explicitly activated executor observations are implemented below, but
the fixed application and separate public execution transport now compose them. A bounded
explicit-fact context preparer and internal dual-outcome evaluator now use this
binding, as described below. Production outcome governance and completion remain unfinished.
Existing governed Harness checks also retain whole Registry/Catalog digests;
complete unrelated-growth/rollback behavior for active executions is not claimed.

Until this integration exists, governed plan/run and Lifecycle run/mutation HTTP
requests explicitly carrying `semanticExecutionBindingDigest`,
`semanticExecutionBinding`, `semanticContextSlice`, `semanticContext`, `outcomePlan`
or `semanticOutcomePlan` are rejected with
`SEMANTIC_EXECUTION_INTEGRATION_REQUIRED`, including null or empty values. Restored
Lifecycle records containing those unsupported execution fields are also rejected
before advancement. Requests without those fields retain the legacy Harness-only
path; this guard must not be presented as successful semantic execution support.

### Strict Runtime source metadata (internal only)

`application/semantic-runtime-sources.ts` composes a read-only view of existing
Runtime FileStore project, Goal, Target, plan approval and LLM Profile records.
Unlike legacy hydration, it supplies no missing scope, status or approval defaults.
It requires an approved/running Goal, an approved plan with its confirmation,
a ready/running Target with completed dependencies, and an active in-scope LLM
Profile matching the Goal's already selected route. Private profiles additionally
require the current owner and an explicit override. Changing defaults does not
silently retarget the Goal. Missing or drifted selections stop preparation.

The adapter pins project revision, Goal/Target meaning, plan, approval and LLM
selection digests into the internal execution binding. Progress timestamps and
accumulated Target evidence are not Target definition; semantic or approval
changes invalidate the binding. Current runnable status is still checked on
every read. Reads repeat around remaining-owner callbacks to detect drift.

The finite source table excludes credentials. Individual files are bounded to
1 MiB with strict JSON parsing; invalid paths, symlinks, hardlinks and nonregular
files are refused, with file identity checked around reads. This is a bounded
read of the trusted local Runtime store, not a hostile-filesystem isolation claim.
No SecretRef is resolved, client created or provider readiness inferred from
stored metadata: `credentialReadinessVerified=false`. Harness, effective
permissions and qualified Agent/executor state still require their own current
owners. Neither metadata adapter is yet composed into a public execution endpoint.

### Current governed-resource metadata (internal only)

`application/semantic-governed-sources.ts` reads five explicitly selected Runtime
resources: policy (`PolicyPack`), provider (`ActionProviderDefinition`), environment
(`EnvironmentBinding`), authority (`HumanAuthorityRole`) and evidence contract
(`GovernancePack`). Each selection supplies an exact id, version and digest;
the scoped active pointer must identify that same immutable resource. Both the
resource and activation receipt are integrity-checked, and activation requires
an actor, evidence reference and timestamp. Missing pointers never fall back to
the latest version, unlike the general resource reader. No scope directory or
resource is created by this read path, and no SecretRef resource can be read.

`withSemanticGovernedSources` replaces the five historical callback digests with
current resource digests. `evopilot-semantic-governed-source-pins/v1` binds their
identities and activation receipts into the internal execution binding. Reads
repeat across resources and around other owner callbacks; changed permissions,
activations or selected bytes stop preparation. An explicit reactivation also
changes its receipt pin. Inactive newer versions and unrelated resources do not
invalidate these pins; this does not resolve the separate whole-Catalog active
Harness limitation described above.

Scoped directory ancestors and file identities are checked before and after
reads, with the same 1 MiB per-file bound and no directory enumeration. This is
trusted local-store consistency checking, not full hostile-filesystem isolation.
The adapter validates metadata, not provider availability, environment health,
resource compatibility ranges or the meaning of policy/evidence rules. A stored
authority role is not a grant. Runtime identity, effective permissions, qualified
Host/executor observation collection, complete composition and production outcome governance remain
required; `eligibleForExecution=false` is unchanged.

### Current executor observations (internal only)

`application/semantic-executor-sources.ts` reads an exact scoped
`AgentRuntimeProfile` resource whose `spec.semanticObservation` carries
`evopilot-semantic-executor-observation/v1`. This internal shape binds the exact
project/Goal/Target/Harness execution identity, principal, observed Agent runtime
name/version, core execution profile and qualification, Host/executor, model
route, sandbox, environment and governance digests, evidence references and a
permission ceiling. Observation and resource digests are verified. A resource
registration alone is insufficient: the active receipt must record an explicit
activation or rollback, with an actor, evidence reference and a nonfuture time.

Observations require a declared validity interval: `observedAt <= now < validUntil`.
Missing, revoked, future, expired or corrupt observations stop preparation. The
environment observation must be `READY`, with evidence and the exact current
environment digest and executor workspace reference. Governance identities must
also match current owner state. Reads and validity checks repeat before returning;
execution boundaries and context preparation re-read this live owner adapter.
An observation cannot be refreshed by rehashing or by silently selecting another
version. Replacement or reactivation requires revalidation of the bound record.

The effective effects/capabilities are the intersection of current owner
permissions and the observation ceiling, never a restored or expanded grant.
Both current principal access and the current permission revision remain required.
`evopilot-semantic-executor-source-pins/v1` stores the exact resource, activation,
observation digest, validity interval and observed runtime identity in the
execution binding; private observation payloads are not copied into these pins.

This is verification of Runtime-owned observation evidence, not a live Host or
environment probe. It checks the existing core qualification structure but does
not independently run conformance tests or attest the referenced evidence. The
qualified live collector, dedicated review/write workflow, complete production
composition and production outcome governance are still unfinished.
The generic resource API is not a semantic-execution authorization API. Public
execution refusal and `eligibleForExecution=false` remain unchanged. Tests create
only disposable synthetic observations, with no real Host or provider calls.

### Internal semantic Agent transport (source verification only)

`application/semantic-execution-transport.ts` connects the persisted pending
Lifecycle request, fixed Catalog context preparer, semantic binding and an
owner-configured adapter. The fixed application exposes it through separate
HTTP/CLI/MCP operations described below; it is not wired into an automatic worker.
Production observation/collector qualification and dual-result completion remain
unfinished. Public operation availability is not production acceptance.

Core capability qualification and adapter transport conformance have different
schemas and digests. An observation may now include `adapterProfile`; its exact
runtime, Host, route, workspace, capabilities and qualification must match the
core profile and executor. The immutable semantic binding retains **both** core
digests and the full adapter-profile digest. No conversion manufactures live
qualification or treats static conformance metadata as a real Host test.

The optional Agent-request `semanticContext` extension uses
`evopilot-semantic-agent-context/v1`. It carries the prepared slice, original
pending-request digest/idempotency key and semantic-binding digest. The adapter
must explicitly advertise this schema. Validation reconstructs the unchanged
original request, checks slice integrity and scope, and verifies the extension's
deterministic distinct request id/digest. OpenCode serializes this extension as
untrusted data inside the bounded request, not as a new instruction authority.
Legacy requests without the extension keep their existing contract.

An immutable dispatch claim is inserted before invoking the adapter; concurrent
attempts have one winner. Matching persisted results can be read again after
current permission, binding and pending-request checks. A claim without a valid
result returns `SEMANTIC_DISPATCH_RECONCILIATION_REQUIRED`, including after
restart; it never automatically retries uncertain side effects. Timeout or
cancellation stops the waiter without asserting that external work stopped.
A late valid receipt is retained, but no completion is written. Explicit
unknown-outcome reconciliation beyond retained-result readback is not yet exposed.

Request, binding, idempotency, effects, redacted evidence, artifacts and cost are
checked before storing a result. Agent `SUCCEEDED`, `FAILED` and `UNCERTAIN`
all remain `RECEIVED_PENDING_DUAL_VALIDATION`, `eligibleForCompletion=false`.
This service never calls Lifecycle result ingestion or changes Goal/Target state.
Receipt correlation is not a business-semantic validator or Harness professional
validator. Public unsupported-execution guards remain in place.

Local tests use the actual OpenCode serializer with an injected synthetic runner;
no subprocess, credentials, provider calls or real Host acceptance are involved.
They cover original-request tampering, duplicate/restarted/parallel dispatch,
scope and permission drift, independent qualification pins, invalid results,
timeout, cancellation and retained late receipts.

### Internal dual-outcome evaluation (not Goal completion)

`application/semantic-execution-outcome.ts` reads an existing transport receipt;
it cannot submit an Agent result, invoke an adapter, run source commands or finish
a Goal. The request and slice are reconstructed through the same fixed preparation
path and must match the persisted dispatch claim and result exactly.

A server-owned `evopilot-semantic-outcome-plan/v1` is pinned into the execution
binding **before dispatch**, together with the evaluator implementation digest.
It identifies the exact GoalTarget, ArtifactSet, Bundle, Lifecycle and pending
stage/action/version. Business rules reference concepts in the selected slice.
Harness rules explicitly map to validator, constraint or evidence obligations.
The evaluator independently reconstructs the full requirement union from the
published Bundle, Profile, Components and exact persisted Lifecycle. A shortened
candidate or plan cannot remove an obligation; a missing mapping is indeterminate.

Rules use only four bounded predicates: scalar equality, inclusive numeric range,
nonempty all-zero exit-code arrays, and nonempty executed-command sets contained
in an approved set. Selectors are own-property key arrays with no prototype
traversal. No expression evaluator, script, source command, regular expression,
network or model execution is provided. There are at most 64 rules per side,
16 selector keys, 256 array elements, and 32 KiB per plan.

These predicates evaluate an explicitly reviewed domain mapping; they do not
infer professional meaning from prose or from an obligation's name. The internal
review service below now requires complete business-criterion mapping and an
exact product-owned review decision. Public authoring/review routes and real
domain review remain unfinished; tests use synthetic decisions only.

Result artifacts must refer to `semantic-evidence://<kind>/<sha256-hex>` and
already exist under the Runtime-owned `semantic-outcome-evidence` store, scoped
by tenant/workspace/project. Raw file bytes, exact dispatch/source request,
execution binding, Goal/Target scope and evidence-contract digest are checked.
No caller-provided facts, arbitrary paths or source-workspace files are read.
Limits are 16 artifacts, 64 KiB each, 256 KiB total actual bytes (including
whitespace), and a shared 30-second evaluation deadline. Existing strict
file/ancestor/symlink/hardlink checks apply. Missing required evidence kinds
cannot pass through a different check's success.

The full business/professional collector workflow is still required: content hashes prove
identity, **not observation truth or collector authority**. Local tests place
synthetic evidence in the trusted store; they do not prove real command execution,
live Host conformance or professional acceptance. Agent success text is never
read as validator evidence.
Reports explicitly retain
`evidenceTrust=CONTENT_AND_CORRELATION_VERIFIED_NOT_COLLECTOR_ATTESTED`;
review approval never upgrades this evidence trust level.
The separate process-boundary collector below can supply measured process facts,
but does not upgrade existing artifact documents into attested business evidence.

Both business and Harness results are always retained independently. A false
predicate fails its side; an absent fact or unmapped obligation is indeterminate.
Agent `FAILED` or `UNCERTAIN` cannot pass even with passing checks. Both sides
passing with a successful exact Agent receipt yields
`DUAL_VALIDATED_NOT_COMPLETED`, still `eligibleForCompletion=false`.
Final permission/binding/request/evidence rechecks precede immutable outcome
storage. Restart re-evaluates current state, not merely a cached `PASSED` value.
Reports expose rule statuses and evidence digests, not fact values.
They also pin the exact outcome-review and decision digests, revalidated before
evaluation and immediately before storage.

No Lifecycle/Goal/Target completion transition, publication, approval or release
authority is added by evaluation. The fixed application below supplies its
public HTTP/MCP/CLI route. The remaining integration
must bind reviewed plans and trusted collection to server-governed completion;
formal acceptance still requires separately authorized installed real cases.

### Adapter process observation and finite Runtime collection

An adapter may explicitly negotiate `evopilot-agent-process-observation/v1` and
provide a local `readProcessObservation(request, result)` owner method. The
OpenCode adapter records this observation from its process runner, separately
from model-authored output or artifact references. It binds the exact request,
adapter profile, runtime version, provider/model route, invocation digest,
termination/exit/signal, output/session-id digests, parsed-event counters and
reported cost. The complete material hashes to the result's receipt digest;
raw output, session ids, environment and prompt bytes are not retained in it.
Event counters and reported usage describe output, not the truth of that output
or independently verified billing.

`application/semantic-process-evidence.ts` accepts only this fixed correlated
shape and projects `agent-process` facts: exit code, termination, signal and
event/error/completion/parse-failure counts. Agent artifact references may not
claim that reserved kind. No caller-selected collector, file scan, command,
business fact, authorization boolean or professional pass flag is accepted.
Existing scope, binding, review, permissions and pending-request checks remain.

Runtime retains the observation with the immutable result. Invalid collection
retains the result as `processObservationStatus=REJECTED` and denies consumption;
the durable dispatch claim prevents another invocation. Missing/legacy
observations remain unavailable. Restart/cached consumption revalidates the
stored observation rather than inferring it from success text. Observations are
limited to 16 KiB and count within the evaluator's 16-evidence limit.

Injected runners are always `SYNTHETIC_PROCESS_RUNNER`, including after restart.
Native runners are `NATIVE_PROCESS_RUNNER`; neither marker establishes inner
tool effects or live Host conformance. An observation-only report states
`SYNTHETIC_PROCESS_BOUNDARY_ONLY` or `NATIVE_PROCESS_BOUNDARY_ONLY`; mixed artifact
documents remain `CONTENT_AND_CORRELATION_VERIFIED_NOT_COLLECTOR_ATTESTED`.
Missing business/professional evidence still cannot pass. Goal/Target/Lifecycle
completion remains unavailable.

OpenCode receipt files use synced no-replace insertion, a 64 KiB limit and
symlink/hardlink refusal. Native receipt directories must be private and outside
the Agent workspace; the operator must still enforce actual Host filesystem
isolation because this adapter does not create an OS sandbox. Without a receipt
directory, up to 128 observations are retained in process memory; evicted or
restarted observations are unavailable, never reconstructed. Old receipt bytes
remain usable for legacy result replay but gain no invented observation.

### Internal outcome-plan review (not evidence attestation)

`application/semantic-outcome-review.ts` provides internal `prepare`, `approve`
and `inspect` operations using the existing current-scoped-operator-or-admin
policy. These are product decisions, not Codex evolution Target approvals.
There is no public HTTP/MCP/CLI route yet.

Preparation reads the actual Runtime-owned approved Goal plan and exact Target
through the strict source reader. Each criterion is identified by a digest of
the Target definition, its position and text. It must map to one or more business
rule ids; every business rule must be mapped. A Harness rule cannot stand in for
a business rule. Empty criteria, blank text, invented or duplicate criterion ids,
unknown/duplicate rule ids and extra authority fields are refused. Limits are
64 criteria, 8192 characters per criterion and 64 rule references per criterion,
subject also to the existing 256 KiB private-record storage ceiling.

The review presents the exact criteria, plan, canonical coverage mapping, slice,
execution/source request, current owner pins and evaluator digest. Approval
re-reads these sources and persists one immutable, principal-bound decision for
that execution/run/request. Another mapping or approver cannot overwrite it.
An unprepared digest, stale source, revoked access or ambiguous prior dispatch
cannot be converted into an approval. Repeating the same decision is idempotent.

Transport with an outcome plan refuses dispatch without this approved review;
cached receipt consumption and outcome evaluation revalidate it too. Restart
does not turn the saved decision into a substitute for current checks. Existing
Harness obligation validation is still mandatory and independent. Review only
establishes that a current product operator approved this precise mapping; it
does not prove the predicates' real-world adequacy or the evidence's truth.
There is no automatic approval, evidence collector, completion transition,
publication or release authority in this service.

### Read-only pending-request context preparation

An additional internal outcome service is described before this preparation
contract. It does not change the slice's non-authoritative status.

`application/semantic-execution-context.ts` implements an internal preparation
service, now reachable through the fixed application's public `resolve` operation. It accepts exact execution-binding,
Lifecycle run and pending-request digests plus a bound server-planning action
plan (or the earlier internal explicit-selection path). It reads no caller-supplied
material or request body. The fixed Catalog
consumer verifies current permission and complete published material again; the
stored semantic pins and compatibility digest must still match.

`LifecycleService.readPendingExecution` reads the actual local Lifecycle store
without mutation. It verifies revision/input/binding integrity, exact scope,
plan approval, current runnable stage, effect/capability restrictions and attempt
limits, then reconstructs the pending request from that state. Rehashing a changed
pending request does not make it match its approved source. Preparation reads the
pending request again after final execution-binding validation, so a completed,
cancelled, replaced or corrupt request cannot return a stale slice.

The `evopilot-semantic-context-selection/v1` input declares `EXPLICIT_ONLY`,
`conceptIds` and exact directed `relations`. Concepts and relations must come from
the pinned Harness requirements; relation endpoints are included automatically,
but neighbors, unrelated concepts and inferred relationships are not. An empty
explicit selection stays empty. There is no prose-based selection, semantic
search, reasoner invocation or automatic graph expansion. A production planner
that determines the sufficient per-action selection is still required.

`evopilot-semantic-action-context-plan/v1` now declares up to 64 unique stage
rules, pinned to the Lifecycle digest and exact stage/action/action-version.
Its normalized digest is part of the immutable execution binding; no rule is
inferred from prose. Missing rules, action-version drift, duplicate stages and
caller attempts to override a bound selection are refused. Concept/relation
limits also apply to each declaration, and the plan is bounded to 65,536 bytes
(the complete owner-state bound may be stricter). This implements exact action
selection from an explicit plan, not automatic planning or execution approval.

The result is `evopilot-semantic-context-slice/v1`, pinned to the exact pending
request, semantic execution binding, selected assets, effective limits and resolver
module-byte digest. Only concept id/type/label/definition/digest and selected
edges enter the data payload. Full Skill instructions, source refs, Pack
provenance, projections, request inputs and credentials are not copied. Selected
labels/definitions remain explicitly untrusted data, never commands or authority.
The slice digest is deterministic for the same bound request and selection.

Internal projection defaults are 128 concepts, 256 relations, 65,536 UTF-8 bytes
for the **complete result** and one 30,000 ms operation deadline. Configuration
may only lower positive integer limits; its digest must match the execution
binding. Selected relation endpoints count toward the concept limit. Published
reasoning-profile node/edge limits remain in force, and its shorter wall-time
limit also constrains preparation when the verified profile is available. Exact
limits accept; exceeding a limit rejects the entire result, with no truncation or
partial slice. Cancellation and deadlines are cooperative across reads and local
projection, not OS-level interruption of synchronous parsing.

The resolver descriptor binds the compiled projection, action-plan and preparation module
bytes; it is not a substitute for a final release artifact-set digest. Its
consumer dependencies also remain subject to Runtime release binding. The
preparer supports explicit facts under known NONE/RDFS/OWL_RL profiles only and
does not claim inferred-fact or external-reasoner support.

Every result remains `PREPARED_NOT_DISPATCHED` and `eligibleForExecution=false`.
Tests use actual disposable Lifecycle and Runtime FileStore records populated
with synthetic project, Catalog, permission, Goal/LLM and Agent qualification
fixtures. This is not an installed
package, a real Host, successful Agent execution or formal R-F05 acceptance.

## Resource and consistency controls

The approved ceilings are 16 enabled roots, 64 KiB pointers/receipts, 4 MiB
generations, 4,096 entries, 16 MiB per material, 256 MiB unique material bytes,
16,384 dependency edges, graph depth 64, four concurrent readers, two head-change
retries and one 30-second operation deadline. Overrides may only reduce integer
ceilings. The shared contract also carries a 5-second lock budget; this read-only
consumer never acquires a publication lock.

Only digest-derived generation, receipt and material paths are accepted. The
configured root is canonicalized; subpath symlinks, hardlinked files and nonregular
files are rejected. File identity, size, timestamps and root identity are checked
around reads. The head is reread after validating the complete snapshot. A changed
head restarts the entire read within the original retry/deadline budget; it never
returns a partial or mixed result.

Cancellation is sticky. A hung read-only policy callback is bounded by the same
operation deadline. Filesystem operations and synchronous parsing remain
cooperative: this is not an OS-level preemptive timeout or a guarantee against
every adversarial filesystem race. Parsed evidence is frozen; the material Map is
internal ephemeral storage, not a new Runtime-owned asset repository.

Errors expose finite codes and `nextAction`, not raw paths, material text or caught
exception messages. Missing files are `UNAVAILABLE`; unknown top-level schemas
are `UNSUPPORTED`; integrity, permission, graph, resource and drift failures stop
the read. None triggers a producer call or fallback publication.

## Verification and remaining integration

The internal current-execution reader now assembles persisted Runtime records,
exact active governance resources, typed permission declarations and an explicitly
activated executor observation. Effective permissions intersect the policy,
principal grant and executor ceiling; explicit denies win. Registration alone,
expired grants, missing activation pointers and changed subjects cannot reuse a
saved permission snapshot. Admin status does not imply a grant for another role.
Reads are repeated to detect drift; the server-owned plan is read before persisted
permission sources on both passes. This is a preflight/revalidation boundary, not
an atomic transaction spanning an external Agent invocation.

The local current-owner fixture exercises binding, context preparation, explicit
outcome-plan review, synthetic dispatch and outcome validation through that reader.
A successful process with missing domain evidence remains `INDETERMINATE`.
The fixed application below now supplies public dispatch; Goal completion is not
wired. It neither activates resources nor collects independent business evidence.

`semantic-execution-plan` supplies the next internal owner: an immutable Runtime
preparation record in `project-semantic-bindings/execution-plans`. It stores the
explicit Goal context, raw action-context declaration, digest-bound outcome plan,
exact source selections and current Runtime definition pins. It does not store
effective permissions, qualification or a reusable current-Harness snapshot.
Preparation verifies the approved project semantic binding and the exact pending
Lifecycle action; it grants no execution or approval rights. Business mapping
review remains a separate existing decision, not an inferred result of saving.

The initial slot is scoped by execution identity and cannot be replaced. Identical
preparation is idempotent before dispatch; changed declarations conflict. Missing
records are never reconstructed from old binding metadata. Reads revalidate
current Runtime, authority, executor and pending-action state. Later stages use
the separate append-only records described below; this is not an activation or
project/asset migration API.

The internal `semantic-harness-sources` reader now recomputes current material
from a fully verified published Catalog, the exact scoped project definition and
the persisted pending Lifecycle revision. Historical binding digests are
comparators, never substitutes for current sources. A running revision retains
its pinned project definition; latest-version activation does not silently
replace it. Missing pinned records, changed obligations, permission revocation
and material drift stop the read. Sources are reread after asynchronous Catalog
validation; this does not make external invocation atomic.

`semantic-execution-application` composes that reader with the immutable plan,
current governance, permissions and executor observation, binding/context,
independent business review and explicit approval, dispatch and outcome checks.
Callers cannot inject current material, authority snapshots or replacement
run/request identifiers. The implementation digest measures a finite local
execution-kernel file set, not a complete release package or Host qualification.
An after-invocation revalidation failure preserves the claim/receipt and does not
authorize automatic replay. A known failed process receipt differs from an
unknown adapter invocation result, which requires reconciliation.

Read-only `semantic-execution-authoring` closes the pre-plan composition path.
`planning` verifies current Runtime Goal/Target, actual pending Lifecycle and the
published project binding, then presents bounded concepts/relations and the full
Profile/Bundle/Component/Lifecycle obligation union. `draft` requires that exact
basis digest plus explicit selections and finite business/Harness predicates.
Runtime derives all plan pins, verifies referenced concepts and complete obligations,
and reuses the current governance/executor checks without persisting any plan or
claim. A successor stage retains the original execution's project binding even if
the project default migrates. Inputs are captured before async reads; permission,
material and request drift are rechecked under one deadline and output ceiling.
The draft declaration feeds the existing immutable preparation API; it never
guesses business meaning, criterion coverage or approval, and cannot dispatch.

The source-level HTTP route `semantic-execution` now exposes the fixed application
through current authenticated scoped operator/admin access, strict 64 KiB JSON
declarations and no query parameters. It audits intent before effects and outcome
after revalidation, with server-derived principal and request correlation, never
raw plans or evidence. Audit delivery is at-least-once. Failed intent auditing
prevents invocation; failed result auditing cannot erase the retained receipt.
CLI and MCP negotiate a separate finite capability, reject redirects and never
automatically retry. Only an explicitly server-configured adapter enables the
dispatch advertisement; current qualification and exact business review approval
remain mandatory. The default standalone server does not choose an adapter.

Production collector qualification and phase/GA orchestration remain incomplete.
The bounded public stage/Target completion writers are described below.
Synthetic execution success does not grant
production eligibility or close formal acceptance criteria.

### Configured business evidence collection (source development)

The fixed application now exposes `collect` through HTTP, CLI and MCP. Only
`identity` and `bindingDigest` are accepted. Server configuration supplies a
`semanticEvidenceCollector` callback; neither a request nor a declarative Pack
can supply executable code, shell, URL resolution or credential access.
There is no default collector. Its exact descriptor (id, implementation digest,
qualification digest, origin, read-only mode and allowed kinds) must equal the
current active evidence GovernancePack's scoped, unexpired
`evopilot-semantic-collector-policy/v1` declaration in `spec.semanticCollectorPolicy`.
Qualification and independence remain operator trust assertions, not facts proven
by those hashes; production qualification is still a separate uncompleted gate.

Runtime derives at most 256 selectors from the reviewed outcome plan and binds
tenant/workspace/project/Goal/Target, source and semantic request digests, dispatch
result, execution binding, evidence contract and exact review/decision. A private
immutable claim precedes the callback. Concurrent callers cannot invoke twice;
failure, cancellation or timeout leaves a claim without automatic replay.
The deadline is 30 seconds and late output is not persisted. This cannot stop an
uncooperative injected callback's own activity; the configured callback is trusted
server code and must honor cancellation and read-only qualification.

Observation payloads are bounded to 192 KiB, 15 kinds, 4,096 fact nodes, depth 16,
strings of 1,024 characters, arrays of 256 items and 16 source digests per kind.
Reserved process evidence, unknown/duplicate kinds, undeclared top-level facts,
credential-like keys and prototype keys are rejected. Source digests identify
collector-declared snapshots; they do not independently establish their truth.
Policy, permission, current Goal/Target and execution/review sources are rechecked
before and after persistence. Stored observations are private; public replies and
audit contain digests/status/kinds, never raw facts.

Outcome evaluation reads the correlated receipt and rechecks current policy.
Duplicate kinds between Agent artifacts and collection are rejected, not silently
upgraded. `SYNTHETIC` stays synthetic; both validation results remain non-completing.
Legacy `recordExternalResult` refuses any run with a semantic plan/binding even
when the caller omits semantic fields. This is a fail-closed guard, not the still
separate guarded stage/Target completion workflow. Existing
Harness-only runs retain the legacy path.

### Guarded stage commit and single-record durability (source development)

`createSemanticStageCompletionService` is wired into the fixed application's
`commitStage` method and scoped HTTP/CLI/MCP operation. A current evidence
GovernancePack must explicitly contain an active,
unexpired, exactly scoped `spec.semanticCompletionPolicy` with schema
`evopilot-semantic-stage-completion-policy/v1` and action `COMMIT_VALIDATED_STAGE`.
This declaration is distinct from collection permission and outcome-plan review.
The service reruns dual evaluation, checks current permission and execution
sources, and requires a correlated independent collection receipt plus native
process provenance. Agent artifact assertions and synthetic provenance cannot
authorize this transition. Provenance labels alone do not qualify a real collector.

A one-use, non-serializable internal grant passes the exact pending request,
result and evidence proof to the Lifecycle mutation owner. Proof, successful
stage attempt, trajectory and cleared pending request are persisted together in
one Lifecycle record. Historical receipt readback verifies the persisted proof
and its source records without redispatching, collecting again or granting new
authority. It remains readable after stage progression; corrupted/missing proof
sources fail closed. The result is **stage committed**, not Goal/Target completed.
Lifecycle advancement is a separate existing operation. A following stage stops
at a new request; the consumed semantic execution binding cannot authorize it.
Successor preparation/composition is implemented below. Goal/Target terminal
projection remains unimplemented.

All Lifecycle writers now compare the complete expected previous revision under
an exclusive per-record lock. A stale revision fails with
`LIFECYCLE_RUN_REVISION_CONFLICT`; creation cannot overwrite an existing run.
Writes use a private temporary file, file sync, rename and parent-directory sync.
Pre-rename failures preserve the previous record. A crash or post-rename durability
failure may leave `<id>.json.lock`; subsequent writes return
`LIFECYCLE_WRITE_RECONCILIATION_REQUIRED`. There is no timestamp-based lock expiry,
automatic lock removal or uncertain-mutation replay. Recovery must inspect the
claim and authoritative record before deciding what is safe; no public recovery
command is supplied here. This is single-record CAS, not a cross-Goal transaction.

Strict mutation/readback loads require a regular, single-link, non-symlink record
with matching id/schema and a size of at most 8 MiB, under a non-symlink run
directory. Previously tolerated malformed/oversized records now fail closed.
The local tests inject storage faults and use synthetic policy/provenance
declarations to exercise branches. They do not prove real process, collector,
installed package or Host qualification.

### Append-only stage succession (source development)

The initial `execution-plans` record remains an immutable identity-to-run anchor.
After a verified semantic commit and explicit Lifecycle advance to another pending
request, preparation writes an `execution-stage-plans` record keyed by the same
scope/identity plus exact run id and source request digest. Runtime derives its
`predecessorProofDigest` from the integrity-checked Lifecycle; a client cannot
declare it. A different run cannot reuse this anchor, and neither a missing root
nor a missing stage record falls back to previous metadata. This is succession
inside one pinned Lifecycle, not retry, run replacement, asset migration or
automatic authority inheritance.
Runtime Goal/Target definition and approval pins must still equal the initial
plan; a later stage cannot silently adopt changed acceptance criteria.

The current Lifecycle pending request selects the current plan. Each execution
binding includes the stage request and predecessor proof and occupies a separate
immutable slot. Context resolution checks that stage against the pending request.
Each stage must supply its own action-context and outcome mapping, receive its
own exact review approval, dispatch receipt, collected evidence and fresh dual
validation. Old bindings, approvals and receipts cannot substitute for a new
stage's records. Identical preparation converges before dispatch; changed
declarations conflict instead of replacing history.
The legacy result guard checks stage-scoped bindings and committed semantic
provenance as well as the root plan, so losing that plan does not reopen the
legacy completion path for a bound or already committed semantic run.

The fixed application's internal `commitStage` uses the dedicated fresh-check/CAS
owner. It intentionally does not run a pending-request postcheck after a successful
commit has consumed that request. `stageReceipt` is a separate read-only internal
operation with exact identity/binding/run/request inputs, allowing verified
historical readback after restart or further progression. Neither method is in
the public operation allow-list. Public `prepare`/`inspect`/`bind` keep their
existing request shapes; after internal progression they resolve only the new
current stage. Missing preparation fails closed.

Local source tests run two stages through the fixed application with a process
restart between stages and compare every pre-existing private record byte for
byte. Their provenance declarations and domain facts are synthetic. Lifecycle
`SUCCEEDED` still leaves the Goal `APPROVED` and Target `READY` in that fixture;
it does not bypass the separate Goal/Target completion implementation, formal
acceptance or Release gate. Existing unstaged experimental semantic bindings are
not silently migrated to stage-scoped bindings; stage mismatch or an existing
dispatch claim stops execution. Fresh source fixtures or a separately governed
migration are needed, not deletion/replay of historical claims.

### Goal write and legacy completion fence (source development)

Every Runtime Goal writer now uses the same single-record compare-and-swap
store. Existing updates require the exact raw revision captured when the Goal
was read, including across an asynchronous planner call. A fresh read at write
time is not a substitute. Creates cannot overwrite an existing id. Records are
bounded to 1 MiB, use private atomic replacement, and reject symlinks, hardlinks
and mismatched identities. Concurrent stale writes return
`GOAL_RECORD_REVISION_CONFLICT`; a retained claim returns
`GOAL_WRITE_RECONCILIATION_REQUIRED`. A post-rename durability failure retains
the claim and complete new record for reconciliation. Do not delete an old lock
or blindly replay an ambiguous mutation.
Semantic preparation and current-owner inspection also require a settled Goal;
readable new bytes or an existing ownership fence do not bypass a retained lock.

Validated semantic preparation first persists a Runtime-only
`semanticExecutionOwners` fence binding the exact Target, Harness binding and
Lifecycle run. This preserves the approved plan, source pins and persisted
Goal/Target statuses. It grants neither execution nor completion. The fence
precedes the separate immutable plan write: if that write fails, the fence
remains and an unchanged valid preparation can finish it. These files are not
one transaction. A legacy Loop-bound Target cannot be silently taken over.

Once fenced, the whole Goal is unavailable to legacy Goal mutation, automatic
Loop progression and report generation. Removing the field from a write payload
does not release the persisted fence. Legacy snapshots, lists, evidence matrices
and the final-report endpoint cannot infer completion from DONE flags, a Loop or
a raw report. They report blocked/completion-required rather than progress 100%.
This is a temporary fail-closed projection until verified public completion
and reporting are composed with the internal writer described below; it is not a
claim that a valid semantic run failed. The public completion capability remains
unavailable. Non-semantic Goals retain the existing workflow with CAS protection.

Earlier experimental plans without this ownership fence do not silently gain
authority on resume. Use fresh source fixtures or an explicitly governed
migration; never strip ownership or replay historical dispatch to repair them.
There is no cross-Goal/Lifecycle transaction, public completion grant, installed
acceptance or Release in these source tests.

### Terminal evidence verification (source development)

The internal Lifecycle owner now supplies `readSemanticTerminal`, separate from
pending-stage reads. It requires a settled, integrity-checked `SUCCEEDED` run,
no pending stage/request/decision or unresolved input, and the exact approved
plan binding. Every declared stage must close: enabled external stages need
their own semantic proof, correlated source request and successful trajectory;
internal stages need their deterministic receipt; disabled or unmatched stages
need the matching skip record. Dependency checks use actual attempt order, not
the order of declarations. Extra attempts, unproved stages, forged skips and
unknown trajectory stages fail closed. A retained Lifecycle write claim blocks
this read even when terminal bytes are visible.

The fixed application's internal `terminalEvidence({identity, runId}, access)`
adds the durable Goal ownership fence and current Goal definition/approval pins.
It follows the immutable root and successor plans, stage-scoped bindings,
mapping reviews, approval decisions, dual-validation outcomes, dispatch claims
and collection claims/receipts. Missing records never fall back to a status flag
or an aggregate report. Correlated records are hash-checked and reread before
returning a digest-bound summary. This assembly is bounded to 64 semantic proofs;
the Lifecycle structural checker is bounded to 4096 stages/attempts/trajectory
entries. No raw business facts or process observation is returned in the summary.

The result is `TERMINAL_EVIDENCE_VERIFIED_NOT_COMPLETED`, with
`eligibleForCompletion=false` and all authority flags false. It does not
revalidate current Catalog activation, collector policy, Host qualification or
completion authority; it is not a mutation grant and cannot replace those checks.
It neither changes Goal/Target statuses nor clears locks, dispatches, collects,
advances or generates a release report. It is absent from public HTTP/CLI/MCP
operations. Only the separate guarded
writer below may perform fresh authority checks and a Goal CAS transition.

These tests use synthetic provenance labels and domain facts. A complete local
terminal history is not installed-package E2E, real-Host qualification, formal
Target acceptance or a series Release.

### Guarded Target completion (source development)

The fixed application's `completeTarget({identity, runId}, access)`
accepts neither a success flag nor a replacement evidence report. It first
verifies the complete terminal evidence chain, then revalidates each stage's
persisted declaration and execution binding against current published Catalog
materials, project semantics, approved Goal pins, LLM metadata, permission grants,
governed activation, executor/Host observation, collector policy and collection
receipt. It never fabricates a pending Lifecycle request or rewinds a run to
reuse a pending-only check. No Agent or collector is invoked during completion.

Each exact evidence resource must contain an active, time-valid
`evopilot-semantic-goal-completion-policy/v1` scoped to the tenant, workspace,
project, Goal and Target. Its action is `COMMIT_VALIDATED_TARGET` and its closure
rule is `ALL_REQUIRED_SEMANTIC_TARGETS_DONE`. A stage-completion policy alone is
insufficient. This is server-owned policy, never a request boolean or semantic
Pack authority. Current owner records and the full Goal revision are checked
again before the synchronous compare-and-swap.

The writer atomically stores the Target's `DONE` status, an evidence reference,
an internal `evopilot-semantic-target-completion/v1` receipt and a timeline event
in the same Goal record. The receipt binds historical terminal evidence, the
current authority check digest, prior Goal revision, actor and completion time.
Other required Targets keep the Goal `RUNNING`; a raw `DONE` flag without a
verified semantic receipt cannot close it. An unphased Goal can become
`COMPLETED` only when all required Targets have verified receipts. GA or phase
Goals remain `RUNNING` even when a Target finishes. A phase-associated Target
additionally requires the typed package verifier described below. Aggregate phase
closure is separate; dependent phases require its verified completion receipt.
Neither final reports nor release decisions are generated here.

`completionReceipt` verifies the settled Goal record, receipt digest and its
historical source chain. An exact retry after a durable success reads this
receipt without new writes or fresh execution authority, including after a
completion policy expires. This historical read is distinct from current
execution: ordinary source reads still refuse a completed Target. Missing or
changed evidence fails closed; it never triggers automatic repair or replay.
Before-rename failures leave the previous record unchanged. Post-rename sync
failures retain the Goal lock and block both retry and receipt readback pending
explicit reconciliation. Concurrent requests cannot append duplicate receipts.

### Public completion receipts and separate verified status (source development)

The fixed HTTP/CLI/MCP application exposes `commitStage`, `stageReceipt`,
`completeTarget`, `completionReceipt` and `completionStatus` under the same current
scoped operator/admin, readiness, auditing and strict payload boundaries. Capability
advertisement sets `completionAvailable=true` only for scope
`VALIDATED_TARGET_AND_NON_PHASE_GOAL`; `phaseTargetCompletionAvailable=true`
means Target package support. `phaseCompletionAvailable=true` advertises the separate
aggregate phase owner. `goalCompletionAvailable=true` advertises the independent
final Goal owner below; Release remains false and phase completion alone never closes a GA Goal.
This is API support, not current permission or a production qualification claim.

`commitStage` accepts identity/bindingDigest. `stageReceipt` additionally requires
runId/requestDigest and reads the exact settled history even after stage advancement.
The other three operations accept only identity/runId. No client-supplied evidence,
success flag or release decision is accepted. A pending or retained uncertain
Lifecycle/Goal write blocks successful receipt readback, preserves its lock and
returns reconciliation-required; there is no automatic cleanup or replay.

`completionStatus` returns a separate
`evopilot-semantic-goal-completion-report/v1`, built from bounded scoped Goal owner
records and individually verified historical completion receipts. Raw DONE or
COMPLETED flags cannot produce verified success. The report includes identifiers,
receipt digests, verified required-Target counts, `targetPercent`, `goalCompleted`
and explicit missing-Target/phase/GA blockers; it excludes raw facts and Goal prose.
An all-Target percentage of 100 can coexist with `goalCompleted=false` when phase/GA
closure remains pending. Release is always NOT_EVALUATED, unauthorized and unpublished.
The report is read-only and grants no downstream action authority.

The four existing per-Goal reads (Goal, snapshot, evidence-matrix, final-report)
now have an explicit verified bridge, described below. Phase/GA package closure
and production qualification are separate. The public chain is exercised with local
HTTP plus actual CLI/MCP processes and synthetic source fixtures only. It does not
establish installed-package E2E, formal Target acceptance or release readiness.

### Verified existing Goal read views (source development)

For semantic-owned Goals, `GET /api/v1/goals/{goalId}` and its `snapshot`,
`evidence-matrix` and `final-report` reads now use the same scoped operator/admin
receipt verifier as `completionStatus`. They read the exact raw Goal record, not
legacy hydration that adds a default GA maturity. The entire report is checked
against that Goal revision; current scope/account changes, changed evidence,
unsettled Goal/Lifecycle writes and raw forged COMPLETED flags fail closed.
Responses are no-store. Query/body overrides are refused. Non-semantic Goals
retain their existing routes and viewer behavior; semantic views require current
operator/admin, not an actor header or inferred viewer privilege.

Only verified Targets appear DONE in these views. A completed non-phase Goal, or
a phase Goal with a verified final Goal receipt, can
return the existing `evopilot-goal-completion-report/v1` as a read-only projection,
including the verified evidence references. Reading never persists `finalReport`,
adds a timeline event, invokes an Agent/collector or generates a release decision.
Without that separate final receipt, GA/phase blockers keep the snapshot BLOCKED
and final-report returns 409 even
when required Target progress is 100 percent. Missing required Target receipts
likewise prevent a final report. An optional unfinished Target does not become DONE.

Legacy TargetEvidencePackage/PhasePackage builders and the legacy final-report
builder cannot bypass this bridge: semantic ownership prevents GO/PASSED even
with a raw DONE flag, forged phase decision or unrelated successful Loop. The
phase summary does not count unverified raw DONE flags. The dedicated aggregate
phase owner below supplies verified GO projections; the separate final Goal owner
below supplies Goal closure. The bridge does not synthesize either owner. Goal lists,
graphs, run-status, targets, phases and timeline use the same verified read bridge;
legacy mutation paths remain guarded.

### Four-phase journey and consistent read views (source development)

The synthetic source journey executes Alpha, Beta, RC and GA in one persisted
Goal, using a distinct exact execution binding for each Target. Each phase must
commit its verified receipt before its successor can execute. Fresh application
instances verify earlier receipts after each phase and after final Goal closure;
a raw predecessor GO cannot substitute for that proof. This exercises product
operations with injected synthetic adapters, not installed packages or real Hosts.

`GET /api/v1/goals/{goalId}/run-status` returns the discriminated
`evopilot-semantic-goal-run-status/v1` schema for semantic-owned Goals. It includes
the verified Goal, snapshot, graph, timeline, evidence matrix, semantic completion
report, verified Target/phase receipt digest references and, when available, the
final Goal receipt reference and final report. It does not manufacture legacy
Loop chains or Target packages. `llmUsage` uses
`evopilot-semantic-execution-usage/v1`, aggregating only verified completed Target
receipts and their committed external stages. Routes retain provider, model,
Host and adapter profile; execution entries retain request, binding, observation
and Target receipt digests. Input/output/total tokens and reported USD cost are
subtotals, not provider-settled billing. No currency conversion is performed.
Release remains NOT_EVALUATED and unauthorized.

The process observation's optional, digest-bound `usageCoverage` distinguishes
COMPLETE telemetry from PARTIAL or UNAVAILABLE. Old observations without it remain
unknown. The OpenCode adapter marks COMPLETE only when every parsed `step_finish`
has explicit valid cost and input/output token fields; missing values are not
measured zero. Legacy numeric cost fields remain compatible, but this semantic
projection excludes incomplete telemetry from its subtotal. Explicit zero with
complete telemetry is retained as zero. Duplicate requests, invalid provenance,
unsafe token sums and non-finite cost sums fail closed.

`llmUsageStatus` is UNAVAILABLE when no execution has complete telemetry (totals
are null), PARTIAL when only some planned Targets/executions are covered, or
VERIFIED_COMPLETED_TARGETS when all planned Targets and their verified external
stages have complete telemetry. Even that last status excludes pending, failed
and uncertain dispatches, internal actions, other Goals and provider billing;
it is not a complete account bill. Coverage counts and excluded categories are
explicit. Readback does not invoke an adapter, resolve credentials or write data.

`run-status.dispatchUsage` separately exposes
`evopilot-semantic-dispatch-usage/v1` for known requests reachable from this Goal's
verified Lifecycle owners: committed stages plus the pending external request.
It includes SUCCEEDED, FAILED and UNCERTAIN result telemetry without interpreting
any of those as business completion or permission to retry. These totals overlap
`llmUsage`; never add the two totals together.

Before a new adapter call, Runtime writes an immutable private usage anchor with
the exact request/profile and binds its digest into the dispatch claim. Readback
checks Lifecycle and Harness bindings independently, request/result/observation
correlation and stable source records. No current adapter, credentials or fresh
execution grant is needed for reading. The anchor stays private; responses expose
only scoped identifiers, digests and usage, not context slices or raw outputs.
Old claims without an anchor are LEGACY_ANCHOR_UNAVAILABLE, not reconstructed.
NOT_DISPATCHED, WAITING_RECEIPT, unavailable observations, excluded synthetic
observations and missing telemetry have no measured totals. Reads never clear a
claim, replay a call or trigger collection. Retained Lifecycle write locks and
tampered bound records fail closed.

The aggregate is UNAVAILABLE, PARTIAL or VERIFIED_KNOWN_DISPATCHES according to
complete measured coverage of the known requests. Unknown and internal/future
requests, unreachable or other-Goal records and provider billing are outside this
bounded read projection; it is not a complete provider account ledger.
Non-semantic Goals retain the existing `evopilot-goal-run-status/v1` schema.

List reads retain the existing scope filter, reverse ordering and last-50 window.
Each visible semantic Goal is independently verified; this is not an atomic
cross-Goal snapshot. A failed visible semantic verification fails the whole
response rather than returning a partially trusted list. All semantic views
require current scoped operator/admin, reject query/body overrides and use
no-store. Reads never write completion or dispatch execution. Source tests cover
HTTP views and the existing `goal graph ... --json` CLI; no new CLI verb is added.

### Typed Target packages for phase-associated Targets (source development)

Runtime source pins now bind the complete phase definitions (membership,
dependencies, criteria, required evidence, review capabilities and package outputs).
Only progress, decisions and timestamps are excluded. Changing phase obligations
after execution causes definition drift; raw phase GO is never package proof.

For a phase-associated Target, the final stage's pinned independent collector must
observe `target-evidence-package` facts with a single `package` field whose schema is
`evopilot-semantic-target-evidence-package/v1`. The exact fields are `schema`,
`scope` (tenant/workspace/project/Goal/Target), `phase`, `targetDefinitionDigest`,
`phaseDefinitionDigest`, `criteria`, `evidence` and `reviews`. `criteria` must equal
the exact approved final-stage criterion-to-business-rule coverage. Each required
evidence kind appears once with nonempty `sourceDigests` matching that collection's
observed source digests. Each required review capability appears once with
`status=PASSED` and nonempty `evidenceKinds` drawn from those required observations.
The package itself must also have observed source digests. Extra claims, unrelated
sources, missing obligations and `{present:true}` placeholders are rejected.
The reviewed outcome plan must select `package` (for example its `schema` leaf)
before collection; the collector's top-level field restrictions are not relaxed.

Every current stage's server-owned completion policy must explicitly include
`phaseTargetCompletion=VERIFIED_TARGET_EVIDENCE_PACKAGE`. The same terminal-chain,
current-owner, permission, CAS and historical-receipt protections apply. Target
dependencies require verified receipts rather than raw DONE. The persisted Target
receipt additionally binds the package verification digest; it grants no phase GO
or release. `dependencyPhase` requires the exact verified aggregate predecessor
receipt, not a raw GO flag. Legacy package builders remain fenced, not repurposed as this
verifier. Local synthetic coverage is not real collector qualification.

### Aggregate phase completion and predecessor receipts (source development)

`completePhase` and `phaseReceipt` take only `identity`, `runId` and
`phaseTargetId`. The identity/run selects a required, completed member Target
whose final-stage collector observed a `phase-package` under the reviewed
`package` selector. Its payload schema is `evopilot-semantic-phase-package/v1`,
with exact fields `schema`, `scope` (tenant/workspace/project/Goal/phaseTargetId),
`phaseDefinitionDigest`, `criteria`, `evidence`, `reviews`, and `outputs`.

Every required member must have a verified Target completion receipt. Phase
membership must match the approved Goal plan. Each criterion maps one exact
phase criterion digest to a member `targetId` and `targetCriterionDigest`, already
covered by the Target's approved business-rule review. The entire mapping must
equal `criteriaCoverage` in the anchor's immutable server-owned
`evopilot-semantic-phase-completion-policy/v1`. This policy has action
`COMMIT_VALIDATED_PHASE`, exact phase scope/definition digest, status and validity
window. Evidence/output kinds and source digests must cover the phase's required
evidence/package outputs from the same independent collection; required reviews
must pass and cite those evidence kinds. A collector claim alone is not a reviewed
phase mapping or phase authorization.

Commit requires current operator/admin, active governed selections, current
permission grants and an active time-valid phase policy. It atomically writes one
phase completion receipt, PASSED/GO and a timeline entry in the existing Goal CAS.
The receipt binds member Target receipts, package/policy/definition digests and
any predecessor phase receipt. A retained write lock blocks readback and replay.
Historical exact retries verify evidence without re-execution or a fresh expired
grant. Public Goal views show GO only for verified phase receipts. Goal remains
RUNNING, final-report remains blocked for phase/GA Goals, and no release decision
is generated. Preparation, binding and subsequent scoped execution operations
also check the predecessor receipt; raw GO and cyclic/missing predecessor chains
cannot authorize a dependent phase. Phase aggregate completion does not imply
Goal closure or production E2E is complete.

### Final phase/GA Goal closure (source development)

`completeGoal` and `goalReceipt` accept only `identity` and `runId`, selecting a
required completed Target as the immutable policy anchor. They require explicit
`goalCompletionAvailable=true` capability negotiation in addition to the existing
completion contract. This extends, not replaces, non-phase Target completion.

Every required Target and every declared phase must have a verified receipt on
the same approved Goal/plan. Optional unfinished Targets stay unfinished. A GA
terminal Goal requires a GA phase; `ga-maturity-ladder` additionally requires all
four phases with exact predecessor links. Raw DONE, GO or COMPLETED flags cannot
substitute for receipts. Phase verification includes typed independent packages,
reviewed mappings and predecessor proof; no new collector invocation is made.

The anchor's pinned GovernancePack must contain a separate
`semanticFinalGoalCompletionPolicy` with exactly: `schema`
(`evopilot-semantic-final-goal-completion-policy/v1`), `action`
(`COMMIT_VALIDATED_GOAL`), `scope` (tenant/workspace/project/goalId), `goalDigest`,
`planDigest`, `requiredTargets`, `requiredPhases`, `status`, `validFrom`, and
`validUntil`. Required Targets are sorted `{targetId,targetDigest}` entries;
required phases are sorted `{phaseTargetId,phaseDefinitionDigest}` entries. The
digests must match the verified approved source definitions, not mutable statuses.
Only current operator/admin access, current governed activations and permission
grants plus an ACTIVE time-valid exact policy permit fresh completion.

One Goal CAS writes COMPLETED, `semanticFinalGoalCompletion`, and the timeline
reference. The receipt binds all member receipts and policy/source/authority
digests. Exact retries read verified history, including after policy expiry;
retained uncertain-write locks block both replay and readback. The existing
`completionStatus` and per-Goal final-report read now accept that verified closure.
Final reports project verified phase summaries without fabricating legacy Target
packages, persist no report, and create no release decision. Release remains
NOT_EVALUATED: a completed GA Goal does not authorize deployment or publication.
These are local synthetic source tests, not installed or real-Host qualification.

After building the server, run the local transport and existing consumer checks:

```bash
node --test tests/unit/semantic-catalog-reader.test.mjs
node --test tests/unit/semantic-catalog-configuration.test.mjs
node --test tests/unit/semantic-material-bindings.test.mjs
node --test tests/unit/semantic-derived-materials.test.mjs
node --test tests/unit/semantic-project-materials.test.mjs
node --test tests/unit/semantic-legacy-membership.test.mjs
node --test tests/unit/semantic-closure-materials.test.mjs
node --test tests/unit/semantic-catalog-consumer.test.mjs
node --test tests/unit/semantic-compatibility.test.mjs
node --test tests/unit/project-semantic-discovery.test.mjs
node --test tests/unit/semantic-request-auth.test.mjs
node --test tests/functional/project-semantic-http.test.mjs
node --test tests/unit/project-semantic-binding.test.mjs
node --test tests/unit/semantic-binding-store.test.mjs
node --test tests/functional/project-semantic-binding-http.test.mjs
node --test tests/unit/semantic-execution-binding.test.mjs
node --test tests/unit/semantic-execution-guard.test.mjs
node --test tests/functional/semantic-execution-guard-http.test.mjs
node --test tests/unit/semantic-execution-context.test.mjs
node --test tests/unit/semantic-context-projection.test.mjs
node --test tests/unit/semantic-runtime-sources.test.mjs
node --test tests/unit/semantic-governed-sources.test.mjs
node --test tests/unit/semantic-executor-sources.test.mjs
node --test tests/unit/semantic-current-execution.test.mjs
node --test tests/unit/semantic-execution-plan.test.mjs
node --test tests/unit/semantic-harness-sources.test.mjs
node --test tests/unit/semantic-execution-application.test.mjs
node --test tests/unit/semantic-evidence-collection.test.mjs
node --test tests/unit/semantic-stage-completion.test.mjs
node --test tests/unit/semantic-successor.test.mjs
node --test tests/unit/lifecycle-run-store.test.mjs
node --test tests/unit/goal-record-store.test.mjs
node --test tests/unit/semantic-goal-ownership.test.mjs
node --test tests/unit/semantic-terminal-evidence.test.mjs
node --test tests/unit/semantic-goal-completion.test.mjs
node --test tests/functional/global-goal.test.mjs
node --test tests/unit/semantic-execution-transport-contract.test.mjs
node --test tests/functional/semantic-execution-http.test.mjs
node --test tests/functional/semantic-completion-http.test.mjs
node --test tests/functional/semantic-goal-views.test.mjs
node --test tests/functional/harness-catalog-consumer.test.mjs
```

The transport/configuration unit fixtures use an explicitly synthetic material
validator. The material suites use a source-synthetic full-format fixture and
rehashed mutation cases. Neither is complete ontology-closure acceptance.
The fixed-consumer suite uses disposable configured Catalog/policy fixtures and
tests that a permissive callback cannot bypass validation, that original v3
files are mandatory and that current permission is rechecked after validation.
The legacy consumer regression uses a local debug server and disposable fixtures.

Still required before a production semantic API can report eligibility:

- Complete registered-project onboarding integration with broader guided workflows,
  real changed-ontology migration and installed/real-Host activation coverage.
- Finish the required variant/security/resource matrix. External source-only
  differential checks cover eight baseline, shared-scope, multi-Pack, prior/base,
  private-dependency, Overlay, multilingual and NONE-mode/cache cases; they do
  not replace versioned installed E2E or the complete reasoning-mode matrix.
- Complete ProjectSemanticBinding acceptance, production qualification and
  multi-stage active-run integration, domain action-plan authoring
  and real domain
  mapping acceptance, production evidence-collector qualification,
  guarded completion transitions, and gap/successor guidance.
- Exact-limit/full regression matrices, installed-version E2E, real-Host evidence,
  the active soak and separately named cross-product terminal E2E.

The Expert source Core separately negotiates semantic execution capabilities and
exposes the existing finite execution/completion operations through typed nested
MCP payloads. Generic execution intent remains read-only capability discovery;
explicit outcome-review approval needs its own human decision. Guidance and result
projection preserve distinct business/Harness outcomes, receipt boundaries and
verified completion blockers. Missing capability, permission/drift failure and
uncertain effects stop without replay or legacy fallback. Actual local MCP tests
cover a synthetic non-phase Goal journey and independent business/Harness failure
branches. This does not qualify an installed Expert or production evidence collector.

The HTTP test uses a disposable local server and synthetic Catalog/policy/project
fixtures. It is not installed-package E2E or real-Host acceptance. No project
production-qualified complete Goal path is established by these tests.
The discovery result must not be presented as product `AVAILABLE`, a closed
Target criterion, installed-Candidate acceptance or Release readiness.
