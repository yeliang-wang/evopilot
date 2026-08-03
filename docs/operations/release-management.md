# Release Management

> Publish EvoPilot from validated control-plane evidence, not from a local build alone.

## Release Policy

EvoPilot release readiness has two layers:

| Layer | Purpose | Required Evidence |
| --- | --- | --- |
| Product release decision | Proves the control plane reached the requested target. | `GET /api/v1/release/decisions`, release evidence, criteria, blockers, risk register. |
| Open-source release package | Makes the public repository adoptable. | Tag, changelog, release notes, self-hosting docs, validation commands, security and contribution docs. |
| Immutable deployment artifact | Proves the production rollout can use a fixed artifact instead of rebuilding from a checkout. | Release archive, SHA256SUMS, SPDX SBOM, provenance, GHCR image digest metadata, ECS immutable compose template. |
| Distribution package | Proves new users can install or deploy without cloning the source tree. | npm package tarballs, empty-project install smoke, tagged `install.sh` / `install.ps1`, release install manifest, self-host installer output, Helm chart archive, and npm publish workflow. |

Do not claim a public release from `npm run check` alone. `npm run check` proves repository validation. The authoritative product verdict remains EvoPilot release governance.

## Versioning

Use semantic versions for public releases:

```text
vMAJOR.MINOR.PATCH
```

Rules:

- Do not move an existing public tag.
- Update `CHANGELOG.md` before tagging.
- Keep release notes under `docs/releases/`.
- Include operator impact, compatibility, migration, and validation evidence.
- Dashboard releases are separate from EvoPilot releases, but release notes must state the compatible EvoPilot API version.

Internal architecture-only changes do not automatically require a public release. Publish a patch release when the change alters the installable package graph, runtime launch path, deployment assets, CLI/Dashboard compatibility, or operator validation commands. For example, moving `loop-worker` behind `@evopilot/worker-runtime` is release-worthy once `npm run check`, release artifacts, and the applicable product evidence pass, because operators need the new package boundary and startup behavior documented.

## Release Checklist

Before tagging:

```bash
git status --short --branch
npm ci
npm run cli:test
npm run check
npm run test:failure-recovery
npm run release:ready
npm run verify:distribution
npm run release:artifact
npm run verify:release-artifact
git diff --check
```

For broader product release evidence, also run the applicable production or staging gates:

```bash
npm run test:e2e:production
npm run release:soak:ga:active
evopilot release decisions --project <project-id> --target <release-target-id> --json
```

Stop if the product-native release decision is `NO-GO`, `BLOCKED`, missing, or has unresolved required criteria.

PRs that prepare a release should also preserve the uploaded PR artifacts from `.github/workflows/pr-artifacts.yml`: failure recovery matrix, release readiness report, built release assets, and verification output.

## Tag And Push

```bash
git tag -a v1.0.0 -m "EvoPilot v1.0.0"
git push origin main
git push origin v1.0.0
git ls-remote origin refs/heads/main refs/tags/v1.0.0
```

If the tag already exists, do not retag by force. Create a new patch version after adding the new changelog and release notes.

## GitHub Release Notes

Use the corresponding file in `docs/releases/` as the GitHub Release body. Each release note must include:

- What changed.
- Who should upgrade.
- Compatibility with Dashboard and API clients.
- Validation commands and product evidence.
- Migration or rollback notes.
- Known limits.

If `gh` is unavailable, create the GitHub Release manually from the pushed tag and paste the release note body from this repository.

## Immutable Release Artifacts

Patch releases publish immutable deployment evidence from `.github/workflows/release-artifacts.yml`.

Expected assets:

- `evopilot-<version>-source.tar.gz`
- `evopilot-<version>-sbom.spdx.json`
- `evopilot-<version>-provenance.json`
- `evopilot-<version>-image-metadata.json`
- `evopilot-<version>-helm-chart.tgz`
- `evopilot-contracts-<version>.tgz`
- `evopilot-client-<version>.tgz`
- `evopilot-cli-<version>.tgz`
- `create-evopilot-<version>.tgz`
- `install.sh`
- `install.ps1`
- `evopilot-<version>-install-manifest.json`
- `SHA256SUMS`

The release archive is for inspection and reproducibility. Production deployment should prefer the immutable image reference recorded in `evopilot-<version>-image-metadata.json`:

```bash
export EVOPILOT_IMAGE='ghcr.io/yeliang-wang/evopilot@sha256:<digest>'
docker compose -p evopilot --env-file .env.production -f deploy/ecs/compose.immutable.yaml up -d --no-build
```

Before using a release asset, verify checksums:

```bash
sha256sum -c SHA256SUMS
```

Do not treat a source checkout plus production build as immutable artifact deployment. That remains a valid source-ref rollout path, but it is weaker release evidence.

## npm Packages

Publish npm packages only after the GitHub release and artifacts are clean for the exact tag.

The package publish order is:

1. `@evopilot/contracts`
2. `@evopilot/client`
3. `@evopilot/cli`
4. `create-evopilot`

Use `.github/workflows/npm-packages.yml` with a repository `NPM_TOKEN`. The workflow runs `npm run verify:distribution` and publishes with npm provenance from the requested tag.

## Rollback

Rollback is an operator action, not a Git-only action:

1. Stop new goal loop execution.
2. Preserve logs, release decision, audit, and `requestId` evidence.
3. Restore the previous image or checked-out tag.
4. Restore Postgres or file-state backup only if data migration introduced the fault.
5. Verify `/health`, `/ready`, worker queue, Dashboard proxy, and release decisions.
6. Record the rollback in `CHANGELOG.md` or the next release note.
