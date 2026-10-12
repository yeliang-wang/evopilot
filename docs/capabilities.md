# Current capabilities

The three 0.1.0 products expose public APIs, owned persistent services and CLI entry points. The parent composes public packages and supplies a shared local connection, MCP adapter and explicit Preview Expert. Read active capabilities and scoped owner state before constructing requests.

| Owner | Implemented behavior | Explicit limits |
| --- | --- | --- |
| [Runtime](../projects/evopilot-runtime/docs/service.md) | Project/goal creation, immutable six-field pins, preparation and review, human decisions, dispatch, retained receipts and reconciliation | No automatic approval, latest selection, CAS refresh or redispatch after uncertainty; no claim of all old Runtime features |
| [Harness](../projects/evopilot-harness/docs/service.md) | Native v1 lifecycle, dependency closure, review/decision/publication, supplied-evidence quality evaluation and retained receipts; preserved source imports | Semantic consumption is read-only; missing rules/reports yield INDETERMINATE with Warning, not PASS |
| [Ontology](../projects/evopilot-ontology/docs/service.md) | Native v1 models, instances and lifecycle; structured legacy bridge; retained producer, query, Catalog and seven classification operations | Native source reverse modeling is Host-authored; classification and foreign Catalog dependencies require trusted callbacks |
| Parent Preview | Bare-package composition, authenticated shared daemon, independent chat activation, bounded MCP and passive guides | Default daemon has no classification callbacks; discovery does not activate or confer authority |

Classification needs SDK-supplied `resolveClassificationSource`, `classificationAdvisor` and `classificationModel`; the model binding is exactly `{providerId, modelId, revision, timeoutMs}`. Foreign Catalog resolution requires `resolveLegacyHarness`. These are trusted code prerequisites, not request JSON or automatic Host LLM/credential inheritance. Unconfigured dependent operations are unavailable by default. Normal native modeling, quality evaluation and Runtime handoff do not require those callbacks. See [composition contracts](product-composition.md).

Current Harness Catalog and retained Ontology Catalog formats are distinct. Historical labels, source recognition and provider configuration grant no native approval or publication rights. Public visibility does not authorize uploading, and private material cannot feed public consumers.

[Test evidence](testing.md) includes actual product services and package assembly. Current candidate/Host verification, E01–E19 and operational migration status must be read from the separate exact candidate-bound local report and its real receipts. Without that report, no acceptance claim is made; discovery, static metadata and M0 feasibility do not establish acceptance.
