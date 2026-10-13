# Four first journeys in 0.1.1 Preview

Complete [installation](installation.md), select **EvoPilot v0.1 Preview** in Codex, and describe your task. The first task activates this chat and checks or starts the shared daemon. Inspect and guide requests remain passive. The Expert checks active capabilities and the owner's workspace, then asks for missing project, visibility, source scope or requirements. Ordinary work needs no CLI commands.

## 1. Design from requirements

Say: “Model a library with Book and Loan. A loan must identify its book and borrower. Show the draft and unresolved questions before publication.”

Expect a draft Ontology v1 asset with concepts, relations, constraints and proposed mappings, plus questions about borrower identity and renewal rules. Required semantic gaps remain PENDING. Review the draft, make an explicit decision, then separately request publication. Publication returns an immutable reference.

See [Ontology v1 definitions](https://github.com/yeliang-wang/evopilot-ontology/blob/main/specifications/v1/README.md) and [asset lifecycle](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/service.md).

## 2. Model an authorized project revision

Say: “Use only this authorized project revision and these files to draft its domain model. Separate observed mappings from inferred ones and list business questions for review.”

Expect the same Ontology v1 asset shape, with source locator, revision and digest, observed code mappings, separately marked inferences and coverage gaps. The Host reads authorized source and authors the model; code alone cannot settle business meaning. Review, decision and publication follow the forward-design lifecycle.

Structured legacy JSON/YAML import is a separate bridge; it does not parse arbitrary repositories or Java source. See [Ontology service](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/service.md) and [legacy API](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/legacy-api.md).

## 3. Assess quality with Harness

Say: “Review this Harness asset and its rules, evaluate the supplied evidence, and show missing reports alongside quality results.”

Expect a Harness v1 asset and an evaluation identifying rules, supplied evidence, quality results and missing material. Missing rules or reports yield **INDETERMINATE with Warning**, never automatic PASS. Evaluation does not automatically change a version or launch an action. New or changed assets require explicit review, decision and publication.

See [Harness v1 definitions](https://github.com/yeliang-wang/evopilot-harness/blob/main/specifications/v1/README.md) and [evaluation service](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/service.md).

## 4. Prepare and execute a Runtime goal

Say: “Prepare this project goal using these exact published Ontology and Harness versions. Show the inputs and run for my decision; dispatch only after my decision.”

Expect a Runtime project and goal, immutable pinned inputs, a prepared run for review, an explicit decision and, after authorized dispatch, execution receipts and reconciliation state. The parent composition provides a deterministic execution provider that validates supplied Ontology instances and evaluates Harness evidence against exact published pins, with retained receipts and reconciliation. It does not perform arbitrary code changes or deployment. Standalone Runtime requires explicitly supplied trusted providers. Preparation does not execute a goal. Runtime completion, Harness quality and Ontology business validity remain separate results.

If a response is lost, say: “Inspect the retained receipt for this exact request and reconcile the run.” Uncertainty never authorizes redispatch. See [Runtime service](https://github.com/yeliang-wang/evopilot-runtime/blob/main/docs/service.md).

## Artifacts, providers and references

Native asset authoring and supplied-evidence quality evaluation need no LLM callback. Advanced classification requires trusted SDK `resolveClassificationSource`, `classificationAdvisor` and `classificationModel` providers; the model binding is `{providerId, modelId, revision, timeoutMs}`. Foreign legacy Catalog resolution requires `resolveLegacyHarness`. The default daemon does not inherit a Host LLM or configure these callbacks. Consult the owning [classification](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/classification-service.md) and [Catalog](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/catalog-service.md) guides.

Harness and Ontology own their `specifications/v1`, schemas and extensions around v1. A common published pin contains six fields: `product`, `id`, `version`, `specVersion`, `digest`, `visibility`. Use exact owner-returned values, never “latest”; unknown required extensions block consumption. Mutations carry exact scope (`visibility` and `projectId`), request ID and current expected revision. Review digests and decision evidence come from real owner state and the user's actual decision.

Guides return `installedReferences` relative to verified `installationRoot`, already equal to `managedRoot/app`. Product references resolve under `installationRoot/node_modules/@evopilot-next/{runtime,harness,ontology}/`; do not append another `app`. Ontology includes schemas, v1 specifications and service guides; Harness includes v1 definitions and its service guide; Runtime includes its service guide.

Keep synthetic examples labelled synthetic. Public visibility does not authorize upload, and private material cannot feed public consumers. Model output grants no approval or release authority. See [capabilities](capabilities.md), [Codex](codex.md) and [composition contracts](product-composition.md).
