# Suite Convergence Migration

Audience: maintainers migrating from the installed EvoPilot or DataRig Codex Suite. This guide is read-only until a separately approved resource-registration or Cutover operation is authorized.

## Fixed inputs

Runtime 5.1 uses only the Target-frozen latest snapshots:

| Source | Version | Role |
| --- | --- | --- |
| EvoPilot Codex Suite | 3.2.1 | Immutable migration provenance |
| DataRig Codex Suite | 2.1.5 | Immutable migration provenance |

Older Suite versions are not compatibility targets. The checked-in [frozen baseline](../../governance/suite-convergence/frozen-latest.json) records exact digests, and the generated [capability inventory](../../governance/suite-convergence/capability-inventory.json) must show 100% mapping and no hidden fallback.

## Procedure

1. Freeze exact source version and digest without changing the installed Suite.
2. Inventory every capability and assign Runtime, resource, Expert, project, Harness, or explicit excluded ownership.
3. Create human-readable resources with their own versions and immutable source provenance.
4. Qualify typed Providers and reject arbitrary shell, raw secrets, or authority expansion.
5. Run DataRig, EvoPilot, evopilot-harness, and a new project through the same public contracts.
6. Shadow equivalent scenarios in an isolated Candidate installation where both Suite directories are absent.
7. Require exact criterion evidence, 100% impact closure, `NO_REGRESSION`, and zero Suite invocations.
8. Only after a public Runtime/Expert release and verified installation, propose a separate Cutover Target with explicit rollback.

This Target does not switch, disable, archive, uninstall, delete, or retire either installed Suite.
