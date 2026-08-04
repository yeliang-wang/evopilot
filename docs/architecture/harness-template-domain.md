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
  defaults.ts    # Built-in enterprise harness templates and baseline knowledge packs
  evolution.ts   # HarnessTemplateEvolution aggregate use cases and ports
  errors.ts      # Domain error type translated by the server adapter
  utils.ts       # Local pure helpers
  index.ts       # Public domain exports
```

`packages/server/src/index.ts` is a thin package entrypoint, and `packages/server/src/server.ts` is a thin compatibility adapter for public exports and direct start. `packages/server/src/runtime/control-plane-runtime.ts` owns the current HTTP control-plane wiring during migration: it wires auth/RBAC, route modules, audit storage, `FileStore`, and LLM profile resolution into the domain through explicit ports. Shared server contracts live in `packages/server/src/model.ts`; HTTP errors, request logging, structured server logging, response writers, static Dashboard serving, platform readiness/version builders, route registry, low-coupling route groups, and file-storage primitives live under `packages/server/src/http/` and `packages/server/src/storage/` so the package entrypoint and compatibility adapter do not own reusable interface concerns.

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

Future changes to built-in enterprise harness templates should start in `packages/server/src/domains/harness-template/defaults.ts`, not in the HTTP server entrypoint.

HTTP routes, CLI commands, Dashboard flows, and tests may adapt to the domain API, but they must not reimplement template lifecycle rules outside the domain.
