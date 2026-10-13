# Capabilities in 0.1.1 Preview

Runtime, Harness and Ontology provide independent public APIs, persistent services and CLI entry points. The parent composes their public packages into one local daemon and unified Codex Expert. Read active capabilities and scoped owner state before constructing requests.

| Owner | Behavior | Limits |
| --- | --- | --- |
| [Runtime](https://github.com/yeliang-wang/evopilot-runtime/blob/main/docs/service.md) | Projects and goals, immutable six-field pins, preparation, review, human decisions, deterministic parent-provider dispatch, receipts and reconciliation | The parent validates supplied Ontology instances and evaluates Harness evidence against exact published pins, with retained receipts/reconciliation; no arbitrary code changes or deployment. Standalone Runtime requires explicitly supplied trusted providers; no automatic approval, latest selection, revision refresh or redispatch |
| [Harness](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/service.md) | Native v1 assets, dependency closure, review/decision/publication, supplied-evidence quality evaluation and retained receipts; preserved structured imports | Missing rules/reports yield INDETERMINATE with Warning; evaluation grants no automatic action, version bump or publication |
| [Ontology](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/service.md) | Native v1 models and instances, lifecycle, structured legacy bridge, retained producer, query, Catalog and classification operations | Repository reverse modeling is Host-authored from authorized source; classification and foreign Catalog resolution need trusted callbacks |
| Parent Preview | Public-package composition, authenticated shared daemon, independent chat activation, bounded MCP and passive guides | Discovery does not activate or grant authority; per-chat integration is not tamperproof Host enforcement |

## Native assets and advanced providers

Forward requirements and reverse modeling produce the same Ontology v1 asset format. Forward mappings are proposed; reverse mappings distinguish observed evidence and inference. Required business questions stay pending for review. Native asset authoring and quality evaluation of supplied evidence need no LLM callback.

Advanced classification requires SDK-supplied `resolveClassificationSource`, `classificationAdvisor` and `classificationModel`; the model binding is exactly `{providerId, modelId, revision, timeoutMs}`. Foreign Catalog resolution requires `resolveLegacyHarness`. These are trusted SDK configuration, not request JSON or automatic inheritance of Host LLM credentials. The default daemon and standalone callers without these providers cannot perform dependent operations. See the owning [classification](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/classification-service.md) and [Catalog](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/catalog-service.md) guides.

## Contracts and decisions

[Harness v1](https://github.com/yeliang-wang/evopilot-harness/blob/main/specifications/v1/README.md) and [Ontology v1](https://github.com/yeliang-wang/evopilot-ontology/blob/main/specifications/v1/README.md) definitions and schemas belong to their owners, with owner-specific extensions around v1. Published references pin `product/id/version/specVersion/digest/visibility`; unknown required extensions block consumption.

Runtime completion, Harness quality and Ontology business validity are separate. Model output, provider registration and historical labels supply no human approval or publication rights. Current Harness Catalog and retained Ontology Catalog formats are distinct. Public visibility does not authorize uploads; private material cannot feed public consumers.

Start with the [four journeys](first-journey.md), or read [composition contracts](product-composition.md) for SDK boundaries.
