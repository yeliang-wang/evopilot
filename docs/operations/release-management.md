# Release Management

> Build once, accept the exact Candidate, and promote those accepted bytes without rebuilding.

## Current publication

Runtime **6.3.3**, Evolution Expert **2.3.1** and independently published Harness **4.8.2** are the current verified releases. See [the current release ledger](../releases/current-release.md) for exact tags, packages, image and acceptance limits. The checklist below governs future releases; it does not create unfinished steps for these published versions.

Runtime Candidate `37407237313` and Expert Candidate `37407240219` share source `4c7c09b8be221d2feedef8fa5f12b00883ee33fc`, while retaining separate Target, acceptance and publication bindings. The [Runtime public record](../../governance/releases/runtime-6.3.3-publication-20261006.json) and [Expert public record](../../governance/releases/evolution-expert-2.3.1-publication-20261006.json) bind the unchanged accepted bytes to their distribution channels. Runtime has six new criteria and individual impact review of 419 inherited definitions; Expert has six new criteria and review of 400 inherited definitions. All 2,505 exact installed regression tests passed.

Live Codex observations are bounded to Skill discovery, read-only MCP/Runtime state and restart. No new model call, other live Host, native credential interaction or 90-minute soak is claimed. The campaign did not cut over the daily local installation or deploy a remote Runtime. Private independent project extensions 1.0.1 remain unchanged.

## Historical 6.3.2 and 6.3.1 campaigns

The following published identities, counts and companion versions retain their original campaign scope. They are not additional execution claimed by the current documentation patches.

Runtime **6.3.2** passed ten new criteria, four current cases, 2,414 exact installed regression tests and individual impact review of 409 inherited criteria. Candidate `37177531263`, source `05da3339b32468f3682eea8a1c2b31880a6c38a1`, is published with unchanged accepted bytes. See the [6.3.2 publication ledger](../../governance/releases/runtime-6.3.2-publication-20261004.json). The existing Codex-only and omitted-soak/native-input scope remains explicit.

The following **6.3.1 historical campaign** remains immutable. Runtime **6.3.1** completed exact installed acceptance, received separate user
authorization and has now been promoted with verified public GitHub, npm and GHCR
readbacks in the [publication ledger](../../governance/releases/runtime-6.3.1-publication-20261004.json).
The accepted run is `37133707977`, source
`f0adee70ac45d5da5d691cfa583eba03ee014eb0`, with 409 applicable criteria and
nine real cases passed. The sealed final local acceptance SHA256 is
`674cbf7ba7a16316ce9e3b8dccb4b11e882196d96f084309618ea9a33a8cf374`.
See [6.3.1 release notes](../releases/6.3.1.md) for exact installed regression,
real Goal/recovery evidence and the approved exclusions. The historical
acceptance record is not rewritten to add later release authority or publication.
The accepted artifact set was promoted without rebuilding. These public version
pointers were updated only after the actual GitHub, npm and GHCR results were verified.

That historical Runtime promotion reused the existing Expert 2.3.0 and Harness 4.8.1
releases. Independent local project extensions 1.0.1 are a private component,
not a public npm/GitHub release in this set. No new repository or public
extension publication is implied.

## Release Policy

EvoPilot release readiness has four layers:

| Layer | Purpose | Required Evidence |
| --- | --- | --- |
| Product release decision | Proves the control plane reached the requested target. | `GET /api/v1/release/decisions`, release evidence, criteria, blockers, risk register. |
| Open-source release package | Makes the public repository adoptable. | Tag, changelog, release notes, self-hosting docs, validation commands, security and contribution docs. |
| Immutable deployment artifact | Proves the production rollout can use a fixed artifact instead of rebuilding from a checkout. | Release archive, SHA256SUMS, SPDX SBOM, provenance, GHCR image digest metadata, ECS immutable compose template. |
| Distribution package | Proves new users can install or deploy without cloning the source tree. | Local package tarballs, GitHub Release package assets, empty-project install smoke, tagged `install.sh` / `install.ps1`, release install manifest, self-host installer output, Helm chart archive, npm publish workflow, and public npm registry install verification after publication. |

Do not claim a public release from `npm run check` alone. `npm run check` proves repository validation. The authoritative product verdict remains EvoPilot release governance.

This repository pipeline governs EvoPilot's own GitHub project release. It is
not an EvoPilot product `LifecycleDefinition`, `LifecycleRevision`,
`LifecycleBinding`, or `LifecycleRun`. Evolution Expert uses the installed
MCP products and qualified independent project providers to operate Runtime
and collect evidence. Provider output and repository automation do not become
product Lifecycle state or release authority. Retired Skill Suites are not an
operating entry or fallback.

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

## Release Checklist and Candidate-to-Release Sequence

The release pipeline is intentionally ordered as follows:

1. Merge or otherwise select one immutable commit that is inside an approved
   Evolution Target.
2. Dispatch `.github/workflows/release-candidate.yml` with that exact commit
   and Target id. It runs verification, builds the npm tarballs, source
   archive, Helm chart, installers, SBOM, provenance, checksums, and loadable
   container archive exactly once, then stores them as an immutable GitHub
   Actions Artifact.
   When the release includes the independently versioned Evolution Expert,
   dispatch `.github/workflows/evolution-expert-release-candidate.yml` with
   the same exact commit and the approved Expert Target. It builds only the
   Expert npm tarball, SPDX SBOM, provenance, and checksums under the Expert's
   own version and artifact namespace.
3. The handoff job downloads that artifact into a fresh directory outside the
   checkout, verifies every byte, and emits a digest-bound
   `evopilot-project-candidate-handoff/v1`. This state is `RC_READY`; it does
   not authorize release.
   Runtime and Expert produce separate handoffs. A joint Host campaign binds
   both exact handoffs and the declared compatibility pair; neither handoff
   grants authority to the other release unit.
4. Run the exact current and inherited acceptance matrix bound by the approved
   Target from the downloaded Candidate packages, including its required real
   Host and duration coverage. Preserve explicitly approved exclusions as skipped,
   never passed. For the accepted 6.3.1 scope, Codex is the sole real Host;
   native credential interaction is unverified and a new 90-minute soak is
   explicitly excluded. Do not rerun an excluded duration check as an implicit
   publication prerequisite or generalize that exception to another release.
   A checkout build is not installed acceptance evidence.
5. Bind the final acceptance result to the Candidate run, commit, handoff
   digest, and release-set digest. Obtain a separate Release Binding approval.
6. After both bindings exist, create each exact pre-existing tag at its accepted
   Candidate commit. Dispatch `.github/workflows/release-artifacts.yml` and
   then `.github/workflows/npm-packages.yml` for Runtime. Dispatch
   `.github/workflows/evolution-expert-release.yml` for the independent Expert
   GitHub Release and npm package. GitHub Release and GHCR use
   the protected `release` Environment; npm publication uses the dedicated
   `npm` Environment. The Environment split records channel-specific deployment
   history and secrets but does not add a duplicate required-reviewer gate.
   All promotion jobs download their exact Candidate run and promote accepted
   bytes; none may compile, pack, rebuild an image, or overwrite an existing
   release. The Expert workflow installs only the resulting public package in a
   fresh temporary project for signature, Skill, Core, CLI, and Runtime
   compatibility verification.

Run this deterministic contract check whenever the workflows change:

```bash
npm run verify:release-pipeline
```

The normal pull-request checks and local artifact dry run remain useful before
Candidate formation, but they are not a substitute for the Candidate artifact:

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
npm run evolution-expert:release:artifact
npm run verify:evolution-expert-release-artifact
npm run verify:release-pipeline
git diff --check
```

For broader product release evidence, use only the production or staging gates
required by that exact approved Target. The commands below are examples; the
6.3.1 duration exclusion means `release:soak:ga:active` is not a pending step
for this promotion:

```bash
npm run test:e2e:production
npm run release:soak:ga:active
evopilot release decisions --project <project-id> --target <release-target-id> --json
```

Stop if the product-native release decision is `NO-GO`, `BLOCKED`, missing, or has unresolved required criteria.

PRs that prepare a release should also preserve the uploaded PR artifacts from `.github/workflows/pr-artifacts.yml`: failure recovery matrix, release readiness report, built release assets, and verification output.

After the npm package workflow publishes a tag, verify the public registry path:

```bash
npm run verify:npm-registry -- --version 4.0.0
```

For v4.0.0, the Candidate installable path was the frozen GitHub Actions artifact set recorded in its Candidate handoff. Those accepted bytes are now public through GitHub Release, GHCR, and six exact-version npm packages. Future versions must repeat the same Candidate, acceptance, promotion, and public-verification sequence.

## Local installation and retirement boundaries

Publication does not install a user Host, deploy a remote Runtime or remove
legacy Suites. The reference installation separately completed default
apply/rollback/reapply and later performed explicitly authorized permanent
Suite cleanup. Preserve the original acceptance and transition records, then
append the actual cleanup and audit-relocation receipts. Do not rewrite
historical inventories or restore deleted Suite sources to make an obsolete
rollback gate pass. Future product recovery must bind the current installed
artifacts, private configuration and daily data in a new explicit transaction.
The separate reference-machine cleanup removed 76 legacy Suite roots containing
4,164 original files; the two non-Suite audit files from the failed-activation
cleanup were retained. Independent project journals and credentials remain outside Suite deletion.

## Tag Creation

Do not push a release tag before Candidate acceptance and exact Release
authorization. Create `v<runtime-version>` and
`evolution-expert-v<expert-version>` only at their accepted Candidate commits.
Promotion verifies the pre-existing remote tag before creating a draft GitHub
Release, uploads accepted assets without `--clobber`, and only then makes the
Release public. An exact draft may be resumed after byte comparison; any
conflicting tag, public Release, or asset fails closed. Never force-retag;
prepare a new version instead.

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

`.github/workflows/release-candidate.yml` forms the immutable Candidate set;
`.github/workflows/release-artifacts.yml` only promotes an accepted set.

`.github/workflows/evolution-expert-release-candidate.yml` independently forms
the `@evopilot/evolution-expert` Candidate set. It validates the Expert Target
and package version rather than the Runtime version, uses the
`evolution-expert-v<version>` tag namespace, and never publishes. Its expected
files are:

- `evopilot-evolution-expert-<version>.tgz`
- `evopilot-evolution-expert-<version>-sbom.spdx.json`
- `evopilot-evolution-expert-<version>-provenance.json`
- `SHA256SUMS`
- a separately uploaded `evopilot-evolution-expert-<version>-project-candidate-handoff.json`

`.github/workflows/evolution-expert-release.yml` is the independent Expert GA
path. It checks out reviewed promotion mechanics from the dispatch commit while
binding the older accepted Candidate commit, run, handoff, acceptance digest, and
release authorization. Its `release` Environment job verifies the exact tag,
creates or resumes a non-clobbering draft, and publishes the four accepted
assets plus the promotion record. Its dependent `npm` Environment job publishes
or integrity-reconciles only the accepted tarball with provenance, then performs
a fresh public install and verifies Registry signatures, the
`evopilot-expert` CLI, portable `skill/SKILL.md`, generated Codex adapter,
Expert Core digest, and the Runtime compatibility bound to that Candidate.
The immutable Expert **2.3.0** baseline was published with verified Runtime **6.3.0** compatibility;
see the [current release ledger](../releases/current-release.md). The historical
Runtime 6.3.1 compatibility campaign has verified that unchanged Expert release
against the exact installed maintenance candidate. Runtime promotion does not
republish Expert; its existing public tarball, tag and provenance remain
immutable. Compatibility evidence does not itself establish Runtime release
authority. The Expert Candidate workflow validates the exact
approved Target against the versioned corpus, compiles the current Runtime and
Expert source for regression tests, and assembles only the independent Expert
release set. Source compilation does not form or publish a Runtime Candidate.
The historical 2.2.1 recovery materializers and verifier are not successor build
inputs. The published Expert 2.2.0 / Runtime 6.2.0, Expert 2.1.0 / Runtime 6.1.0,
and Expert 2.0.0 / Runtime 6.0.0 compatibility evidence remains immutable
historical evidence and is not regenerated from the current source tree. Completion-recovery
Targets may append a lowercase, digest-bound qualifier to the versioned Expert
Target id; the workflow still verifies that the Target's declared version
equals the exact Expert package version.

Expected assets:

- `evopilot-<version>-source.tar.gz`
- `evopilot-<version>-sbom.spdx.json`
- `evopilot-<version>-provenance.json`
- `evopilot-<version>-image-metadata.json`
- `evopilot-<version>-container-image.tar` (the accepted archive is attached for reproducibility and loaded unchanged for GHCR promotion)
- `evopilot-<version>-helm-chart.tgz`
- `evopilot-contracts-<version>.tgz`
- `evopilot-client-<version>.tgz`
- `evopilot-cli-<version>.tgz`
- `evopilot-adapter-mcp-<version>.tgz`
- `evopilot-adapter-opencode-<version>.tgz`
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

Operators can use the tracked runbook script to resolve release metadata, deploy the pinned digest, and collect health/readiness/container-digest evidence:

```bash
npm run ecs:immutable-rollout -- \
  --version 4.0.0 \
  --host root@8.153.72.80 \
  --apply \
  --json
```

For rollback drills, provide both the rollback and forward release versions. The script deploys the rollback digest, verifies the service, then deploys the forward digest and verifies again:

```bash
npm run ecs:immutable-rollout -- \
  --rollback-version 1.1.2 \
  --forward-version 4.0.0 \
  --host root@8.153.72.80 \
  --apply \
  --json
```

Before using a release asset, verify checksums:

```bash
sha256sum -c SHA256SUMS
```

Do not treat a source checkout plus production build as immutable artifact deployment. That remains a valid source-ref rollout path, but it is weaker release evidence.

## npm Packages

Publish npm packages only after the exact Candidate has passed acceptance, a
separate Release Binding has been approved, and the GitHub Release is public.

The package publish order is:

1. `@evopilot/contracts`
2. `@evopilot/client`
3. `@evopilot/adapter-mcp`
4. `@evopilot/adapter-opencode`
5. `@evopilot/cli`
6. `create-evopilot`

Use `.github/workflows/npm-packages.yml` with the dedicated `npm` Environment
and its `NPM_TOKEN` secret. The Environment is limited to `main` and does not
add a second required reviewer; the separately bound release authorization
remains the human authority. The workflow downloads the same
Candidate run and publishes each accepted `.tgz` file directly with npm
provenance. It never publishes a workspace from a checkout. It then waits for
registry propagation and runs:

```bash
npm run verify:npm-registry -- --wait --timeout-ms 300000 --interval-ms 15000
```

This post-publish verifier checks exact-version npm metadata, installs all six
public packages into an empty project, and runs the `evopilot` and
`create-evopilot` help commands.

The Expert package is a seventh, independently versioned npm release unit.
`.github/workflows/evolution-expert-release.yml` publishes
`@evopilot/evolution-expert@<expert-version>` only after the Runtime packages
required by its declared compatibility range are publicly available.

The workflow checks out promotion mechanics from the exact workflow-dispatch
commit, while the handoff and tarball checks continue to bind the older
immutable Candidate commit. This permits reviewed verifier-only recovery after
Candidate acceptance without rebuilding or substituting product bytes.

## Rollback

Rollback is an operator action, not a Git-only action:

1. Stop new goal loop execution.
2. Preserve logs, release decision, audit, and `requestId` evidence.
3. Restore the previous image or checked-out tag.
4. Restore Postgres or file-state backup only if data migration introduced the fault.
5. Verify `/health`, `/ready`, worker queue, Dashboard proxy, and release decisions.
6. Record the rollback in `CHANGELOG.md` or the next release note.

## Historical Runtime 6.3.2 compatibility

The readiness-continuity maintenance Candidate was verified against unchanged public Expert 2.3.0 and Harness 4.8.1. The then-current compatibility command was `evopilot-expert compatibility codex 6.3.2`; the public Expert package still owns its existing 6.3.0 contracts dependency and is not republished by this Runtime patch. Candidate acceptance and actual publication are recorded independently in the current release ledger.

## Runtime 6.3.3 compatibility

The documentation maintenance pair is Runtime 6.3.3 and independently versioned Expert 2.3.1. Expert promotion invokes `scripts/verify-expert-public-install.mjs` on the public installation and exact accepted tarball. That verifier runs `compatibility` and `doctor` for the current Runtime and retained 6.3.2, 6.3.1, 6.3.0 and 6.2.0 versions across all five generated Host contracts, checking Runtime, Expert, Core and adapter identities. The workflow's direct 6.3.2 command remains an additional compatibility check. These declaration checks do not establish live acceptance of other Hosts.

New maintenance Targets bind current acceptance independently from the immutable historical semantic corpus. The release-readiness wiring check verifies the actual public-install verifier invocation and its current-version assertions. Publication status and exact Candidate identities remain in the [current release ledger](../releases/current-release.md).
