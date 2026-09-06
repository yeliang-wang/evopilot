# ADR: EvoPilot / evopilot-harness Boundary

## Status

Accepted

## Context

EvoPilot and `evopilot-harness` both refer to Harnesses, but they own different decisions. Without a durable boundary, Harness authoring can drift back into the project control plane, or a producer Proposal can be mistaken for an executable project binding.

This ADR defines the cross-project contract and connects it to EvoPilot's existing package boundaries. EvoPilot implements this contract through dynamic v3 Catalog reads, Profile matching, immutable Bundle binding, and execution-time digest revalidation.

## Decision

### System ownership

| System | Owns | Must not own |
|---|---|---|
| `evopilot-harness` | Evidence-source ingestion, Harness reasoning, Component/Profile/Bundle production, review, approval, evaluation, publication, Catalog/Registry, Harness Hub | EvoPilot project onboarding, goal-loop execution, project evidence, project release decisions |
| EvoPilot | Project onboarding, project metadata and credentials, project-to-Harness matching, open project-execution Lifecycle Harnesses, goal planning, loop execution, execution evidence, release decisions, audit | Harness authoring, source-to-Harness evolution, Harness approval/publication, Catalog mutation |
| evopilot-dashboard | EvoPilot API UI and optional iframe-like Harness Hub embedding | Harness lifecycle state or direct Harness filesystem ownership |

### Consumption contract

1. EvoPilot dynamically and read-only reads `harness-registry.yaml`, enabled Catalog roots, and each Catalog's published asset index.
2. Registry lists Catalog roots and priority. Catalog lists concrete published assets. EvoPilot does not import or copy those assets into its own system of record.
3. EvoPilot matching may inspect published `HarnessProfile` metadata.
4. A v3 goal-loop execution must bind a published, immutable `HarnessBundle` that pins its Profile, Components, digests, and execution plan.
5. Existing v1/v2 template hydration is a compatibility path. It must not be reported as v3 Bundle compliance.
6. Existing goal plans remain immutable evidence and retain the selected Harness and Catalog/Registry digests they used.
7. Before Goal Loop creation and every Loop iteration, EvoPilot re-reads the current Catalog and verifies the bound Bundle, Profile, Component digests, resolved references, execution plan, constraints, evidence, and validators.
8. Catalog growth does not invalidate an existing binding when its immutable asset closure is unchanged. The planning-time Catalog digest remains evidence; the current Catalog digest is recorded during execution validation.
9. Mandatory signature verification is not part of the current cross-project contract. Signing may remain an optional producer capability.

### Matching separation

- Producer matching in `evopilot-harness` decides whether supplied evidence evolves an existing Profile, composes a Bundle, proposes a Profile, or stops.
- Consumer matching in EvoPilot decides which published Profile/Bundle applies to an onboarded project and goal.
- EvoPilot must not use project onboarding as an implicit Harness-production path.

### EvoPilot component boundary

| Component | Harness-related responsibility | Forbidden responsibility |
|---|---|---|
| `@evopilot/contracts` | Publish machine-readable consumption-boundary metadata | Harness production decisions |
| `@evopilot/core` | Project execution and evidence domain primitives | Catalog mutation or Harness authoring |
| `@evopilot/server` Harness domain | Read Registry/Catalog, hydrate published metadata, select a Harness | Write source Catalogs, produce/evolve/approve/publish Harness assets |
| `@evopilot/server` application/storage | Persist project plans and selected-Harness evidence | Copy Harness assets into EvoPilot-owned storage |
| `@evopilot/worker-runtime` | Execute server-authorized project loops | Select unpublished assets or bypass Bundle binding |
| `@evopilot/cli` | Present server-owned Catalog reads and project actions | `evopilot harness produce/evolve/approve/publish` lifecycle commands |
| `@evopilot/client` and adapters | Transport typed EvoPilot API requests | Direct Harness filesystem mutation |

## Evidence-source rule

Source projects, root corpora, GitHub repositories, attachments, logs, historical Harnesses, notes, research, and test fixtures are producer Evidence Sources. They are not published Harness assets and must not be copied into EvoPilot state.

EvoPilot execution `LifecycleDefinition` resources are governed project-control
assets, not Harness Assets. Their ownership and safety model are defined by
[ADR 0002](0002-open-lifecycle-harness.md); naming them Lifecycle Harnesses does
not transfer any `evopilot-harness` authoring or publication authority.

## Enforcement

- `EVOPILOT_HARNESS_CONSUMPTION_BOUNDARY` in `@evopilot/contracts` is the machine-readable contract.
- `npm run verify:architecture` rejects Harness lifecycle source modules, lifecycle API/CLI patterns, and write operations under the read-only Harness consumer domain.
- `tests/functional/harness-catalog-consumer.test.mjs` verifies dynamic read-only Catalog consumption, v3 Profile matching, immutable Bundle binding, additive Catalog growth, execution evidence, tamper blocking, legacy compatibility, and absence of lifecycle APIs.
- Any approved boundary change must replace this ADR, update AGENTS and contracts, add executable checks, and identify migration and compatibility effects.

## Consequences

- Publishing a Harness does not require an EvoPilot release.
- EvoPilot can evolve independently while treating Harness assets as external, immutable inputs.
- v3 Goal Loop execution is bound to an immutable Bundle closure; changed or missing Profile, Component, or Bundle assets block execution with a 409 consistency error.
- The default release contract is local validation and repository/package publication. ECS deployment is outside this boundary.
