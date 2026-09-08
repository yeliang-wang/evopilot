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
| Evolution Expert artifacts | `npm run evolution-expert:release:artifact && npm run verify:evolution-expert-release-artifact` | Builds and verifies the independent Expert npm Candidate, SPDX SBOM, provenance, checksums, and package identity. |
| Release pipeline contract | `npm run verify:release-pipeline` | Proves Candidate build-once, exact cross-run handoff, accepted-byte promotion, and separation from product Lifecycle objects. |
| Agent adapter conformance | `npm run test:agent-adapters` | Proves the first-class OpenCode adapter and one independent adapter use the same request/result contract and fail closed on hostile or uncertain execution. |
| Open Lifecycle non-functional | `npm run test:open-lifecycle:nonfunctional` | Emits resource, concurrency, cancellation, isolation, recovery, performance, security, observability/audit, documentation, and packaging evidence. |

## EvoPilot v4 Candidate Acceptance

The v4 Candidate campaign must run from exact frozen release packages, never
from the working checkout. AC18 closes only when the following assertion-level
matrix is present and every required report is bound to the same Candidate:

| AC18 concern | Required command or evidence | Pass boundary |
| --- | --- | --- |
| Security and secrets | `npm run audit:security`, hostile YAML/adapter tests, persisted-state secret scan | No high-severity advisory, executable YAML, authority bypass, or raw secret persistence |
| Resource limits | `npm run test:open-lifecycle:nonfunctional` | YAML, import, input, stage, retry, timeout and Adapter-output bounds fail closed |
| Concurrency and isolation | non-functional report plus API scope tests | Concurrent run identities remain unique; tenant/workspace cross-scope reads and mutations remain unavailable |
| Cancellation and recovery | non-functional report plus failure-recovery matrix | Cancellation is digest-bound; persisted runs and receipts resume without duplicate uncertain mutation |
| Observability and audit | request-correlation and Lifecycle audit tests | Every mutation retains request, actor, scope, binding and result identity |
| Performance and soak | non-functional report and `npm run release:soak:ga:active` | Declared latency/throughput thresholds pass and active workload soak has no unresolved blocker |
| Documentation and packaging | docs verification, `npm run release:ready`, release-artifact dry run and distribution smoke | All installable packages, schemas, SBOM, provenance, checksums and operating guidance match the Candidate |
| No regression | `npm run check`, v3 compatibility replay, RC01-RC04 | All 18 AC, 5 HIST, four real cases and `noRegression` are PASS |

Passing this matrix proves Candidate acceptance evidence. It does not itself
authorize installation, production access, publication, tagging, or Release.

Acceptance begins only after `.github/workflows/release-candidate.yml` has
formed the RC artifact set and the handoff job has downloaded it into a fresh
directory. Every acceptance report must bind the same Candidate run id,
commit, handoff digest, and release-set digest. Only after acceptance closes
may the independent Release Binding authorize the two promotion workflows.

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
- Package scripts include `check`, `cli:test`, `test:failure-recovery`, `release:ready`, `release:artifact`, `verify:release-artifact`, `verify:release-pipeline`, `test:e2e:production`, and `release:soak:ga:active`.
- Evolution Expert readiness includes its own changelog, artifact builder, verifier, private Candidate workflow, independent version binding, and immutable handoff.
- CI workflows exist for failure recovery, release readiness, Candidate formation, accepted-byte promotion, npm promotion, and PR artifacts.
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
| `.github/workflows/release-candidate.yml` | manual dispatch with exact commit and Target | Builds once, uploads immutable controlled RC assets, then fresh-downloads and binds the Candidate handoff. |
| `.github/workflows/evolution-expert-release-candidate.yml` | manual dispatch with the same exact commit and approved Expert Target | Builds only the independently versioned Expert Candidate set, fresh-downloads it, and binds a separate immutable handoff without publication. |
| `.github/workflows/release-artifacts.yml` | manual dispatch after acceptance and Release Binding | Promotes accepted assets to a new GitHub Release and the accepted image archive to GHCR without rebuild. |
| `.github/workflows/npm-packages.yml` | manual dispatch after public GitHub Release | Publishes the exact accepted `.tgz` files and verifies clean public installation. |

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
npm run evolution-expert:release:artifact
npm run verify:evolution-expert-release-artifact
npm run verify:release-pipeline
git diff --check
```

For product-native release evidence, also collect the applicable runtime gates:

```bash
npm run test:e2e:production
npm run release:soak:ga:active
evopilot release decisions --project <project-id> --target <release-target-id> --json
```

Stop on `NO-GO`, `BLOCKED`, `FAILED`, missing release decisions, missing artifacts, failed readiness checks, or any `nextAction` that requires repair or human approval.
