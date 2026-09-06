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

`harness-registry.yaml` v2 lists enabled Catalog roots, priority, release, and optional expected Catalog digest. It must not duplicate Harness entries. Each v3 root contains `CATALOG.md` with a fenced `yaml evopilot-harness-catalog-v3` block whose entries point to published `HarnessComponent`, `HarnessProfile`, and `HarnessBundle` assets. EvoPilot verifies the Catalog digest, every Asset digest, and the complete Profile/Component reference closure. It reads these files dynamically and never copies them into control-plane storage.

Registry v1 and `yaml evopilot-harness-catalog` Template Catalogs remain readable as a compatibility path. They produce `bindingMode=legacy-template`; they are not immutable Bundle compliance.

Legacy direct Catalog configuration remains supported only when no Registry is configured:

```bash
EVOPILOT_HARNESS_CATALOG_DIR=/opt/evopilot-harness/published
EVOPILOT_HARNESS_CATALOG_DIRS=/opt/catalogs/database:/opt/catalogs/gateway
```

## Goal Planning

When an operator creates a goal plan, EvoPilot scores published Profile classification, positive concepts, negative concepts, and declared boundaries against stored project metadata and the goal loop target. It then resolves a published Bundle from the same Catalog whose Profile and Component references match the published digests. Registry priority is a tie breaker.

```json
{
  "selectedHarness": {
    "schema": "evopilot-goal-plan-selected-harness-binding/v2",
    "bindingMode": "immutable-bundle",
    "harnessId": "api-gateway",
    "version": "3.0.0",
    "bundleRef": { "id": "api-gateway", "version": "3.0.0", "digest": "sha256:..." },
    "profileRef": { "id": "api-gateway", "version": "3.0.0", "digest": "sha256:..." },
    "resolvedComponents": [
      { "id": "engineering-validation", "version": "1.0.0", "digest": "sha256:...", "required": true }
    ],
    "executionPlan": ["discover-project-commands", "run-approved-validation"],
    "domain": "api-gateway",
    "selectionReasons": ["classification=api-gateway", "positiveConcept=route-matching"],
    "catalogId": "organization",
    "catalogDigest": "sha256:...",
    "entryPath": "./assets/bundles/api-gateway/3.0.0/asset.yaml",
    "entryDigest": "sha256:...",
    "registryPath": "/opt/evopilot-harness/harness-registry.yaml",
    "registryDigest": "sha256:..."
  }
}
```

The Bundle's constraints, required evidence, blocking validators, and execution plan are merged into Harness-layer GoalTargets. Before Goal Loop creation and every Loop iteration, EvoPilot re-reads the Catalog and verifies the immutable Bundle closure. The Loop context and evidence set retain Bundle, Profile, Component, execution-plan, planning Catalog, and current Catalog digests.

Existing plans are immutable evidence. Additive Catalog growth is allowed when all bound Asset digests remain unchanged; EvoPilot does not require the whole current Catalog digest to equal the planning-time digest. Replacing, deleting, or modifying a bound Asset blocks execution.

## Failure Modes

- No configured Registry or Catalog directory: goal planning continues with a missing-Harness warning and `selectedHarness` absent.
- Invalid Registry: the Catalog endpoint reports `registry.status=FAILED` and `nextAction=repair-harness-registry-config`.
- Invalid v3 `CATALOG.md`, Asset digest, or reference closure: the scan is `FAILED`; malformed assets cannot participate in matching or execution.
- No positive Profile match: EvoPilot may use a valid legacy Template compatibility path; otherwise `selectedHarness` is absent and the operator must publish a better Profile/Bundle from `evopilot-harness`.
- Catalog digest changes between plans: each plan records the digest it used, so old evidence remains reproducible.
- Bound Asset changes before execution: Goal Loop creation or iteration returns `409 HARNESS_BUNDLE_DIGEST_MISMATCH` or `HARNESS_BUNDLE_BINDING_INVALID` and does not run executor nodes.
