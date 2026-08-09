# Published Harness Catalog

EvoPilot v3 consumes Harness definitions; it does not manage their lifecycle. `evopilot-harness` is the system of record for authoring, source evolution, review, approval, versioning, and publication. EvoPilot reads a configured Harness Registry and the enabled published Catalog directories it points to at use time, then binds one published Harness into a goal plan as `selectedHarness`.

## Boundary

| Component | Owns |
|---|---|
| `evopilot-harness` | Harness sources, evolution runs, draft packs, review, approval, version bumps, publication, `harness-registry.yaml`, `CATALOG.md`, and published Harness directories. |
| EvoPilot | Project registry, credentials, LLM profiles, goals, phase plans, loops, evidence, release decisions, audit, and read-only Harness Catalog consumption. |
| Dashboard | Read-only Harness Hub and goal-plan evidence display. It does not publish or approve Harness definitions. |

EvoPilot must not expose `evopilot harness ...` CLI commands, Harness template write APIs, Harness evolution APIs, policy/profile activation APIs, or Catalog mutation APIs. The only Harness HTTP surface is:

```http
GET /api/v1/harness/catalogs
GET /api/v1/harness/catalogs/{catalogId}
```

## Registry And Catalog Configuration

The server prefers a Registry file from startup configuration:

```bash
EVOPILOT_HARNESS_REGISTRY_CONFIG=/opt/evopilot-harness/harness-registry.yaml
```

`harness-registry.yaml` lists enabled Catalog roots, priority, release, and optional expected Catalog digest. It must not duplicate Harness entries. Each enabled root must contain `CATALOG.md` with a fenced `yaml evopilot-harness-catalog` block. The index is maintained by `evopilot-harness` and points to published Harness definition files under that directory. EvoPilot reads the files dynamically; it does not copy them into control-plane storage.

Legacy direct Catalog configuration remains supported only when no Registry is configured:

```bash
EVOPILOT_HARNESS_CATALOG_DIR=/opt/evopilot-harness/published
EVOPILOT_HARNESS_CATALOG_DIRS=/opt/catalogs/database:/opt/catalogs/gateway
```

## Goal Planning

When an operator creates a goal plan, EvoPilot loads the current Catalog entries, scores them against the stored project metadata and goal loop target, and writes the selected published Harness into the plan:

```json
{
  "selectedHarness": {
    "schema": "evopilot-goal-plan-selected-harness/v1",
    "harnessId": "api-gateway-harness",
    "version": "1.0.0",
    "catalogRef": {
      "catalogId": "evopilot-public-harness-catalog",
      "catalogDigest": "sha256:...",
      "entryPath": "harnesses/api-gateway-harness/template.yaml",
      "entryDigest": "sha256:...",
      "registryPath": "/opt/evopilot-harness/harness-registry.yaml",
      "registryDigest": "sha256:..."
    },
    "domain": "api-gateway",
    "matchScore": 0.88,
    "matchReasons": ["goal mentions routing and traffic policy", "project metadata includes gateway runtime signals"],
    "capabilities": ["routing", "traffic-policy", "plugin-runtime", "observability", "failure-diagnostics"]
  }
}
```

Existing plans are immutable evidence. Republishing a Catalog does not rewrite old plans; the next plan reads the latest Catalog content and may select a newer Harness.

## Failure Modes

- No configured Registry or Catalog directory: goal planning continues with a missing-Harness warning and `selectedHarness` absent.
- Invalid Registry: the Catalog endpoint reports `registry.status=FAILED` and `nextAction=repair-harness-registry-config`.
- Invalid `CATALOG.md`: the Catalog endpoint reports scan warnings; planning ignores invalid entries.
- No confident match: planning records the best available evidence and `nextAction` should ask an operator to publish a better Harness from `evopilot-harness`.
- Catalog digest changes between plans: each plan records the digest it used, so old evidence remains reproducible.
