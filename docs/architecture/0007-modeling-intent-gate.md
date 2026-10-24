# Modeling intent before formal reverse preparation

Status: implementation of the user-confirmed v0.8 modeling-purpose amendment, within the pinned [T1 execution Target](../../governance/asset-usability-v08-execution.json). This decision does not authorize release or change the owner boundaries.

## Decision

Require a digest-bound `modelingIntent` before new reverse `native_project.prepare` or `preflight` work. It identifies the Workspace/project, exact source revision, intended use, functional scope, explicit exclusions, target level, independently fixed requirements and acceptance inventory, and traceable actual user intent. Missing or ambiguous intent fails before source inventory and candidate writes. Recheck the evidence before new freeze and materialization writes.

The three cumulative profiles describe content obligations:

| Target | Intended use | Additional content and evidence |
|---|---|---|
| L1 | Understand and query the domain | Questions, concepts, relations, constraints, sources and known gaps. |
| L2 | Implement specified behavior | L1 plus the normative behavior facets and complete acceptance inventory. |
| L3 | Reconstruct equivalent behavior within the declared scope | L1/L2 plus specification-only builder input, an independent oracle, two independent clean attempts, and pinned environment/limits. |

Admission checks completeness and evidence binding. It cannot judge the truth of prose or award a level. An L3 intent declares the required reconstruction experiment; the independent attempts and behavioral assessment still have to occur. Template completion, reverse extraction and a successful preparation do not set `verifiedLevel`.

The Expert resolves these inputs before formal reverse modeling. It can reuse unambiguous intent already expressed by the user. A new confirmation question is not required merely because a new API call is needed. Missing answers remain unresolved; the Expert must not silently choose L1, remove acceptance cases, or manufacture approval.

## Enforcement and retained evidence

`integration/workspace/modeling-intent.ts` validates the additive intent definition. The project service owns intent enforcement; independent Ontology and Harness services own new draft admission. Direct SDK/router calls and HTTP/MCP routes use these guards. There is no bypass flag. Incoming preparation data is copied before asynchronous work; a caller cannot alter the pinned requirement object while the write is pending. Finite MCP diagnostics preserve the gate's error codes without disclosing arbitrary provider text.

The intent reference uses the existing pinned decision-evidence format, with owner `project`, operation `modeling.intent`, the exact definition digest and decision `ACCEPT`. Both the reference and its source bytes are checked. This proves byte binding, not an independent authentication of the person's identity or the semantic adequacy of their words. Trusted operators must retain the actual user message and avoid synthetic or invented decisions. Synthetic fixtures are only technical test evidence.

Source, purpose, scope, target, requirements, acceptance or user-intent changes invalidate the prior binding. Prepare a new immutable candidate when changing a retained candidate; do not rewrite history. A later domain decision, asset publication decision, execution decision and release decision retain their existing meanings.

## Compatibility and remaining work

Historical candidate records are readable without a retroactive field or grade. Existing matching materialization can be reconciled without creating new asset bytes. New freeze/materialization from a historical reverse candidate lacking intent is blocked; create a new bound candidate to continue. Read-only source discovery and published-asset consumption remain exempt. Forward preparation keeps its existing contract. Native standards and historical packages are unchanged; older clients must supply the additive intent to start new reverse work on the upgraded service.

The independent owner services require a trusted `resolveNativeAuthoring` callback for new `native.package.put` calls and later draft validation, review, decision and publication. The callback is host configuration, never request JSON. It must resolve reviewed project/source state using bounded local reads and return an exact Workspace, project, visibility, owner, package digest, source-binding digest and source-direction binding. Reverse authoring additionally requires the retained modeling intent and target. Forward authoring also needs trusted source context; changing a package's direction cannot create an exemption. Async or malformed results fail closed. This is a trust boundary for host configuration, not a sandbox for arbitrary callback code.

The parent host supplies a resolver from frozen, materialized project records. It checks actual intent and scope-decision evidence, current source inventory, requirements, package bytes and layout. No match, multiple matches, or stale evidence blocks authoring. The owner retains the admission beside the immutable package and rechecks it before later writes, including after asynchronous validation. A changed admission cannot produce a passing draft report. Harness retains a failed receipt; Ontology retains an unresolved claim that can be reconciled without redispatch.

Direct SDK hosts must configure that resolver. A standalone CLI without trusted project context rejects new authoring with `AUTHORING_CONTEXT_REQUIRED`; it still reads and validates already published packages. The installed parent HTTP/MCP assembly supplies project context. A legacy unfinished draft requires a fresh bound put under a new request ID before continuing; its old receipt remains available. Published packages and exact receipt replay need no retroactive admission.

The first admitted owner write raises the SQLite state marker to 4 for Ontology and 6 for Harness. Older v0.7 writers reject those states, preventing downgrade from bypassing admission. Upgraded snapshot/relocation APIs recognize the markers. Take a stopped, complete backup before upgrade; reverting requires restoring that snapshot, not reducing a marker or editing receipts. Native package standards and historical evidence stay unchanged.

Source tests install isolated synthetic assemblies for HTTP/MCP journeys and test actual retained v0.7 code against temporary states. They do not upgrade the user's daily installation or establish real Host acceptance. Full v0.8 acceptance still requires independently reviewed semantic inventories, assessment persistence, real reconstruction and release closure.

## Validation

The modeling gate tests cover required fields, ambiguous intent, purpose/level mismatch, cumulative profiles, complete acceptance variants, clear-context reuse, changed bindings, mutated or missing evidence, SDK mutation during preparation, history and read-only exemptions. The transport test proves missing intent and an invented bypass flag cannot create a candidate through isolated installed HTTP/MCP, and that a valid exact binding is reusable across both routes. Historical and native project regression tests remain required. All tests preserve the distinction between requested and verified levels.

Owner admission validation also covers missing and mismatched context, forward/reverse bindings, ambiguous candidates, stale evidence, exact replay, published validation, interruption, old-writer rejection, stopped backup restoration, standalone packed packages with parent reads denied, and unbound CLI rejection. Synthetic host resolvers and decision fixtures never represent real user authority.
