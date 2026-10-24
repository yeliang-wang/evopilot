# Additive usability contract and read-only preflight

Status: accepted for the explicitly started V08-T1 implementation. This does not authorize a software release or installation. The [execution Target](../../governance/asset-usability-v08-execution.json) pins the accepted planning documents, v0.7 source baseline, file scope and 27 stage checks.

## Decision

Keep immutable native RDF/SHACL and Rego packages unchanged. Add a parent-generated, versioned usability inventory/specification contract. Harness owns a read-only SDK preflight over trusted inventory and material readers. Runtime's execution and owner databases remain unchanged in T1. This adds no new actor, lifecycle or source of truth.

An inventory is selected by digest from a trusted reader independently of the submitted specification. It fixes the Workspace/project/visibility, functional slice, exclusions, target level, source/assets/environment/dependency pins, domain questions and behavior obligations. Missing answers or facets remain in the report's denominator. Applicability exceptions belong to the pinned inventory and include their review references; a submitted implementation cannot create them.

Preflight compares identity, coverage and readable normative bytes. It cannot establish semantic entailment or equivalence. Even `READY_FOR_ASSESSMENT` always has `verifiedLevel: null` and `assessmentStatus: NOT_EVALUATED`. Independent assessment, exact owner decisions, protected reconstruction receipts and the two clean attempts belong to later Targets. This distinction is part of the executable contract, not only a disclaimer.

## Alternatives

| Option | Benefit | Cost / rejection reason |
|---|---|---|
| Store a requested L1/L2/L3 label on each ontology | Minimal implementation | Conflates intent with evidence and can mislabel legacy assets; rejected. |
| Read-only pinned inventory/specification preflight | Exposes concrete gaps without changing native standards or state | Does not yet award a level; selected as T1 foundation. |
| Implement a grading store, external service and reconstruction engine together | Full workflow in one delivery | Mixes different authority and recovery boundaries before the consumption experiment; deferred to T2–T5. |

## Access, bounds and trust

Authorize the Workspace/scope before loading inventory or citation content. The host wires trusted readers; these callbacks are not a caller-configurable HTTP provider. Citation bytes must match their exact asset, path and content digests, be published, accessible and normative. Private/public scope is checked exactly. Asset text stays data and is never evaluated or followed as an instruction.

At most 128 questions, 64 behaviors, 128 distinct citations and 1 MiB input are accepted. Reads are bounded to 2 seconds each, 10 seconds total, 1 MiB per evidence file and 4 MiB cumulative evidence. Timeouts signal abort and are not retried. Readers must honor abort for actual I/O cancellation; preflight never treats a timed-out response as success. Errors expose stable gap codes rather than provider messages. The public contract does not authenticate the truth of a review reference; the trusted inventory provenance and subsequent owner assessment supply that authority.

## Compatibility and validation

No native specification, historic package, receipt, database schema or daily installation changes. Rollback consists of using the prior SDK; no data migration is required. The parent alone generates the additive contract and exact vendor manifests. Standalone Harness builds and package exports must work without sibling source imports.

Tests exercise valid coverage, missing/ambiguous/conflicting/draft answers, scope and digest mismatches, missing behavior facets, pinned non-applicability, timeout, denied and oversized evidence, and false L3 requests. A separate private experiment consumes real published assets and retains their gaps; synthetic tests are never substituted for a successful real reconstruction. Revisit this decision when the independent assessment and standalone transport Targets need durable records, new trust scopes or migrations.
