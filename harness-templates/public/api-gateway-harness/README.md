# API Gateway Harness

Domain-first HarnessTemplate for API gateway products.

Use this pack when EvoPilot is onboarding a gateway, ingress, traffic proxy, or service-mesh gateway product that needs route, upstream, policy, plugin, protocol, load, and observability evidence.

## Layers

- Domain: `api-gateway`
- Compatibility: `http-gateway`, `ingress-compatible`, `envoy-compatible`
- Architecture: `edge-gateway`, `service-mesh-gateway`, `multi-tenant-gateway`
- Runtime: `go`, `rust`, `java`, `node`, `generic`

## Administrator Flow

```bash
evopilot harness template pack validate harness-templates/public/api-gateway-harness --json
evopilot harness template pack publish harness-templates/public/api-gateway-harness --json
```
