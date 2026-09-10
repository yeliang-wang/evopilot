# Suite Capability Convergence

Audience: Runtime architects, project maintainers, and integration authors. Applies to EvoPilot Runtime 5.1.0 and Evolution Expert 1.1.0 source; these versions are not public until their independent release gates pass.

## Outcome

EvoPilot can express the latest DataRig and EvoPilot Codex Suite capabilities through project-neutral Runtime contracts and human-readable declarations. The Suites are migration evidence only. Runtime and Expert neither load nor invoke their directories.

```text
exact source Suite snapshot (read-only provenance)
                  |
                  v
      100% capability disposition
                  |
       +----------+-----------+
       |          |           |
    Runtime    resources    Expert/Project/Harness
       |          |           |
       +----- exact binding ---+
                  |
       Harness-guided Goal Target Loop
```

The frozen inputs are EvoPilot Codex Suite 3.2.1 and DataRig Codex Suite 2.1.5. Their versions and snapshot digests remain immutable. A derived `GovernancePack` at version 1.0.0 is a new resource lineage; it is not “Suite v1”.

## Domain ownership

| Aggregate or service | Owner | Durable truth |
| --- | --- | --- |
| `EvolutionProjectDefinition` | Runtime | Project identity, source, delivery, environment, and resource references |
| Capability/Lifecycle/Policy/Governance Pack | Resource registry | Immutable revisions, provenance, compatibility, activation, rollback |
| `ActionProviderDefinition` | Resource registry and Runtime qualification | Typed actions, schemas, receipts, idempotency, rollback, SecretRefs, authority limits |
| `RemediationCampaign` | Runtime | Failure classification, budget, receipts, attempts, descendant source and Candidate lineage |
| Human Interaction Protocol | Runtime | Unresolved inputs and exact decision objects |
| Evolution Expert | Independent package | Presentation, guidance, and thin Host adapters; no project state |
| Harness assets | `evopilot-harness` | Authoring, review, approval, Catalog, Registry, signing, and publication |

## Binding and authority

Every Goal Target Loop binds one eligible published immutable `HarnessBundle`, Lifecycle, policy, provider, environment, Host, Runtime, authority, evidence, project definition, and Goal Target digest. The binding is revalidated at start, resume, retry, and every iteration. Lifecycle and Provider composition may add obligations but cannot remove Harness evidence, validators, constraints, or permissions.

Semantic, credential, database, production, destructive, acceptance, publication, and release decisions belong to the exact owning human. Ordinary parameter entry and conversational confirmation are not approval.

## Version boundaries

- Runtime SemVer changes for Runtime code, public contracts, schema compatibility, or execution semantics.
- Expert SemVer changes for Expert interaction, Core, generated adapter, or package behavior.
- Each governed resource has its own `apiVersion`, SemVer, digest, source provenance, and Runtime compatibility range.
- Published Harness assets keep independent versions owned by `evopilot-harness`.
- Compatible resource changes do not require Runtime or Expert releases.

See [Resource Versioning](../guides/resource-versioning.md), [Action Providers](../reference/action-providers.md), and [Remediation Campaigns](../operations/remediation-campaigns.md).
