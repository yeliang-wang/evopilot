# EvoPilot Deployment Assets

This directory contains committed deployment manifests for EvoPilot's API server, loop worker, code-upgrader runtime, and persistence services. It does not contain production secrets or host-local deployment state.

## Layout

| Path | Purpose |
|---|---|
| `docker-compose.prod.yml` | Production Compose reference for `evopilot-server`, `evopilot-loop-worker`, `evopilot-code-upgrader`, and Postgres. |
| `k8s/` | Kubernetes manifests for API server, code-upgrader runtime, service, persistent volume claim, and secret examples. |
| `../charts/evopilot/` | Helm chart for the API server, loop worker, code-upgrader, Postgres, Dashboard, services, optional Ingress, and persistent volumes. |

The standalone Dashboard is deployed from the separate `yeliang-wang/evopilot-dashboard` repository. EvoPilot deployment assets expose the control-plane API and background runtime services; Dashboard traffic should be routed to the dashboard service and `/api/*` traffic should be routed to EvoPilot.

## Production Boundary

Production deployments commonly have host-local files that are intentionally not tracked here:

- `.env.production`
- runtime data under `.evopilot/`
- deployment lock and stamp files
- host-specific `docker-compose.prod.yml` copies
- mirror-specific `Dockerfile` adjustments for regional package or image registries

Do not overwrite these host-local files during a normal source deployment. A production rollout should preserve secrets, data volumes, runtime locks, and any documented host-specific image mirror settings.

## ECS Rollout Shape

The current ECS-style rollout uses the server checkout as the source of truth, then rebuilds the production Compose services:

```bash
cd /opt/evopilot
git pull --ff-only origin main
docker compose -f docker-compose.prod.yml up -d --build
```

Validate the API after rollout:

```bash
curl -fsS http://127.0.0.1:19876/health
curl -fsS http://127.0.0.1:19876/ready
docker compose -f docker-compose.prod.yml ps
```

`/health` should return `status=UP`; `/ready` should return `status=READY`. Authenticated API checks require an operator or admin token and should use `evopilot ... --json` or direct JSON API calls with scoped credentials.

## Kubernetes Notes

`deploy/k8s/secret.example.yaml` is a template only. Store raw secrets in the deployment platform's secret manager or sealed-secret workflow, then expose them to EvoPilot as environment variables or server-side secret references. Do not commit real GitHub, GitLab, LLM, database, API, deploy, or password secrets.

For a packaged Kubernetes entry point, prefer the Helm chart:

```bash
helm install evopilot ../charts/evopilot --namespace evopilot --create-namespace
```

## Related Docs

- [Production deployment guide](../docs/operations/deployment.md)
- [Self-hosting guide](../docs/operations/self-hosting.md)
- [Release management](../docs/operations/release-management.md)
- [Runtime management](../docs/operations/runtime-management.md)
- [Production release package](../docs/reference/release-package.md)
