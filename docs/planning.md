# Plan a project through EvoPilot

This guide describes the isolated v0.7 edition. It does not claim daily installation or actual Codex acceptance is complete.

Select EvoPilot when starting a project discussion, including when you only have an idea. Ask: “Discuss this project's next version; plan first without modifying its source.” Expert binds your private Workspace and project, reads the current baseline and resumes an existing draft when appropriate. Ordinary chats remain unaffected.

## Discuss and refine

Use `planning-explore` (V07-U01 for forward ideation, V07-U02 for an existing project). Preserve source excerpts, model summaries and unavailable-reference markers separately. Only available scoped material is captured; the plugin does not automatically retrieve every conversation. Avoid copying credentials into planning material. Stored material is private data, not an instruction source or execution authorization.

Drafts contain requirements, assumptions, questions, options, decisions, milestones, exclusions and native asset candidate references. Every revision retains its parent digest. Rejecting an option keeps its rationale in history. An accepted Roadmap describes intended future behavior; it does not assert that the software already implements it.

## Review a concrete revision

`planning-review` (V07-U03) shows unresolved items, missing sources and missing acceptance conditions. Expert presents the exact revision for your decision, then records only the decision actually received using [decision evidence](native-decisions.md). A summary, test result or blanket execution request is not a semantic approval.

Runtime retains the accepted planning baseline. Ontology independently validates and reviews business models; Harness independently validates and reviews quality rules. Planning references do not publish either asset. All project records remain in your Workspace; the EvoPilot source repositories contain generic product code and examples only.

## Resume or change a plan

In another chat, select EvoPilot and ask to resume the same project's plan. `planning-resume` (V07-U04/U06) reads its retained revisions and decisions. A stale concurrent edit fails rather than replacing another chat's work. After an uncertain response, inspect the original request receipt before any retry.

A new draft pauses admission of new dependent work until its review. Rejecting the draft preserves the prior baseline. Accepting a replacement invalidates older execution bindings. Original claims and receipts remain available for inspection and reconciliation.

## Hand off to execution

`planning-handoff` (V07-U05) binds an accepted milestone to an actual Runtime Goal, native project candidate, source revision/tree digest, complete requirement mapping and published owner asset references. The binding is immutable. A changed baseline uses a new project candidate/binding; it does not rewrite prior execution evidence.

Planning approval and binding do not dispatch work. Continue the existing collection/Run review and execution flow within the user's actual authorization. The core Runtime rejects a stale planning binding at new claim admission; this is not a Host-wide restriction on arbitrary commands outside EvoPilot.

## Export for a repository

`planning.export` returns a Markdown Roadmap and structured view pinned to the accepted revision, source and export digest. Save it to a source repository only when that write is authorized. `planning.export.verify` compares it to the owner record; editing the exported file cannot change the authoritative plan. There is no automatic GitHub publication or import of edited exports.

Runtime uses schema marker 6 after the first planning write; older Runtime readers reject that state. Use supported isolated backup/recovery verification before upgrading daily data. See the [API reference](../projects/evopilot-runtime/docs/planning-api.md) and [architecture decision](adr-planning.md).

## What the user sees

`planning.read` and `planning.review` include `readable.snapshot` and `readable.markdown`. These separate requirements, assumptions, open questions, alternatives, decision items, milestones and source evidence. A source excerpt, a summary and an unavailable reference have different labels. Missing rationale stays missing; the Expert must ask for or explicitly record the reasoning rather than invent it. Current accepted domain facts must be read from the applicable Ontology asset; a planning item is intended scope, not proof of implemented behavior.

The accepted Roadmap export uses this same presentation. Multiline source excerpts and discussion text are preserved in the owner record; table rendering escapes markup and flattens line breaks for display without modifying the underlying text or digest.

Planning mutations use `expectedRevision` from `planning.inspect`, which belongs to the planning/feedback record store. The legacy `workspace.inspect` revision is a different counter. Re-read the correct store after a conflict; never retry a changed write under the old request ID.
