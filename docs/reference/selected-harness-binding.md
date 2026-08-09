# Selected Harness Binding

`selectedHarness` is the goal-plan evidence that tells operators which published Harness definition EvoPilot used for a project and target. It is selected from the configured Harness Registry and enabled published Harness Catalog directories at planning time.

## Schema

```json
{
  "schema": "evopilot-goal-plan-selected-harness-binding/v1",
  "harnessId": "database-product-harness",
  "version": "1.0.0",
  "catalogId": "evopilot-public-harness-catalog",
  "catalogDigest": "sha256:...",
  "entryPath": "harnesses/database-product-harness/template.yaml",
  "entryDigest": "sha256:...",
  "registryPath": "/opt/evopilot-harness/harness-registry.yaml",
  "registryDigest": "sha256:...",
  "registryCatalogPriority": 100,
  "domain": "database",
  "selectionReasons": [
    "goal mentions SQL compatibility and backup recovery",
    "project metadata includes storage engine signals"
  ],
  "capabilities": [
    "storage-engine",
    "query-compatibility",
    "replication",
    "backup-restore",
    "observability"
  ]
}
```

## Rules

- `harnessId`, `version`, `catalogId`, `catalogDigest`, `entryPath`, `entryDigest`, `registryPath`, `registryDigest`, and `registryCatalogPriority` must be reported in AI Agent summaries when present.
- EvoPilot records the selected Harness in the plan; it does not import, approve, publish, or mutate the Harness.
- `evopilot-harness` owns all lifecycle changes. If the selected Harness is wrong or incomplete, publish a new or updated Harness there, then generate a new EvoPilot plan.
- Existing plans are not rewritten when a Catalog changes.
