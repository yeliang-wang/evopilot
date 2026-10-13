# M5 source publication and release preparation

All four source repositories are public and their M5 R1 CI runs passed. Parent commit `d4a9201169a82c36875bf6bc28c784fb3fb7122a` passed **441 tests** in [source run 38328075766](https://github.com/yeliang-wang/evopilot/actions/runs/38328075766). Its artifact `11781746590` has ZIP SHA256 `dffe37b209fed4d9a8d9da83a43b834d78e7a5532917ef0a0b265b9107158002`. The downloaded portable app was installed and passed the full synthetic MCP product journey; independent Linux/macOS bundle manifests matched. These retained results apply only to that immutable candidate, not future revisions. No Release publication is implied.

| Repository | Responsibility |
| --- | --- |
| [evopilot](https://github.com/yeliang-wang/evopilot) | Parent composition, portable assembly and distribution checks |
| [evopilot-runtime](https://github.com/yeliang-wang/evopilot-runtime) | Runtime source and package |
| [evopilot-harness](https://github.com/yeliang-wang/evopilot-harness) | Harness source and package |
| [evopilot-ontology](https://github.com/yeliang-wang/evopilot-ontology) | Ontology source and package |

Use Node **24.14.0** and npm. Start a source checkout with:

```sh
git clone --recurse-submodules https://github.com/yeliang-wang/evopilot.git
cd evopilot
```

Follow [source development](development.md) for locked child dependency installation, parent package binding and source checks. These commands require populated source checkouts; source tests and assembly tools are not shipped in the installed portable app. Installed-reference conventions remain described in [development](development.md).

The parent **Source and distribution checks** workflow runs on manual dispatch, pull requests and pushes to `main`, with read-only contents permission:

1. Recursively check out the pinned source, select Node 24.14.0, install locked child dependencies and bind the three local packages.
2. Run the existing full build, source checks and tests, then `artifacts:verify`. The verifier checks package contents and dependencies and rehearses installation using the cached dependencies.
3. Assemble the portable bundle with `node scripts/assemble-preview.mjs --artifacts "$RUNNER_TEMP/evopilot-artifacts" --out "$RUNNER_TEMP/evopilot-bundle"`.
4. Create a fresh distribution directory containing `evopilot-0.1.0-preview.tar.gz`, the three verified component tarballs in `runtime/`, `harness/` and `ontology/`, and each dependency-bearing component's own `dependency-lock.json`. Runtime has no dependencies and no retained dependency lock.
5. Record the exact checked-out parent SHA from `git rev-parse HEAD` and `git submodule status` in `source-revision.txt`. Generate `SHA256SUMS` for the bundle archive, component tarballs, retained locks and revision record.
6. Upload only that distribution using `actions/upload-artifact@v4`, with the commit SHA in its name, 14-day retention and failure if files are missing.

The CI artifact is candidate evidence, not an official Release or acceptance verdict. Distribution collection excludes raw audit paths, private reports, real workspaces and credentials; portable assembly uses its existing public-file whitelist. The expected [v0.1.0 Release URL](https://github.com/yeliang-wang/evopilot/releases/tag/v0.1.0) is pending publication. With Node 24.14.0 available, download the ready bundle and checksum file from the chosen candidate or eventual versioned Release, verify SHA256 against the independently pinned digest and `SHA256SUMS`, unpack the bundle, then follow [installation](installation.md). For a CI ZIP, verify its ZIP digest before unpacking and checking its internal sums. There is no automatic latest selection. Existing daily installations, data and credentials remain untouched.

## Prepare a release

The **Preview release preparation** workflow (`.github/workflows/release.yml`) and `scripts/release-gate.mjs` are common files reusable verbatim in all four repositories. They use Node 24.14.0 and no external reusable workflow. Dispatch separately in each repository:

| Input | Required value |
| --- | --- |
| `expected_commit` | Exact 40-character lowercase hexadecimal source commit |
| `source_run_id` | Positive numeric ID of this repository's completed, successful `.github/workflows/ci.yml` run at that exact SHA |
| `expected_digest` | 64-character lowercase SHA256: parent CI artifact **ZIP bytes**, or child's component **tarball bytes** from the already verified parent source CI distribution |
| `publish` | Boolean, default `false`; preparation always runs |
| `decision_ref` | Default empty; publication requires an explicit nonempty reviewed external authorization reference |

The checked-out commit must contain the workflow helper. The historical R1 result does not validate changed release mechanics: obtain successful source CI at the intended new exact commit before preparing that revision. Source events may be `push`, `workflow_dispatch` or a same-repository `pull_request`; foreign PR head repository IDs fail. Exact repository names and numeric IDs are pinned. A release preparation run cannot masquerade as source CI because its workflow path is not `ci.yml`.

For the parent, preparation retrieves artifact metadata from its source run with `gh api`, requires exactly one nonexpired artifact named `evopilot-0.1.0-preview-EXPECTEDCOMMIT`, and verifies its run, repository, SHA and digest. The ZIP is downloaded by artifact ID, hashed before reading its allowlisted entries, and checked against the original `SHA256SUMS`. The original revision record must match the parent HEAD and all three committed gitlinks. No accepted bundle is rebuilt. The eight distribution files are retained: portable archive, three component tarballs, two locks, revision record and checksum file. Component files are flattened; locks become `harness-dependency-lock.json` and `ontology-dependency-lock.json`. Tarball names and original revision bytes are retained, and checksums are rewritten for the flattened files.

For a child, preparation runs `npm ci --ignore-scripts --no-audit --no-fund` from its own lock, then `npm pack --ignore-scripts --json` into a fresh temporary directory. It validates the exact package filename and SHA256 against the verified parent's component digest. Harness and Ontology retain their own `package-lock.json` as the named dependency lock; Runtime needs no distributed lock. Each child gets its own exact `source-revision.txt` and `SHA256SUMS`.

Preparation adds generic public `release-notes.md` with role, scope, Node version, independent publication and exact repository/source/CI links. It uploads `release-ready-EXPECTEDCOMMIT` with 14-day retention, failing if files are missing. Job outputs are `artifactName` and `expectedCommit`. With `publish=false`, no tag or Release is created. Failed preparation retains diagnostic artifacts when available; review logs and retained evidence before any manual retry. No private decision contents belong in notes or distribution files.

## Publication decision and one-time operation

Release publication requires a separately validated external **M5 Evolution Target** and an explicit **human decision before** the operator dispatches `publish=true`. `decision_ref` is operator-supplied evidence, not a cryptographic signature or inherent proof of user approval. A publish input alone is not authority. This is a standard operator workflow, not a tamper-proof security sandbox; the validator provides technical checks only.

Only the separate publish job receives `contents: write` (plus `actions: read`). It downloads the prepared artifact with `actions/download-artifact@v4`, rechecks input strings and prepared files, and checks both Release and tag existence. An existing `v0.1.0` Release or any tag at that name fails with `inspect-existing-before-retry`; an uncertain lookup also fails. It never deletes or overwrites either. Repository/version concurrency does not cancel an in-progress operation.

After those checks, the job creates the lightweight `refs/tags/v0.1.0` at the exact commit, then runs `gh release create v0.1.0 --verify-tag --prerelease --latest=false --title 'EvoPilot 0.1.0 Preview' --notes-file release-notes.md` with only the prepared distributable files. Notes are the Release body, not an extra distribution asset. Failures or uncertain remote outcomes require manual reconciliation; there is no automatic retry or cleanup. In particular, a tag created before a later failure must be inspected rather than overwritten on rerun. No npm publication, floating latest selection or daily installation occurs.

The immutable initial M1 governance and [authoritative roadmap](roadmap/ROADMAP.md) remain the prior planning baseline. The baseline checker still evaluates that baseline, not the current M5 gate. The source-only `governance/github-m5.json` is an informational projection of the newer human instruction; it is not a signature or acceptance certificate and is not shipped in the portable app. The independent M5 gate and real candidate results remain external to source. Local M4 E01–E19 acceptance is established only by the separately verified, exact candidate-bound report; see [testing](testing.md) and the [current roadmap](roadmap.md). The old M1 gate, immutable M4 baseline, business APIs and plugin behavior are unchanged by release preparation.

Focused local verification is `node --test integration/e2e/release-gate.test.mjs` followed by `git diff --check`. Tests use fixtures and perform no network calls or real publication.
