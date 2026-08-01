# Harness Template Domain

`HarnessTemplate` and `HarnessTemplateEvolution` are now an explicit server-side domain module, not helper code owned by the HTTP server entrypoint.

## Bounded Context

The Harness Template domain owns public template lifecycle behavior:

- `HarnessTemplate` identity, version, digest, changelog, source references, and validation baseline.
- `HarnessTemplateEvolution` sources, snapshots, analysis, generated draft pack, validation, administrator review, publish transition, impact report, and next action.
- Template impact calculation over project profile template bindings.

It does not own project-specific activation, goal planning, loop execution, release decisions, DevOps execution, or audit storage.

## Source Layout

```text
packages/server/src/domains/harness-template/
  types.ts       # Domain entities, value objects, refs, reports
  template.ts    # HarnessTemplate hydrate/validate/ref rules
  evolution.ts   # HarnessTemplateEvolution aggregate use cases and ports
  errors.ts      # Domain error type translated by the server adapter
  utils.ts       # Local pure helpers
  index.ts       # Public domain exports
```

`packages/server/src/index.ts` remains the composition root. It wires HTTP auth/RBAC, JSON envelopes, audit/logging, `FileStore`, and LLM profile resolution into the domain through explicit ports.

## Domain Ports

`HarnessTemplateEvolution` depends on a narrow repository port:

```text
readHarnessTemplate(id, version?)
writeHarnessTemplate(template)
listProjectHarnessTemplateBindings(tenantId, workspaceId)
```

The domain sees project profile impact as template bindings only. It does not read `StoredProject`, `ProjectHarnessProfileVersion`, or goal planning internals.

LLM generation is also a port. The domain receives a READY client and selection metadata from the server adapter. It does not know how LLM profiles, secrets, tenant scope, or readiness checks are stored.

## Invariants

- LLM output is draft-only.
- Publish requires an approved and server-validated draft.
- Publishing creates a new `HarnessTemplate` version and never mutates active `ProjectHarnessProfile` versions.
- Project profile changes happen only through reviewed profile generation, validation, apply, and activation.
- Goal planning binds active profile/template/policy digests; it does not bind a template evolution run.

## Change Rule

Future changes to template source collection, source extraction, template diffing, draft rendering, validation, impact analysis, or lifecycle states should start in `packages/server/src/domains/harness-template/`.

HTTP routes, CLI commands, Dashboard flows, and tests may adapt to the domain API, but they must not reimplement template lifecycle rules outside the domain.
