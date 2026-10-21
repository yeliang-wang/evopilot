# Registered execution feedback

Introduced in v0.4 and retained in v0.6, this explicitly configured flow sends Runtime Run evidence to private Harness and Ontology inboxes. Use Expert scenarios `V04-U01` (capture and delivery), `V04-U02` (asset review) and `V04-U03` (recovery). Selection and guides remain passive; activate the current chat before mutations.

## First use

Ask: “Enable feedback for this project's next target, inspect both owners' candidates, and guide me through reuse or an updated delivery.” Expert inspects the Workspace, exact source candidate and native assets, then calls Runtime `feedback.configure` with `projectId`. This opt-in applies to that registered candidate. An unselected chat and unregistered coding activity are not captured.

Every feedback request goes through the public owner `feedback` API, or `evopilot_v01_native` with `owner` and the same envelope. Reads have `operation`, `scope: {visibility, projectId}` and `input`. Writes additionally have a stable `requestId` and the current **feedback** revision from `feedback.inspect`; this is separate from the native workspace revision. State is stored privately in each owner's database, not in the product source repository. Editable asset sources remain in the user's project candidate directory.

| Owner | Operation | Input / result |
|---|---|---|
| Runtime | `feedback.configure` | `{projectId}`; bind a prepared candidate explicitly |
| All | `feedback.inspect` | `{}`; identity and feedback revision; Runtime also returns configurations and pending count |
| All | `feedback.list` / `feedback.read` | `{}` / `{id}`; exact outbox or owner inbox |
| Runtime | `feedback.event` | `{id}`; protected source/receipt-verified event |
| Runtime | `feedback.capture` | `{runId}`; recover an eligible terminal registered Run |
| Runtime | `feedback.deliver` / `feedback.refresh` | `{id}`; deliver if absent / reread retained owner dispositions |
| Harness, Ontology | `feedback.ingest` | `{id,digest}`; trusted Runtime reader supplies the actual event |
| Harness, Ontology | `feedback.propose` | `{id,proposal}`; compute the exact review digest |
| Harness, Ontology | `feedback.decide` | `{id,reviewDigest,decision,humanEvidenceRef}`; retain a concrete APPROVE/REJECT decision |

## From RC evidence to asset delivery

1. Register, review and dispatch the Run using the native workflow. The terminal Run result and outbox event commit in one SQLite transaction. Successful execution can still have failed quality; both statuses remain visible.
2. Runtime attempts delivery to both owners. An event binds the Workspace, scope, project candidate, source revision and inventory, Run and claim, exact native pins, protected owner receipts and collection references. Its stable cause ID prevents receipt echo from generating another Run event.
3. Harness receives a regression candidate; Ontology receives a semantic-impact candidate. Receiving evidence does not modify or publish an asset.
4. Propose **REUSE** with the exact published reference, a rationale and no semantic changes, or **DELIVER** with a different published version of the same asset. DELIVER uses the normal native author → validate → review → decide → publish lifecycle first. Include source-linked change explanations and identifiers for relation, cardinality, deprecation, rule or other impacts.
5. Review the exact proposal and record the actual human decision using the [decision evidence contract](native-decisions.md). A test PASS or broad task authorization cannot fill this decision. Proposals compare package file bytes and declared impacts; this is not full OWL reasoning. Deprecation is an explicit review declaration with source evidence and retained identifier metadata; the unchanged native subset does not enable `owl:deprecated` or other unsupported OWL vocabulary. Ontology reports the event's pinned dependent Harness, not every dependency in unrelated projects.
6. Refresh both dispositions. Pending, rejected, stale or mismatched dispositions block dependent project completion. If the approved assets differ from the evaluated Run pins, a new reviewed Run must evaluate those versions before completion. The final completion record binds the event and both disposition digests. Prior RCs and published packages remain immutable.

## Failure and recovery

Provider calls have a five-second response deadline. A timeout does not prove that a remote write failed: inspect retained owner state first. Run execution is never repeated by feedback delivery. An admitted request and its retained terminal response replay exactly. After a terminal pending result is diagnosed, a new delivery request may reconcile the **same event**, first reading existing inbox receipts. Conflicting request content is rejected. Concurrent changes require a fresh inspection and review; do not silently refresh CAS.

`FEEDBACK_PENDING` means delivery or review is incomplete. `FEEDBACK_TIMEOUT` retains an uncertain response. `EVENT_CONFLICT`, `SCOPE_MISMATCH`, `STALE_SOURCE`, `STALE_REVIEW` and `FEEDBACK_NEW_RUN_REQUIRED` require correcting the identified binding. Source drift must be resolved against an immutable source candidate. Never fabricate evidence, suppress a warning, or choose a newer asset implicitly.

There is no always-on execution-feedback delivery worker or arbitrary Codex activity interceptor. Reconnect and inspect pending state to resume. The separate [online worker](online-harness.md), introduced in v0.5, collects configured measurements and findings; [v0.6 response linkage](response.md) uses those reviewed findings. Neither automatically bumps or publishes software versions.

## Upgrade and rollback

Close old connections, then make a verified backup of the editable project and all owner state before upgrade. Feedback requires an owner SQLite schema marker of at least 3; an existing higher marker is never downgraded. Online records require marker 4 and Runtime/Harness response records require marker 5. Readers that do not support the actual marker must reject it. Existing native records keep their original v0.3 contract/producer identity, standard digests and bytes; current software versions are distinct from those historical identifiers.

Use supported stopped-state maintenance for backup and restore. Preserve the newer state before rollback and restore the matching pre-upgrade backup with its matching installation; do not point v0.3 at feedback state or rewrite its schema marker. Git history of assets alone is not a complete backup.

The [fixed target](../governance/feedback-v04.json) requires all 36 variants, including actual installed Codex, compatibility, release and downloaded-package readback. This guide describes behavior; it is not an acceptance record.
