# Current EvoPilot capabilities

This is source capability documentation, not a release or production certificate. The [native workflow](native-workflow.md) is the current path. Historical v0.2 JSON mutation examples cannot create corrected-v1 work.

| Owner | Current native behavior | Boundary |
|---|---|---|
| Runtime | Frozen project requirements, reviewed collection recipes, protected raw receipts, pinned Runs, reconciliation and exact project completion | Requires trusted execution/resolution providers and actual decisions. It does not generate business models or operate arbitrary deployments. |
| Harness | Rego v1 policies, OPA tests, Conftest evaluation, explicit missing-input cases, source mappings and immutable package lifecycle | Owns quality criteria and validation. A Warning or failed required rule blocks quality completion; it does not authorize repair or release. |
| Ontology | RDF/Turtle domain models and instances, bounded SHACL, source mappings, declared coverage, positive/negative cases and immutable package lifecycle | Native validation checks stated constraints. It cannot determine whether an inferred business meaning is correct without domain review. |
| Parent / Codex integration | Private Workspace bootstrap, complete source inventory, independent scope freeze, staged editable assets, native owner composition and controlled current-delivery promotion | Explicit per-chat activation; one bound Workspace per installation. It cannot force all unrelated Codex activity through EvoPilot. |

## v0.7 additions

Runtime stores scoped planning revisions, exact decisions and execution bindings. The three owners expose structured snapshots and table-based reports with fixed denominators, expected/actual results and evidence origins. Asset comparisons preserve both pinned versions and explicit semantic limits. Draft preflight and bounded maintenance improve preparation and recovery. See [planning](planning.md), [readable reports](readable-assets.md) and [preflight/maintenance](preflight-maintenance.md). No Dashboard or automatic business approval is included.

## Standards and execution

[Ontology v1](https://github.com/yeliang-wang/evopilot-ontology/blob/main/specifications/v1/README.md) and [Harness v1](https://github.com/yeliang-wang/evopilot-harness/blob/main/specifications/v1/README.md) define the adopted upstream formats and the separate EvoPilot packaging conventions. The [project standard](../specifications/project/v1/README.md) joins them with source inventory, directories and independent requirements. Both public and private projects use these standards. New references bind actual standard content and lock digests, producer version and contract digest; a historical `v1` label alone is insufficient.

The pinned validator distribution supports macOS arm64. The installed collection router supplies a pinned Node executable; other project build tools require trusted SDK toolchain construction. Neither project JSON nor an MCP request may inject provider callbacks. The local collector restricts writes and network and allows only pinned executable paths, including subprocesses. Reviewed tools retain ordinary host reads: this is not an untrusted-code confidentiality sandbox. See [tool preparation](native-toolchain.md).

Execution success and semantic/quality success are separate. Missing, unknown, skipped, stale or unimplemented required evidence blocks project completion. Source changes require a new reviewed candidate. The project current-delivery transition additionally rereads protected Runtime completion and preserves the entire previous project tree.

## Historical compatibility and private progress

Historical asset deliveries, decisions and receipts keep their original bytes and meaning. Legacy JSON authoring, classification and Catalog mutation routes are read-only; they cannot certify the corrected v1. A pre-upgrade consistent snapshot is required for rollback to an old installation. Do not point an old writer at state written by this candidate.

Target/Loop progress remains private documentary governance linked to Runtime objects. Normal project onboarding does not change public product source or Roadmaps. Public visibility does not authorize uploading private data. No WorkBuddy implementation, production database operation, replacement metrics platform, automatic semantic approval or automatic release is included.

The [Expert catalogue](expert-scenarios.md) separates current native journeys from retained historical scenarios. [Acceptance evidence](native-acceptance.md) explains why tests and complete-shaped reports alone cannot establish project or product acceptance.

## Registered execution feedback

Registered Runtime Runs can opt into durable evidence delivery. Harness and Ontology receive private reviewable candidates through public APIs, with exact-version reuse or a native asset delivery and concrete human decision. Pending feedback blocks dependent completion. See [feedback](feedback.md). This does not intercept arbitrary Host work or approve a semantic change or software release.

## Online Harness and reviewed response

The [online service](online-harness.md) uses explicitly selected immutable service bindings, the bounded OpenSLO profile, actual Prometheus/Alertmanager inputs and an independently enabled local worker. It retains findings and repair candidates; it does not start automatic production repair.

The [0.6 response workflow](response.md) connects optional operations ontology material, published Harness guidance, a reviewed Runtime response, an actual isolated collection action, independent native verification and both owners' feedback decisions. It preserves cause hypotheses, preventive followups and risk dispositions. The supplied executor remains pinned Node with explicitly declared loopback access. Java/Maven and remote adapters remain separate Roadmap work.


## Current asset readiness (v2)

Current content grading explicitly selects `standardVersion: "v2"`: L1 covers domain understanding, L2 implementation specifications, and L3 reconstruction specification completeness. L3 does not require software reconstruction or access to the original runtime environment. `assetAssessment` and `reconstructionVerification` are independent; `L3 / NOT_REQUESTED` is valid and makes no generated-equivalence claim. Use the [current v2 workflow](asset-readiness-v081-workflow.md). Source reverse, document forward and asset composition all bind purpose, scope, sources, fixed requirements and the target level before formal modeling.

## Historical usability v1 and optional reconstruction

Historical v0.8.0 usability v1 added independent asset consumption, explicit L1/L2/L3 usability assessment, mandatory purpose/scope/level admission before reverse modeling, and controlled reconstruction with an independent fixed oracle. Verified L3 is limited to the reviewed functional slice and requires two clean complete reconstructions; it does not mean byte-identical source, whole-project coverage, production readiness or automatic release. The standalone [asset service](asset-service.md) needs no Runtime Goal or Codex session. Reconstruction uses explicitly configured trusted executor bindings; missing or unsupported providers fail closed. Read [the historical v1 workflow](asset-usability-v08-workflow.md) for independent scope, evidence, budget and recovery boundaries.
