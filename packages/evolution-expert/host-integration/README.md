# Expert private Host integration

This maintained component is prepared for co-distribution with Expert 2.3.0
(source development; not yet accepted or released). It runs as a
separate, trusted Host process, not in the Expert Core or an MCP tool that accepts
credentials. It uses Runtime 6.3.0's login and Secret APIs; explicitly signed
Runtime 6.2.0 deployment evidence retains legacy non-semantic setup support. Core v3,
generated adapters and Runtime dependencies are unchanged.

## Support and qualification

The protected input surface is AppKit on macOS ARM64 (macOS 13+). Other platforms
fail closed. A headless Host on a logged-in macOS desktop still needs an actual
visible native surface; a server without a desktop is not qualified. No Host is
qualified merely by installing this component. Codex, Claude Code, independent
Host, generic MCP/headless and the separately human-operated WorkBuddy matrix
remain release acceptance obligations.

## Private invocation contract

The trusted Host launcher uses a static, reviewed command:

```text
node <exact-slot>/run.mjs <config-path> <canonical-config-sha256> <manifest-file-sha256>
```

These arguments are non-secret pins, not model-controlled tool arguments. The
owner-only config follows `config.schema.json`. `ledgerPath` is the persistent,
canonical isolated installation ledger; never replace it to retry a request.
Config, launcher and the installation must be outside the Agent's writable
workspace. Do not launch with inherited Node inspector/debug/preload options.
This boundary does not protect against a malicious same-user process that can
rewrite trusted code, configuration or the launch definition.

The single bounded stdin JSON object has exactly `requestId`, `permission` and
`deployment`. It contains **no input values**. Generate a fresh random 16-byte
hex request id before asking the Host for its exact permission. Bind it using
`requestBinding` from `contracts.mjs`, including the component/config digests,
purpose, destination, tenant/workspace and Host identity.

`permission` is an Ed25519-signed envelope whose payload is:

```text
schema=evopilot-host-permission/v1
binding=<exact requestBinding object>
decision=ALLOW
hostPermissionObserved=true
issuedAt=<epoch milliseconds>; expiresAt=<epoch milliseconds>
```

The signature covers UTF-8 `canonical(payload)`, encoded as base64. Lifetime is
at most five minutes. Only the trusted Host integration's permission observer
may issue it, **after observing the real Host permission decision**. The pinned
public key is not authority by itself. Never give the signing key to a model,
infer approval from tool success, self-sign an Agent assertion, or provide an
`--approve` bypass. This package deliberately provides no permission-minting
CLI. A Host without a trustworthy permission observer must refuse invocation;
an arbitrary shell command or synthetic fixture is not a qualified observer.

`permission-observer.mjs` supplies the bounded Claude control-channel observer
for a trusted launcher: it matches the exact `can_use_tool` event, tool-use id
and request id, calls the launcher's real human permission UI, checks its exact
scope response, signs one permit, and denies duplicates or changed arguments.
Its signing key stays in the trusted launcher, outside model-accessible tools.
Its returned `permission` goes only to the private component, not to Claude's
model; only `response` goes back to the Host control channel. This SDK does not
start Claude or automatically supply an ALLOW decision. Channel provenance,
human UI and other Hosts still require their own qualified transport binding.

The supplementary `mcp.mjs` bridge exposes only `provision_workspace_secret`
with a single non-secret `requestId` argument. Register it only in a separately
reviewed isolated Host launch definition under server name
`evopilot_private_input`, with static arguments:

```text
node <exact-slot>/mcp.mjs <config-path> <config-sha256> <manifest-sha256> <receipt-path>
```

The trusted permission observer publishes an owner-only **non-secret** receipt
at that pinned path: `{requestId, permission, deployment}`. No private signing
key or input value belongs in that file. The bridge cannot mint a permit; it
forwards the signed metadata to the separate private process, and returns only
the allowlisted status/SecretRef. It supports one invocation per bridge process;
the durable request ledger persists across restarts. Cancel/Host disconnect
signals the private process. Do not map this tool into Expert Core operations.

`deployment` is a separately signed local operator attestation with schema
`evopilot-runtime-deployment-check/v1`, exact `destination`, `tenantId`,
`workspaceId`, exact `runtimeVersion=6.3.0` (or explicit legacy `6.2.0`), `nonDebugEncryption=true`,
`loggingLevel=info`, `issuedAt`, and `expiresAt`. Its issuer must actually inspect
the isolated Runtime deployment's effective non-debug master-key configuration
without exporting the key. This is a Host-local prerequisite, **not a new
Runtime trust API or remotely verified server claim**. A JSON boolean alone is
insufficient. Actual observer/attestation provenance must be qualified and
bound in the later exact Candidate campaign; local fixtures prove neither.

After binding/permission checks and exclusive replay claim, the native surface
asks the human to confirm the exact scope before revealing secure fields.
Runtime password and provider value travel only over inherited private pipes
to the controller and authenticated, verified HTTPS to Runtime. There is no
plaintext-file, argv, ordinary-environment, clipboard or keychain transport.
The native child has no inherited environment and its stdout/stderr are ignored.

Only fixed status and, on confirmed creation, the actual `secretRef` reach
stdout. No raw server error or response is forwarded. Runtime continues to
enforce authentication, RBAC and resource scope. A returned SecretRef does not
mean READY: continue through existing Expert/MCP Profile upsert, live preflight,
an exact default-binding decision and Runtime readiness readback.

## Cancellation and uncertain writes

Cancel/close/timeout before native submission performs no Runtime request.
After submission to the controller, login itself can update Runtime login/audit
metadata, even if Secret creation is later refused. There is no claim of zero
Runtime mutation after authentication begins.

Secret ids are unpredictable client-generated ids, not model-selected resource
names. A scoped list check rejects known collisions. Runtime has no atomic
create-only/idempotency key: an unseen race cannot be excluded. A `200` rotation
response, wrong scope, malformed response or lost response after possible POST
always returns `UNKNOWN`. A single scoped readback may inspect metadata, but
cannot prove the value and never upgrades UNKNOWN to success. No automatic
retry, rotation or resource deletion occurs.

The owner-only ledger stores non-secret request tombstones before input. Crash
and restart preserve replay suppression. A tombstone without a terminal result
must be treated conservatively as potentially submitted; use separately
authorized Runtime metadata inspection, never erase the ledger and replay.
An overall bounded cancellation signal terminates the private native child.
JavaScript/OS copies may remain in memory; this is not a total-erasure guarantee.

## Isolated install and maintenance

These commands operate only on a fresh `evopilot-host-isolated-*` directory and
do not register anything in active Host discovery. Use absolute canonical paths.
`COMPONENT` below means the reviewed manifest file's SHA-256 with `sha256:` prefix.

```text
node host-integration/manage.mjs install <source-host-integration> <isolated-parent> <COMPONENT>
node host-integration/manage.mjs doctor <returned-install-root>
node host-integration/manage.mjs health <returned-install-root>
node host-integration/manage.mjs upgrade <root> <new-exact-source> <new-COMPONENT>
node host-integration/manage.mjs rollback <root>
node host-integration/manage.mjs remove <root>
```

Upgrade stages an immutable slot and changes only the local projection; the
ledger remains. A previously pinned launcher does not silently change slots:
review and bind its new component/config pins separately. Rollback verifies the
previous slot. Remove renames the whole isolated root to a recoverable path;
it never deletes Runtime resources, Host configuration or the replay ledger.
Stop any launcher using this isolated root before upgrade, rollback or removal.
Doctor/health verify local bytes only, not permissions or Runtime readiness.

## Source verification versus acceptance

`node packages/evolution-expert/scripts/build-host-integration.mjs` compiles the
native executable on macOS and inventories packaged files. On non-macOS CI,
import the exact native CI artifact and use `--inventory-only`. The manifest
binds native and controller bytes independently of Core/Adapter digests.
Native `--self-test` validates context without creating an application/window.
Unit/mock tests and source-directory installs are not a frozen Candidate,
actual Host execution, secure-input E2E completion or release authorization.
