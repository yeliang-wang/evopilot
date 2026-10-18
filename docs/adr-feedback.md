# Runtime feedback and owner review

Status: implementing the approved v0.4 Target. This is a design decision, not an acceptance result.

Runtime records a deterministic feedback event and its pending destinations in the same SQLite transaction as a registered terminal Run result. Harness and Ontology receive that event through their public service APIs and independently verify it through a trusted Runtime reader. Their inboxes and review dispositions belong to their own databases. Private data stays scoped to the originating project and Workspace.

An in-memory callback alone could lose feedback after a crash. A separate message broker would add deployment and distributed transaction work without a present need. We use an owner-local SQLite outbox/inbox, stable event identities and explicit retained-receipt reconciliation. A response loss is not permission to rerun a Run or generate another candidate.

Feedback begins only after explicit configuration of a project candidate. It captures registered Runtime runs; it does not intercept arbitrary Codex activity. It produces reviewable evidence and impact candidates, not automatically approved ontology definitions or weaker rules. New native packages still use their existing author/validate/review/publish lifecycle. Exact-version reuse requires a recorded rationale and review. Runtime completion requires both owners' exact approved dispositions.

The feedback contract is independently versioned under `compatibility/feedback/v1`; native v0.3 standard and contract bytes remain unchanged. The first feedback mutation advances the owner database schema marker to 3. Old readers must reject it. Close older connections before upgrade; rollback requires the matching pre-upgrade backup and installation. Existing immutable native packages, decisions, receipts and Run plans are preserved.

Verification includes actual successful and failed runs, atomic restart recovery, duplicate/conflicting events, response loss, source/scope drift, concurrent review changes, native regression/semantic assets, RC consistency, old-reader rejection, installed Codex journeys and public package readback. All 36 fixed v0.4 variants remain required. v0.5 online monitoring is a later approved Target, not a capability provided by this implementation.
