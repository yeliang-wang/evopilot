---
name: "evopilot-v01-expert"
description: "Use the explicitly selected EvoPilot plugin to initialize a personal Workspace and guide Ontology, Harness, Runtime, project progress and recovery."
---

Use only when the user explicitly selects or invokes EvoPilot. The stable `v01` identifiers also serve v0.2.0. Ordinary chats remain unaffected. Discovery and informational/guide-only requests stay passive; they do not create a Workspace or activate this chat.

For an actual EvoPilot task, call `evopilot_v01_workspace_inspect` first. If unbound, explain the default user project and separate protected state locations. The user's request to start using EvoPilot authorizes initialization with `evopilot_v01_workspace_initialize`; use requested locations when provided. For explicitly identified existing data use `evopilot_v01_workspace_attach`. Do not fabricate workspace markers, use GitHub login as a prerequisite, overwrite an occupied directory or silently switch an existing installation binding.

After successful binding, call `evopilot_v01_inspect`, then `evopilot_v01_activate` without a redundant enable question. Initialization alone does not activate this chat. Another chat's active connection does not activate this chat. When active, read capabilities and scoped owner state before business operations.

Call `evopilot_v01_guide` for the appropriate concrete use case. A01–A07 cover passive help, initialization, attach, sessions, examples, scope and status. B01–B07 cover forward/reverse modeling, review/publication, quality, Runtime handoff, source drift and private Goal/Target/Loop progress. C01–C08 cover structured imports, stored-source queries, Packs, Proposal/Snapshot/artifacts, semantic reasoning, Catalog, classification and human Harness handoff. D01–D05 cover receipt recovery, backup/restore, relocation, upgrade and diagnostics. Pass full IDs such as `V02-A02`; the seven historical guide group names remain supported. Guides work before activation and return installed documentation references.

Ask only unresolved requirements. Forward exact owner envelopes with their scope, requestId and current expectedRevision. Honor actual human decisions; never invent evidence, approval or provider configuration. On UNKNOWN, inspect original receipts/Run state and reconcile; do not automatically retry, refresh CAS or change requestId.

At onboarding, resumption and delivery, compare the project's recorded source baseline. Explain observed changes and uncertain business semantics, then update or justify reuse of assets. There is no real-time background synchronization or arbitrary Runtime coding/deployment executor. Preserve old published pins and Run claims. Target/Loop progress belongs in the private Workspace; it is not a product Roadmap change or native Goal-completion API.

Advanced classification requires explicitly configured trusted SDK providers; the default installation does not inherit the Host model or credentials. Foreign Catalog Harness materials also require their resolver. A prerequisite diagnostic is not a successful advanced operation; a classification handoff does not create or execute a Harness.

Use supported product maintenance for consistent backup, relocation and upgrade; never copy a live database, rewrite historical identity/receipts or overwrite customized files. Git asset history is not a complete runtime backup. Deactivation affects only this chat; closing it does not stop the shared connection.
