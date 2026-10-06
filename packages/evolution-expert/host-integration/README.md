# Expert private Host integration

This maintained component carries Expert 2.3.1 metadata. Native input and credential/permission behavior remain unchanged.
Native credential entry, submission and cancellation were excluded from this
release's approved acceptance and remain unverified; see [the release limits](https://github.com/yeliang-wang/evopilot/blob/main/docs/releases/current-release.md). It runs as a
separate, trusted Host process, not in the Expert Core or an MCP tool that accepts
credentials. It uses Runtime 6.3.0's login and Secret APIs; explicitly signed
Runtime 6.2.0 deployment evidence retains legacy non-semantic setup support. Core v3,
generated adapters and Runtime dependencies are unchanged.

## Support and qualification

The protected input surface is AppKit on macOS ARM64 (macOS 13+). Other platforms
fail closed. A headless Host on a logged-in macOS desktop still needs an actual
visible native surface; a server without a desktop is not qualified. No Host is
qualified merely by installing this component. This release used existing
configuration with Codex-only acceptance; it does not establish native-input
qualification or live qualification for Claude Code, WorkBuddy or other Hosts.
Any future native-input acceptance must bind the actual Host and exact component.

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

Cancel/close/timeout before native submission performs no login or Secret write.
Local TLS health checks and token-mode authenticated read-only preflight may
already have occurred and may leave ordinary request logs.
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

## Local Runtime and installation-scoped TLS

The ordinary Agent path remains MCP stdio to the adapter, then HTTP to the
local Runtime (default `http://127.0.0.1:19876`). Private credential input still
requires verified HTTPS. The isolated Host installation can create a loopback
TLS ingress without changing Runtime, publishing a service, modifying system
trust, or inheriting `NODE_EXTRA_CA_CERTS` into the private child.

After `install` returns an owner-only installation root, run:

```text
node /absolute/installed/host-integration/manage.mjs local-setup <installation-root> http://127.0.0.1:19876 19877
```

This exclusively creates `local-tls/` with an owner-only private key, a
30-day self-signed loopback certificate and `gateway.json`. `/usr/bin/openssl`
is required; failure is redacted and never silently falls back to HTTP.
A second setup against that directory refuses instead of replacing trust.
The result includes only paths, the public certificate binding, expiration,
and addresses. No permission or deployment attestation is generated.

Start the ingress from the exact installed component slot:

```text
node /absolute/installed/host-integration/local-runtime.mjs serve <installation-root>/local-tls/gateway.json
```

The Host/operator's process supervisor owns this process. It binds only
`127.0.0.1`; normal shutdown closes outstanding requests and listener sockets.
A bind failure or invalid/expired certificate fails closed. Stop it when the
installation is detached. Setup does not edit any Agent settings or auto-start
an unreviewed background daemon. A changed installation/component slot must
be reverified before the supervisor launches it.

Use the returned HTTPS `destination` and optional `localTls` object in the
owner-only private Host config. `localTls` has exactly `certificatePem`,
`certificateDigest` (SHA-256 of DER certificate bytes), fixed loopback `upstream`,
and `gatewayConfigDigest`. The config digest in
the static launch and signed permission binds all four fields. Every request
includes the pinned gateway-config digest; the ingress rejects a mismatch before
reading credentials or forwarding. Restarting it with another upstream while
retaining the certificate therefore cannot redirect an already bound request. Custom certificate trust
is accepted only for literal `127.0.0.1`, requires a valid IP SAN and validity
period, and checks both the TLS certificate chain and exact leaf digest. It
never disables verification or uses operating-system trust installation.
Existing configs without `localTls` retain the normal trusted HTTPS behavior.

The ingress forwards only login POST and Secret GET/POST to the fixed literal
HTTP loopback Runtime. It retains Runtime auth, RBAC, tenant/workspace checks,
encrypted storage and audit; it never creates users or grants access. It does
not follow redirects, forward cookies, support arbitrary URLs, log bodies or
use proxies. The local HTTP hop retains the existing trusted-local-machine
boundary; this does not protect against a compromised Runtime or same-user
process. The signed deployment inspection must still identify the intended
local Runtime, its scope and effective storage encryption.

Before showing any private input, the production controller checks the pinned
TLS ingress and its fixed Runtime's `/health` response. This check proves
transport availability, not login authorization, encryption, LLM readiness or
Host permission. A failure collects no credentials and creates no replay claim.
The original permission and integrity checks still apply before and after input.

Certificate expiry or replacement requires explicit installation maintenance,
a new config digest, and fresh permission/deployment bindings. Do not silently
rotate a certificate in an active request. Preserve the replay ledger and
Runtime state when preparing the replacement installation.

Socket-level tests cover scoped trust in an empty-environment child, wrong
trust/leaf pins, drift, endpoint restrictions, redirects, Runtime unavailability,
and real Runtime auth/RBAC/Secret persistence with synthetic input. These are
not evidence of actual human permission or native positive input; they remain explicitly unverified under this release scope.

### Codex control-channel observer SDK

`codexPermissionRequest(binding)` describes a credential-free permission form.
`codexPermissionObserver(...)` validates an actual App Server
`mcpServer/elicitation/request` against the pinned thread, MCP server, request
scope and exact form. Its trusted `requestHumanPermission` callback must return
the complete displayed scope plus the human's decision. Only an exact ALLOW
produces a short-lived signed permission; cancellation, mismatches, exceptions,
model-supplied ALLOW fields and replay never do. No credentials enter elicitation.
The App Server client must establish actual event provenance and a real human
UI. Synthetic callback tests and the SDK's existence do not qualify a live Host.
The signed receipt still stays outside model-visible MCP arguments and results.

### Managed local Runtime token mode

An explicitly configured local token mode removes the Runtime password field.
This authenticates **EvoPilot Runtime**, not the external coding Agent Runtime.
The ordinary user still grants the exact Host permission and confirms the native
scope, then enters only the Provider API Key. First installation must already
have a registered local Runtime credential; this component does not create an
account, discover an arbitrary administrator token, refresh credentials or fall
back to a password prompt. Existing configs with `username` retain password mode.

For local token mode, omit `username` and configure `authentication` with exactly
`mode: "local-token"`, `credentialId`, `actor`, `role` (`operator` or `admin`) and
`credentialPublicKey` (Ed25519 PEM). The installation-scoped `localTls` binding is
required. Remote unmanaged token reuse is unsupported. The config digest binds
the authentication mode, identity, source id and verification key to the request.
The supplementary key authenticates only the local credential-source receipt;
it does not change optional Harness signing or grant Runtime permissions.

A reviewed trusted launcher may call `launchLocalTokenInput` from `launcher.mjs`
with pinned `configPath`, `configDigest`, `componentDigest`, the original
credential-free `request`, an abort signal and its trusted `credentialProvider`.
The provider must inspect its own authoritative Runtime credential registration
and confirm the real actor, role, tenant/workspace and Runtime destination. It
must not sign caller assertions, read model-selected files, or assume an empty
Secret list proves identity. The launcher's key and credential source are outside
model-controlled tools. This SDK does not supply a credential store or minting CLI.

The provider returns exactly `{token, attestation}`. The signed attestation uses
the existing canonical Ed25519 envelope and at most five-minute lifetime, with:

```text
schema=evopilot-local-runtime-credential/v1
binding=<exact requestBinding>
credentialId=<configured source identity>
actor=<configured actor>; role=<configured role>
tenantId=<configured tenant>; workspaceId=<configured workspace>
upstream=<pinned literal loopback HTTP Runtime origin>
tokenDigest=<SHA-256 of token bytes>
issuedAt=<epoch milliseconds>; expiresAt=<epoch milliseconds>
```

Only the inherited private descriptor 3 carries this packet to `run.mjs` (or
through the separately reviewed `mcp.mjs` bridge). The descriptor must be a pipe
or socket: regular files, argv, ordinary environment, stdin permission envelope,
MCP arguments/results and plaintext handoff files are not token transports.
Packet size and read lifetime are bounded. The native child never receives the
token. The controller verifies the attestation before input and again after the
human delay and before writing. A Runtime read checks availability, while the
trusted credential source establishes identity; Runtime still enforces actual
RBAC and membership on the write. A dishonest local signer cannot elevate a
viewer token. An uncertain write remains `UNKNOWN`, without replay.

Token-mode acceptance requires real credential-source provenance and actual
Codex permission/provider-only native input on the exact installed Candidate.
Synthetic signed fixtures, source tests and native self-test do not qualify that
path. Ordinary operation continues over MCP stdio and the local HTTP Runtime;
only the private credential channel uses the bound loopback TLS ingress.
