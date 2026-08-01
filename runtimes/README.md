# EvoPilot Runtime Assets

This directory stores runtime lock and supply-chain evidence for EvoPilot-managed runtime boundaries. These files are product evidence, not incidental test data.

## Layout

| Path | Purpose |
|---|---|
| `runtime-lock.json` | Versioned runtime lock for managed runtimes, image digests, health endpoints, SBOM, license, and vulnerability reports. |
| `code-upgrader/` | Dockerfile and boundary assets for the built-in code-upgrader runtime. |
| `sbom/` | Software bill of materials for managed runtime images. |
| `licenses/` | License reports for managed runtime images and upstream runtime components. |
| `vulnerabilities/` | Vulnerability reports for managed runtime images and current runtime dependencies. |

## Managed Runtime Contract

EvoPilot treats managed runtimes as auditable product dependencies. A runtime entry should define:

- runtime id and role
- implementation and version
- image and digest
- upstream base image and digest when relevant
- health endpoint
- SBOM path
- license report path
- vulnerability report path
- whether the runtime is required for production

The built-in code-upgrader runtime is currently locked as `evopilot-code-upgrader` and runs beside the API server and loop worker. Production readiness checks should verify both the runtime lock and the running service boundary.

## Validation

Use:

```bash
npm run verify:runtime-lock
npm run verify:production-assets
```

Use strict validation when a release gate requires every locked runtime artifact to be present and current:

```bash
npm run verify:runtime-lock:strict
```

Runtime evidence must remain tied to real runtime images, digests, health endpoints, SBOM, license reports, and vulnerability reports. Do not replace production runtime evidence with mock, fake, fixture-only, or chat-only proof.

## Related Docs

- [Runtime management](../docs/operations/runtime-management.md)
- [Deployment](../docs/operations/deployment.md)
- [Production release package](../docs/reference/release-package.md)
