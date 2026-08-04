# Distribution

> Install, bootstrap, or deploy EvoPilot without cloning and manually wiring every repository.

EvoPilot distribution has three supported entry points. These labels match the root README CTA block:

| README CTA | Audience | Command |
| --- | --- | --- |
| Install CLI | Operators, CI jobs, and AI agents that already have a server | `npm install -g @evopilot/cli` |
| Self-host now | New operators bringing up a complete stack | `bash -c "$(curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v1.0.10/install.sh)"` |
| Kubernetes | Platform teams running EvoPilot on Kubernetes | `helm install evopilot ./charts/evopilot` |

The CLI and installer are release artifacts. They do not replace server-side RBAC, tenant/workspace scope, approval gates, source closure, release policy, or audit.

Desktop installer and hosted Cloud trial are not published EvoPilot distribution surfaces in this version. Do not present them as available install paths until the product ships a signed desktop package or a hosted tenant onboarding flow.

## npm CLI

Install the CLI after the npm package release is published:

```bash
npm install -g @evopilot/cli
evopilot --help
evopilot status --server https://evopilot.example.com --json
```

The CLI package depends on the published `@evopilot/client` and `@evopilot/contracts` packages. Release validation must prove that all three tarballs install together in an empty project.

## Self-Host Installers

Bootstrap from the tagged POSIX installer. It downloads the release manifest first and verifies the requested package/version boundary before calling `npx`:

```bash
curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v1.0.10/install.sh | bash -s -- --dir evopilot-stack
cd evopilot-stack
```

Windows operators can use the tagged PowerShell entrypoint:

```powershell
iwr https://raw.githubusercontent.com/yeliang-wang/evopilot/v1.0.10/install.ps1 -OutFile install.ps1
.\install.ps1 -Dir evopilot-stack
```

The manifest is published at `installers/manifest.json` in the release tag and as `evopilot-<version>-install-manifest.json` in GitHub Release assets. Use `--skip-manifest` only for an explicitly reviewed offline install.

Or generate directly from npm:

```bash
npx create-evopilot@1.0.10 self-host --dir evopilot-stack --init-env
cd evopilot-stack
```

Review `.env` before starting services. Do not leave unresolved LLM values in production.

```bash
docker compose up -d
./verify.sh
```

After `.env` has real LLM settings, the installer can start and verify the stack:

```bash
npx create-evopilot@1.0.10 self-host --dir evopilot-stack --start
```

The generated stack starts:

- EvoPilot API server
- loop worker
- code-upgrader runtime
- Postgres
- EvoPilot Dashboard

It uses published container images by default and keeps raw GitHub, GitLab, LLM, deploy, and password secrets out of command-line arguments.

## Helm Chart

Install from the repository chart path:

```bash
helm install evopilot ./charts/evopilot \
  --namespace evopilot --create-namespace
```

For production, create or reference a secret and override the placeholder values:

```bash
helm upgrade --install evopilot ./charts/evopilot \
  --namespace evopilot --create-namespace \
  --set auth.existingSecret=evopilot-prod-secrets \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=evopilot.example.com
```

The chart deploys the control-plane API, loop worker, code-upgrader, Postgres, Dashboard service, optional Ingress, and persistent volumes. Use `service.extraPorts` and `dashboard.service.extraPorts` when the platform needs additional Service ports for metrics, private health routing, or controlled previews.

Set `postgres.enabled=false` only when `postgres.externalDsn` is provided or `auth.existingSecret` contains `EVOPILOT_LOOP_STORE_DSN`. Set `persistence.enabled=false` only for disposable evaluation environments; the chart then uses an `emptyDir` volume for EvoPilot runtime data.

## Validation

Distribution readiness is checked with:

```bash
npm run verify:distribution
```

This command verifies:

- Helm chart structure, version, Service extra ports, and optional `helm lint` plus `helm template` render smoke when Helm is installed.
- npm tarballs for `@evopilot/contracts`, `@evopilot/client`, `@evopilot/cli`, and `create-evopilot`.
- Empty-project install smoke for the `evopilot` and `create-evopilot` binaries.
- Generated self-host stack files and initialized `.env` output.

Release artifacts also include npm package tarballs, `install.sh`, `install.ps1`, `evopilot-<version>-install-manifest.json`, and `evopilot-<version>-helm-chart.tgz`.

## Publishing

npm publication is a separate release action. The repository includes `.github/workflows/npm-packages.yml`, which publishes from an exact release tag with `NPM_TOKEN` and npm provenance enabled.

Do not publish npm packages from an unverified local checkout.
