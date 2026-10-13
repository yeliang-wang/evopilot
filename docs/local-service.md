# Local connection foundation (M3)

This is connection orchestration for EvoPilot v0.2 Preview, version `0.1.0`,
protocol `evopilot-connection/v1`. It is not Host acceptance, release authority,
or a completed stdio adapter/installer. Runtime, Harness and Ontology retain
their own state and receipts. There is no parent business database.

## Public entry points

Import `integration/connection/config.mjs` for `loadConfiguration(configPath)`,
`installationIdentity(config)`, `canonicalJSON(value)`, `digest(bytes)`, and
`LIMITS`. Loading validates installed content and paths without writing files.
There is no environment-based configuration or credential loading.

Import `integration/connection/client.mjs` for:

- `inspectConnection(configPath)`: passive discovery; returns inactive when no
  record exists, or verifies an existing ready process over authenticated HTTP.
  It does not create directories, start a process, or initialize products.
- `activateConnection(configPath)`: explicitly start/reuse the exact shared
  installation/workspace identity. Successful activation initializes Runtime.
- `callConnection(configPath, action, payload)`: forward once to an already
  active process. Actions are `request {owner,envelope}`, `dispatch {args}`,
  `reconcile {args}`, `capabilities {}`, and `inspect {owner,scope}`.
  Owners are exactly `runtime`, `harness`, and `ontology`. Envelopes and args
  reach the existing composition APIs unchanged; owning products validate
  their business schemas. Harness/Ontology initialize on explicit operations.
- `stopConnection(configPath)`: authenticate the exact instance and close it.
  Returns `{stopped:false}` when absent; refuses `BUSY` while an operation is
  in flight. It closes composition before removing its own control record.
- `recoverStaleConnection(configPath)`: synchronous, explicit recovery of an
  exact valid record only when `kill(pid, 0)` proves `ESRCH`. This never sends a
  kill signal, touches business data, or redispatches a request.

Capabilities retain the composition's honest unavailable-provider list:
classification, legacy Catalog, and arbitrary legacy resolvers remain unwired.
Inspect/capabilities on an inactive connection do not implicitly activate it.
The lower-level `transport`, `validateAction`, and control-module exports are
implementation helpers, not a separate product execution interface.

## External configuration and installed manifest

The installer writes a JSON file outside Git and outside the installation.
Its closed schema has exactly these fields (no token, environment, custom
provider, executable override, port, or arbitrary control-directory setting):

```json
{
  "schema": "evopilot-connection-config/v1",
  "version": "0.1.0",
  "protocol": "evopilot-connection/v1",
  "installationId": "preview-install",
  "installationRoot": "/canonical/installed-preview",
  "workspaceRoot": "/canonical/private-parent/workspace",
  "workspaceId": "preview-workspace",
  "components": {"runtime":"0.1.0","harness":"0.1.0","ontology":"0.1.0"},
  "manifest": [{"path":"package.json","sha256":"64-lowercase-hex-digits"}]
}
```

The example manifest is illustrative, not complete. The installer must enumerate
and hash the **raw file bytes**, using SHA-256 without a `sha256:` prefix, of:

1. `package.json` (`@evopilot-next/stack`, version `0.1.0`).
2. All four `integration/connection/*.mjs` files.
3. `integration/composition.mjs`.
4. `integration/compatibility/v1/reference.mjs` and `manifest.json`.
5. Every regular file recursively under installed `node_modules`, including
   all three public packages, transitive dependencies, package export maps,
   native binaries, and any executable dependency assets.

Use a reproducible path sort for manifest entries. The installation digest is
SHA-256 of the canonical JSON manifest (object keys sorted, array order retained).
Paths must be unique safe relative paths using letters, digits, `_@./-`, with
no empty, `.` or `..` segments. Files must be regular, owned by the current uid,
not hardlinked or symlinked, and not group/world writable. Public install/config
files may be `0644`. Dependency directories cannot be group/world writable;
assembly must use copied package artifacts, not symlinked development packages.
The installer must include the full locked executable dependency closure in
this self-contained tree. No `.local` reference copies are imported.

The configured installation root must equal the canonical root containing the
executing connection module. Both IDs are 1–64 ASCII alphanumeric/hyphen
characters, beginning with an alphanumeric character. Workspace/config ancestors
must not contain `.git`; workspace must be outside the installation. Every path
ancestor is checked for symlinks. A missing final workspace directory is allowed
only under an existing canonical parent. Config loading never creates it.

## Process, authentication and recovery

Control metadata lives at `workspaceRoot + '.evopilot-control'`, shared across
installations targeting that workspace. This directory must be uid-owned `0700`;
`instance.json` must be uid-owned `0600`. The daemon elects itself using an
exclusive link of a completely written/fsynced record, before product access.
Contenders cannot become second writers. Updates use fsynced temporary files,
atomic rename, and directory fsync. Unknown files are never recursively removed.
The empty control directory remains after stop/recovery.

The detached current-Node child receives only the explicit configuration path.
Its environment contains only `LANG=C` and `TZ=UTC`; no inherited credentials,
`NODE_OPTIONS`, or stdio pipes. Starter/client exit does not stop the daemon.
The random 256-bit bearer token is stored only in private control metadata and
used in the HTTP authorization header. It never appears in argv, environment,
health data, returned connection information, or serialized diagnostics.

All HTTP calls are authenticated POSTs to `127.0.0.1` with the exact numeric
Host and port, no Origin, and JSON content type. Protocol, public installation
identity, and random nonce must match before product access. Replies correlate
identity, nonce and pid; a pid alone is never readiness evidence. The public
identity includes workspace root/id, installation root/id, installation digest,
component versions, product, version and protocol. No configurable remote address
or non-loopback fallback exists.

Bounds: config/request 1 MiB; response 8 MiB; manifest 10,000 entries and at most
10,000 dependency-tree nodes; each installed file 16 MiB, total hashed content
256 MiB; HTTP headers 8 KiB; request-body/header time 5 seconds; 64 connections;
client call deadline 35 seconds; health 1.5 seconds; startup polling 10 seconds.
Oversized responses or lost connections yield `UNKNOWN`. Startup timeout leaves
metadata intact and never kills an unknown process. Failed startup retains a
sanitized diagnostic; initialization failures do not authorize replay.

Product errors retain their code and exact requestId/scope/expectedRevision
correlation. Provider messages and stacks are not serialized. Lost/malformed
responses, including loss after mutation, produce `UNKNOWN`: inspect the owning
receipt with the original requestId/scope, or use the owning reconciliation API.
There is no retry, revision refresh, inferred decision, or automatic CAS repair.

`IDENTITY_CONFLICT`, `CONTROL_INVALID`, `UNSAFE_CONTROL`, `INSTALLATION_DIGEST`,
`MANIFEST_INCOMPLETE`, `STARTUP_TIMEOUT`, and `PROCESS_NOT_PROVABLY_DEAD` are
fail-closed diagnostics. A live or ambiguous process, forged record, different
installation, wrong permissions, or unknown pid is not stale-recovery authority.
Explicit recovery removes only the matching record after proven process death;
the operator must still inspect owning receipts before subsequent business work.
Recovery uses an exclusive `recovery.json` marker to serialize recovery callers.
An interrupted recovery leaving that marker fails closed with `RECOVERY_PENDING`;
it is not automatically removed or treated as permission to start a new writer.
Same-uid code/config installation is trusted: manifest checking is integrity
binding, not a sandbox against a malicious installer or concurrent same-uid writer.

## Local verification

Run `node --test integration/e2e/connection.test.mjs` for actual process/loopback
tests using temporary synthetic packages confined to the test fixture. Run
`node --test integration/e2e/connection-products.test.mjs` in the populated,
packaged installation for real public product initialization, durable project
readback, and receipt recovery after dropping the response. Product tests do
not skip when packages are missing. Tests require writable canonical temporary
storage and loopback/process permission; they do not confer Host acceptance.
