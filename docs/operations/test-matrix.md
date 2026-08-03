# Test Matrix

> Validate EvoPilot as a control plane, worker runtime, release-governed product, and public release package before a release or production rollout.

## Local Commands

| Layer | Command | Purpose |
| --- | --- | --- |
| Repository check | `npm run check` | Build, unit, smoke, functional, E2E, production assets, OSS governance, architecture, and security audit. |
| Failure recovery matrix | `npm run test:failure-recovery` | Runs control-plane blocker tests plus loop-worker retry and fallback tests, then writes `dist/test-matrix/failure-recovery-matrix.json`. |
| Release readiness | `npm run release:ready` | Checks version, changelog, release notes, test matrix docs, package scripts, CI workflows, PR artifacts, and `git diff --check`. |
| Production E2E | `npm run test:e2e:production` | Validates production-compatible runtime paths. |
| GA active soak | `npm run release:soak:ga:active` | Proves the GA release target with active workload, not health-only uptime. |
| Release artifacts | `npm run release:artifact && npm run verify:release-artifact` | Builds and verifies source archive, SPDX SBOM, provenance, image metadata, and checksums. |

## Failure Recovery Scope

`npm run test:failure-recovery` covers:

- Protected API rejection with `401`, `UNAUTHORIZED`, and `x-request-id`.
- Source credential preflight returning `evopilot-source-credential-readiness/v1`, `READ_ONLY`, `connect-github-account`, and blockers.
- DevOps preflight returning `evopilot-project-devops-readiness/v1`, `BLOCKED`, `configure-devops`, and readiness evidence.
- Explicit project LLM profile binding failure returning `LLM_PROFILE_NOT_READY`, `evopilot-llm-profile-readiness/v1`, `BLOCKED`, and `configure-llm-profile`.
- Source closure preflight returning `evopilot-source-closure-preflight/v1`, `FAIL`, `repair-credentials`, and recorded evidence.
- Loop worker transient retry through `loop-worker.request-retry`.
- Loop worker fallback API URL through `EVOPILOT_BASE_URL_FALLBACKS`.

The matrix writes a JSON report to `dist/test-matrix/failure-recovery-matrix.json`. CI uploads that report for PR review.

## Release Readiness Scope

`npm run release:ready` is a read-only gate. It does not tag, push, create GitHub Releases, publish assets, or deploy production.

It verifies:

- `CHANGELOG.md` mentions the current package version.
- `docs/releases/<version>.md` exists and mentions the current version.
- Test-matrix docs, failure recovery scripts, release readiness scripts, and failure-recovery tests exist.
- Package scripts include `check`, `cli:test`, `test:failure-recovery`, `release:ready`, `release:artifact`, `verify:release-artifact`, `test:e2e:production`, and `release:soak:ga:active`.
- CI workflows exist for failure recovery, release readiness, release artifacts, and PR artifacts.
- PR artifacts workflow runs repository checks, failure recovery, release artifact build, release artifact verification, and uploads artifacts.
- `git diff --check` passes.

The readiness report is written to `dist/test-matrix/release-ready.json`.

## CI Workflows

| Workflow | Trigger | Evidence |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push to `main`, pull request | Full `npm run check`. |
| `.github/workflows/failure-recovery.yml` | push to `main`, pull request | Failure recovery matrix JSON. |
| `.github/workflows/release-ready.yml` | push to `main`, pull request | Release readiness JSON. |
| `.github/workflows/pr-artifacts.yml` | pull request | Full check, failure recovery, release readiness, release artifacts, verification output, uploaded review artifacts. |
| `.github/workflows/release-artifacts.yml` | tag, manual dispatch | Immutable GitHub Release assets. |

## Release Readiness Gate

Before tagging a release, collect:

```bash
git status --short --branch
npm ci
npm run cli:test
npm run check
npm run test:failure-recovery
npm run release:ready
npm run release:artifact
npm run verify:release-artifact
git diff --check
```

For product-native release evidence, also collect the applicable runtime gates:

```bash
npm run test:e2e:production
npm run release:soak:ga:active
evopilot release decisions --project <project-id> --target <release-target-id> --json
```

Stop on `NO-GO`, `BLOCKED`, `FAILED`, missing release decisions, missing artifacts, failed readiness checks, or any `nextAction` that requires repair or human approval.
