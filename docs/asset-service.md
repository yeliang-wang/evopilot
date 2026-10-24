# Standalone read-only asset consumption

The v0.8 implementation includes an explicit standalone HTTP entry. It reads exact published Ontology and Harness packages through their public owner APIs. It needs no Codex activation, Runtime Goal or business Run. Source tests are not release or actual Host acceptance.

Build the parent and its three child packages, then run:

```sh
node scripts/asset-service.mjs --config /absolute/private/service.json
```

The configuration file, authorization file and toolchain file must be owned, regular, unlinked private files with mode `0600`. Use an explicit existing workspace. Starting the service does not change the daily installation binding.

```json
{
  "schema": "evopilot-asset-service/v1",
  "workspaceRoot": "/absolute/private/protected-state",
  "workspaceId": "example-workspace",
  "host": "127.0.0.1",
  "port": 8088,
  "tls": null,
  "authorizationFile": "/absolute/private/authorization.json",
  "toolchainFile": "/absolute/private/verified-toolchain.json"
}
```

Loopback can use HTTP. A non-loopback listener requires `tls: {"keyFile":"/absolute/private/key.pem","certFile":"/absolute/cert.pem"}`; plaintext non-loopback startup fails. TLS 1.2 or later is required. This is a local service configuration, not an authorization to deploy remotely. Clients must validate the certificate. Set `toolchainFile` to null only when operations requiring the RDF toolchain are not needed; missing prerequisites produce an unavailable result.

The authorization document has schema `evopilot-asset-authorization/v1` and a `credentials` array. Each credential contains `id`, `tokenDigest` (SHA-256 of a high-entropy bearer token), `enabled` and `grants`. Each grant binds one exact `scope`, an `assets` array of full native references, an `inventories` array of exact inventory digests and an `assessments` array of assessment IDs. Empty arrays grant no such access. Never store a raw bearer token in this document. Deliver tokens through an appropriate private channel and use an HTTPS connection outside loopback. The service rereads authorization before each request and after evidence reads, so revocation also prevents delivery of a pending response.

Send JSON with `POST /v1/assets`, `Content-Type: application/json` and `Authorization: Bearer <token>`. The envelope is exactly `{operation, scope, input}`. There are no mutation, execution, publication or approval routes, URL tokens, CORS grants or redirects. Requests carrying an `Origin` header are rejected. Authenticated `GET /v1/projects` returns only the credential’s authorized scope metadata. The service exposes JSON APIs and does not serve a Dashboard or browser client.

| Operation | Input | Result |
| --- | --- | --- |
| `assets.discover` | `{limit, cursor}`; initially use a null cursor | Explicit granted asset identities, bounded page and pinned inventory cursor |
| `assets.export` | `{reference}` | Exact native root and transitive dependency closure with content digest |
| `assets.query` | `{reference, query}` | Existing owner-readable query over a verified published package and pinned readable snapshot |
| `assets.specification` | `{inventoryDigest, specificationDigest}` | Normative cited text from the frozen inventory binding, exact specification, omitted-file report and projection digest |
| `assets.compare` | `{before, after, query: {limit, cursor}}` with exact references for the same asset | Owner-readable differences with both version and snapshot identities |
| `assets.assessment` | `{id}` | Owning Harness target, verified level, status, freshness and exact result version |

Discovery cursors bind the granted inventory. Query cursors bind the owner snapshot and filter; changed pins reject reuse. No operation resolves `latest`. Partial or altered dependency closures fail. Public dependencies are limited to the requested project or the shared public namespace; private materials remain project scoped.

`verifyAssetBundle` in `dist/integration/consumption/assets.js` verifies a saved export offline. It checks the complete transitive closure, each package and reference, the enclosing digest and scope. Verification proves byte integrity and declared closure; it does not grant a semantic level or software equivalence.

Specification export is deliberately a different object from a native package. It includes only citations admitted as normative by the frozen inventory. Paths containing original sources, tests, observations, package caches, executables or implementation-language files are refused. Unreferenced material is listed as omitted. It returns `completeness: NOT_ASSESSED` and `verifiedLevel: null`; the independently reviewed assessment and protected reconstruction receipts remain necessary. The consumer must keep original assets and audit inputs outside the builder's input directory. An export alone is not a filesystem or network sandbox.

Limits are 16 KiB per request, 8 MiB per response, 64 assets per closure, 50 discovery entries per page, four active reads, 120 requests per credential per minute, five seconds per provider read and fifteen seconds per operation. Errors disclose finite codes, not provider exceptions or credential values. No mutation is performed to serve these reads.

The standalone default host does not assert a current assessment when a trusted current-pin reader is absent. Historical results remain available, while current freshness is unknown and the displayed verified level is null. Supplying a caller flag cannot change this. Real pilot, actual installed Host and release acceptance remain outstanding. Graphical frontend implementation and browser acceptance are excluded before v1.0 release. See [delivery execution](asset-usability-v08-delivery.md).
