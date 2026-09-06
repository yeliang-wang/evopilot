# Selected Harness Binding

`selectedHarness` is the goal-plan evidence that tells operators which published Harness EvoPilot selected and which immutable execution closure a Goal Loop must use. v3 matching reads published Profiles; execution binds a published Bundle.

## Schema

```json
{
  "schema": "evopilot-goal-plan-selected-harness-binding/v2",
  "bindingMode": "immutable-bundle",
  "harnessId": "database-product",
  "version": "3.0.0",
  "bundleRef": { "id": "database-product", "version": "3.0.0", "digest": "sha256:..." },
  "profileRef": { "id": "database-product", "version": "3.0.0", "digest": "sha256:..." },
  "resolvedComponents": [
    { "id": "engineering-validation", "version": "1.0.0", "digest": "sha256:...", "required": true }
  ],
  "executionPlan": ["discover-project-commands", "run-approved-validation"],
  "constraints": ["Run only approved commands in an isolated workspace."],
  "requiredEvidence": ["sql-compatibility-report", "recovery-report"],
  "validators": ["validation-exit-code"],
  "catalogId": "organization",
  "catalogDigest": "sha256:...",
  "entryPath": "./assets/bundles/database-product/3.0.0/asset.yaml",
  "entryDigest": "sha256:...",
  "registryPath": "/opt/evopilot-harness/harness-registry.yaml",
  "registryDigest": "sha256:...",
  "registryCatalogPriority": 100,
  "domain": "database-product",
  "selectionReasons": [
    "classification=database-product",
    "positiveConcept=sql-optimizer"
  ],
  "capabilities": ["engineering-validation"]
}
```

## Rules

- For `bindingMode=immutable-bundle`, report Bundle/Profile/Component ids, versions, digests, execution plan, Catalog/Registry evidence, and validation errors.
- EvoPilot revalidates this immutable closure before Goal Loop creation and before every Loop iteration. Bound Asset changes return a 409 error before executor work starts.
- The planning-time Catalog digest is evidence, not a lock on unrelated future Catalog entries. Additive Catalog growth is accepted when all bound Asset digests remain unchanged.
- EvoPilot records the selected Harness in the plan; it does not import, approve, publish, or mutate the Harness.
- `evopilot-harness` owns all lifecycle changes. If the selected Harness is wrong or incomplete, publish a new or updated Harness there, then generate a new EvoPilot plan.
- Existing plans are not rewritten when a Catalog changes.
- `bindingMode=legacy-template` and schema v1 remain readable for compatibility, but do not provide or claim v3 immutable Bundle compliance.
