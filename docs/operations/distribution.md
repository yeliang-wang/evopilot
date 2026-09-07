# Distribution

> Install, bootstrap, or deploy EvoPilot without cloning and manually wiring every repository.

EvoPilot distribution has three supported entry points. These labels match the root README CTA block:

| README CTA | Audience | Command |
| --- | --- | --- |
| Install CLI | Operators, CI jobs, and AI agents that already have a server | `npm install -g @evopilot/cli@4.0.0` |
| Self-host now | New operators bringing up a complete stack | `bash -c "$(curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v4.0.0/install.sh)"` |
| Kubernetes | Platform teams running EvoPilot on Kubernetes | `helm install evopilot ./charts/evopilot` |

The CLI, stdio MCP adapter, OpenCode runtime adapter, and installer are release artifacts. They do not replace server-side RBAC, tenant/workspace scope, approval gates, source closure, release policy, or audit.

The Open Lifecycle Harness release set and public npm registry contain `@evopilot/adapter-mcp@4.0.0`. Install that exact version in a third-party Agent host environment to obtain the `evopilot-mcp` executable. Candidate acceptance still uses the frozen Candidate tarball rather than a source checkout.

The same release set contains `evopilot-adapter-opencode-<version>.tgz`. The
adapter does not bundle OpenCode or provider credentials. Candidate acceptance
binds an exact external `opencode-ai` version and provider/model route, while
credentials remain in OpenCode's or the Host's configured secret environment.

Desktop installer and hosted Cloud trial are not published EvoPilot distribution surfaces in this version. All six v4.0.0 npm packages are public and exact-version verified; do not describe any later npm version as available until its own public-registry verification passes.

## CLI Release Tarballs

Install the CLI from the GitHub Release tarball set when you already have an EvoPilot server:

```bash
npm install -g \
  https://github.com/yeliang-wang/evopilot/releases/download/v4.0.0/evopilot-contracts-4.0.0.tgz \
  https://github.com/yeliang-wang/evopilot/releases/download/v4.0.0/evopilot-client-4.0.0.tgz \
  https://github.com/yeliang-wang/evopilot/releases/download/v4.0.0/evopilot-cli-4.0.0.tgz
evopilot --help
evopilot status --server https://evopilot.example.com --json
```

The public npm registry is also verified for v4.0.0:

```bash
npm install -g @evopilot/cli@4.0.0
evopilot --help
```

## Self-Host Installers

Bootstrap from the tagged POSIX installer. It downloads the release manifest first, verifies the requested package/version boundary, and resolves `create-evopilot` to the matching GitHub Release tarball by default:

```bash
curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v4.0.0/install.sh | bash -s -- --dir evopilot-stack
cd evopilot-stack
```

Windows operators can use the tagged PowerShell entrypoint:

```powershell
iwr https://raw.githubusercontent.com/yeliang-wang/evopilot/v4.0.0/install.ps1 -OutFile install.ps1
.\install.ps1 -Dir evopilot-stack
```

The manifest is published at `installers/manifest.json` in the release tag and as `evopilot-<version>-install-manifest.json` in GitHub Release assets. Use `--skip-manifest` only for an explicitly reviewed offline install.

After public npm publication, operators may explicitly opt into the registry package spec:

```bash
curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v4.0.0/install.sh \
  | EVOPILOT_INSTALL_PACKAGE_SPEC=create-evopilot@4.0.0 bash -s -- --dir evopilot-stack
cd evopilot-stack
```

Review `.env` before starting services. Do not leave unresolved LLM values in production.

```bash
docker compose up -d
./verify.sh
```

After `.env` has real LLM settings, the installer can start and verify the stack:

```bash
curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v4.0.0/install.sh | bash -s -- --dir evopilot-stack --start
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
- Local release tarballs for `@evopilot/contracts`, `@evopilot/client`, `@evopilot/cli`, `@evopilot/adapter-mcp`, `@evopilot/adapter-opencode`, and `create-evopilot`.
- Empty-project install smoke for the `evopilot` and `create-evopilot` binaries.
- Generated self-host stack files and initialized `.env` output.

Release artifacts also include package tarballs (including the installable stdio MCP and OpenCode runtime adapters), `install.sh`, `install.ps1`, `evopilot-<version>-install-manifest.json`, and `evopilot-<version>-helm-chart.tgz`.

After npm publication, verify the public registry path separately:

```bash
npm run verify:npm-registry -- --version 4.0.0
```

This command checks exact-version npm metadata for all six packages, installs them into an empty project from the public registry, then verifies the `evopilot` and `create-evopilot` binaries.

## Publishing

npm publication is a separate release action after Candidate acceptance and
the independent Release Binding. `.github/workflows/npm-packages.yml`
downloads the exact GitHub Actions Candidate run, verifies its handoff, and
publishes the already accepted tarballs directly with npm provenance. It does
not check out a tag to rebuild or repack workspaces. Post-publication it runs:

```bash
npm run verify:npm-registry -- --wait --timeout-ms 300000 --interval-ms 15000
```

Do not publish npm packages from an unverified local checkout or from bytes
reconstructed after Candidate acceptance.

The npm workflow uses the dedicated GitHub `npm` Environment. GitHub Release
and GHCR promotion continue to use `release`; this keeps deployment history and
credentials channel-specific without adding a second required-reviewer gate.
