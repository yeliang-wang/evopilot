# Open Source Readiness

This checklist defines EvoPilot's public-product readiness baseline. It is intentionally about open-source trust and distribution, not about adding new runtime features.

## Positioning

EvoPilot is an evidence-driven control plane for AI-agent product evolution. It focuses on harness governance, goal loops, evidence, human approval, and release decisions. It is not an agent runtime or prompt playground.

## Public Trust Assets

| Asset | Status | Evidence |
| --- | --- | --- |
| README first screen | Present | `README.md` |
| License | Present | `LICENSE`, Apache-2.0 |
| Notice | Present | `NOTICE` |
| Changelog | Present | `CHANGELOG.md` |
| Contribution guide | Present | `CONTRIBUTING.md` |
| Security policy | Present | `SECURITY.md` |
| Code of conduct | Present | `CODE_OF_CONDUCT.md` |
| CI workflow | Present | `.github/workflows/ci.yml` |
| Release artifact workflow | Present | `.github/workflows/release-artifacts.yml` |
| npm package workflow | Present | `.github/workflows/npm-packages.yml`, `npm run verify:npm-registry` |
| Issue forms | Present | `.github/ISSUE_TEMPLATE/` |
| Pull request template | Present | `.github/pull_request_template.md` |
| AI Agent entrypoint | Present | `AGENTS.md`, `docs/cli/AGENTS.md` |
| API contract | Present | `docs/api/openapi.json` |
| Dashboard repository | External | `yeliang-wang/evopilot-dashboard` |
| Self-hosting guide | Present | `docs/operations/self-hosting.md` |
| Distribution guide | Present | `docs/operations/distribution.md` |
| Release playbook | Present | `docs/operations/release-management.md` |
| Release notes | Present | `docs/releases/1.1.6.md` |
| Immutable release artifacts | Present | `scripts/build-release-artifacts.mjs`, `scripts/verify-release-artifacts.mjs`, `deploy/ecs/compose.immutable.yaml` |
| Installable distribution | Present | `install.sh`, `install.ps1`, `installers/manifest.json`, GitHub Release package tarball specs, `packages/cli/`, `packages/client/`, `packages/contracts/`, `packages/create-evopilot/`, `charts/evopilot/`, `npm run verify:distribution`, `npm run verify:npm-registry` after npm publication |
| Open-source maturity report | Present | `docs/reference/open-source-maturity-report.md` |

## Product Evidence Assets

| Capability | Evidence |
| --- | --- |
| Harness governance | `docs/reference/project-harness-profile-schema.md`, `harness-templates/public/` |
| Template lifecycle | `docs/guides/harness-template-evolution.md` |
| Code structure boundaries | `docs/architecture/package-boundaries.md`, `scripts/verify-architecture-boundaries.mjs` |
| CLI automation | `docs/cli/AGENTS.md`, `docs/cli/quickstart.md`, `docs/cli/commands.md` |
| Goal loops | `docs/cli/workflows.md`, `docs/guides/ai-agent-runbook.md` |
| Release governance | `docs/reference/release-package.md`, `docs/reference/production-user-e2e.md` |
| Immutable deployment evidence | `docs/operations/release-management.md`, `deploy/ecs/compose.immutable.yaml`, `npm run release:artifact` |
| Distribution evidence | `docs/operations/distribution.md`, `install.sh`, `install.ps1`, `installers/manifest.json`, `.github/workflows/npm-packages.yml`, `scripts/verify-npm-registry-publication.mjs`, `charts/evopilot/`, `packages/create-evopilot/` |
| Logging and troubleshooting | `AGENTS.md`, `docs/cli/automation.md` |
| Source-to-GA examples | `examples/source-to-ga/` |
| Self-hosting and upgrade | `docs/operations/self-hosting.md`, `docs/operations/release-management.md` |

## Validation Commands

```bash
npm run cli:test
npm run check
npm run release:artifact
npm run verify:release-artifact
npm run verify:distribution
npm run verify:npm-registry # after npm publication
git diff --check
```

## Top-Tier Open Source Boundary

The repository now provides the assets needed for external users to understand, deploy, verify, contribute to, and operate EvoPilot. This is the open-source productization baseline. Public community maturity still depends on sustained releases, external adopters, issue traffic, contributor activity, and real-world case studies. Track the current assessment in [Open Source Maturity Report](open-source-maturity-report.md).

## What This Does Not Prove

This checklist does not prove community adoption, ecosystem maturity, external user satisfaction, star/fork growth, issue activity, or long-term release cadence. Those require public releases, external users, and sustained maintenance.
