# Lifecycle Registry

The Runtime-owned Lifecycle Registry is the system of record for human-readable project Pipelines. Its scope is the authenticated tenant and workspace.

## Resource lifecycle

1. Create or register YAML. The closed Action and Capability Registry validates and canonicalizes it. Registration does not activate it.
2. Inspect the immutable revision and semantic diff. Updating means registering a higher successor version; predecessors are never overwritten.
3. Activate for future planning with the expected current digest. Concurrent or stale pointer changes fail closed.
4. Deactivate to stop future selection. Existing bound runs keep their exact revision.
5. Archive an inactive revision while retaining inspection, references, and audit; restore returns it to inactive state.
6. Roll back by moving the active pointer to an exact retained revision. No run, evidence, or audit entry is rewritten.
7. Physical deletion is limited to an unreferenced, never-active draft and requires exact evidence.

The same operations are available through Runtime HTTP and MCP contracts. Evolution Expert is the ordinary-human guide and renders the list, inspect, diff, dependency, usage, audit, activation, archive, and rollback objects returned by Runtime.

## Declaration safety

Lifecycle YAML may reference only registered actions, capabilities, imports, typed inputs, conditions, retries, automation policy, and explicit authority. Arbitrary shell, programming-language code, hidden executable prompts, unknown fields/actions, raw secrets, cyclic imports, duplicate identities, and missing dependencies are rejected. Sensitive inputs store only `secret://` references.

## Selection and running bindings

A ProjectDefinition can name an active Lifecycle or match it through labels. Planning persists the exact Lifecycle id, version, digest, Action Registry digest, Harness binding, policies, Agent Runtime qualification, authority, environment, and evidence. Later pointer changes affect future plans only.
