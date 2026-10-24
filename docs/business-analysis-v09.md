# v0.9 candidate: project business metrics and evidence-driven analysis

Status: **CANDIDATE**. The version allocation and direction are accepted; a detailed implementation plan and fixed acceptance variants are not yet approved. Implementation is **NOT_STARTED** and acceptance **NOT_EVALUATED**. This is a planning candidate for product owners and future implementers, not an implemented API, delivery schedule or execution authorization. The [parent Roadmap](roadmap.md#v09-candidate-project-business-metrics-and-evidence-driven-analysis) owns EVO-F07; the [planning record](../governance/business-analysis-v09.json) carries the same allocation and boundaries.

## Version allocation and purpose

v0.7 supplies readable asset/query/comparison foundations. [v0.8](asset-usability-v08.md#project-entry-and-domain-questions) provides independent consumption, project entry, domain understanding and controlled reconstruction. It can answer a metric-definition question from reviewed assets. v0.9 is the proposed home for answering actual values, trends and evidence-backed analysis using reviewed definitions and real data. This candidate adds no v0.8 completion obligation and does not change existing v1.0 readiness criteria.

Planning and feasibility work can precede v0.8 completion. Dependent implementation must bind the actual accepted consumption, authorization, snapshot and version contracts. A passing L1/L2/L3 assessment proves only its stated asset/reconstruction scope; it proves neither production-data access nor metric correctness. No date or automatic start follows from the version number.

## Bounded first scope

Choose one privately authorized real business domain, a finite reviewed indicator set, limited named data sources and read-only analysis. Freeze representative questions and independent expected answers before implementation. Preserve private project identity, data, credentials and evidence outside public source. Public examples remain synthetic.

The intended path is question -> scope/term resolution -> pinned metric definition -> authorized observation/query -> deterministic computation -> validation -> evidence-linked answer. Ambiguity that changes the result requires clarification. If required data or definitions are unavailable, return the precise gap; do not substitute source declarations, synthetic fixtures, model-test pass counts or reconstruction results for actual observations.

A metric contract must identify business object and grain, numerator/denominator or formula, units, filters/exclusions, dimensions, time basis/window/timezone, data mappings, source/version provenance and reviewed interpretation. Define missing/stale/partial input behavior, zero denominators, numerical tolerance and comparison compatibility. Model explanations cannot supply formulas, silently reinterpret historical definitions or compute unverified numbers. Prefer reviewed project extensions and additive versioned contracts; a general metric engine is not a v0.8 prerequisite.

Start with fixed metrics, explicit time ranges and bounded grouping/baseline comparisons. Calculation is deterministic for pinned inputs/configuration. Analysis reports distinguish measurements, computed differences, correlated observations, hypotheses and confirmed interpretations. Every result exposes definition version, query/calculation identity, source time/snapshot, completeness and exact evidence references. Definition or data changes require a new result identity; incomparable periods are explained rather than silently combined. No causal attribution is inferred from temporal coincidence.

## Ownership

| Owner | Candidate ID | Responsibility |
|---|---|---|
| Ontology | ONT-F08 | Metric meaning, grain, units, relationships, semantic data mappings, definition provenance and version/comparison semantics. It does not execute data collection or own live metric history. |
| Harness | HAR-F07 | Input completeness, quality/threshold evaluation and independent correctness checks for the declared calculation/analysis scope. Preserve ownership of existing online bindings and observations; a RatioTimeslices SLO must not silently become a transaction success rate. |
| Runtime | RUN-F07 | Newly required authorized collection/query execution, provider/tool identities, budgets, durable receipts, cancellation and uncertain-outcome recovery. Retained reads do not require a new Run by default. |
| Parent / Expert | EVO-F07 | Natural-language routing and clarification, public-owner API composition and consistent answers/consumer views. No direct owner-database access, duplicate authoritative state or fourth product. |

Assign each adapter, calculation and retained result to an explicit existing owner in the future execution design. Reading retained Harness observations does not transfer their ownership to Runtime; issuing a new business query must not bypass the applicable execution authority. Registering a definition or asking a question does not authorize production mutation. Use private credential references and scoped access, never arbitrary SQL or executable text taken from a model/asset.

## Acceptance themes to freeze before implementation

These are candidate themes, not a complete or passing execution matrix:

1. A real bounded metric journey uses reviewed definitions, actual allowed data and an independent numerical oracle. Replaying pinned inputs reproduces the result within declared tolerance.
2. Ambiguous terms, missing/conflicting definitions, zero denominators, stale/partial/truncated data and incompatible units/time ranges produce explicit outcomes. Missing is never silently zero or PASS.
3. Comparisons bind both definitions and observation snapshots. Changed grain, filters, windows or source semantics cannot silently create a trend; data drift and cross-owner inconsistency are detected.
4. Cross-project/private access, credential revocation, malicious source text and unauthorized query/executable injection are rejected. Limits cover query cost, time, rows/bytes and output; a limit does not become a complete answer.
5. Timeout, cancellation, duplicate submission, response loss and restart retain exact receipts and reconcile uncertain work without blind redispatch. Maintenance preserves history.
6. Each displayed number and analytical claim resolves to calculation/evidence. The language model cannot fabricate missing values, convert correlation into causation or turn analysis into execution/release approval.
7. Actual installed consumer/Expert journeys agree with owning APIs on scope, numbers, missing states and evidence. Unsupported sources or questions disclose their limits.

Before code work, select the real pilot privately and freeze explicit requirements, positive/negative/missing/stale/recovery variants, owner/source bindings, supported adapters, authorization, performance/resource budgets and compatibility. Record an execution Target and any necessary ADRs. Fixed evidence must establish product behavior independently of model-generated tests or summaries.

## Exclusions and evolution boundary

No general BI platform, arbitrary SQL/agent execution, all-database connector catalogue, unbounded cross-source federation, hosted graph/metrics platform, automatic root-cause determination, production write/remediation, automatic asset approval or release is implied. Further sources follow demonstrated needs and separate scoped review.

Preserve native RDF/SHACL and Rego contracts, immutable assets/decisions/receipts and existing owner boundaries. If implementation crosses an accepted trust/ownership/compatibility boundary, require the replacement ADR, migration analysis, formal Roadmap revision, executable guards and explicit approval specified by the parent plan. A new software version or candidate registration grants none of those authorities. Publication and installation remain separately authorized operations.
