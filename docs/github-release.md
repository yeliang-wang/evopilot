# M5 source publication and release preparation

M5 source publication, remote CI and release preparation for 0.1.0 are authorized; source publishing is in progress. Final versioned Release publication is not yet authorized. This page describes the prepared workflow, not completed remote CI or GitHub release results.

| Repository | Responsibility |
| --- | --- |
| [evopilot](https://github.com/yeliang-wang/evopilot) | Parent composition, portable assembly and distribution checks |
| [evopilot-runtime](https://github.com/yeliang-wang/evopilot-runtime) | Runtime source and package |
| [evopilot-harness](https://github.com/yeliang-wang/evopilot-harness) | Harness source and package |
| [evopilot-ontology](https://github.com/yeliang-wang/evopilot-ontology) | Ontology source and package |

Use Node **24.14.0** and npm. Once the public source and pinned child commits are available, start a source checkout with:

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

The CI artifact is candidate evidence, not an official Release or acceptance verdict. Distribution collection excludes raw audit paths, private reports, real workspaces and credentials; portable assembly uses its existing public-file whitelist. There is still no stable Release download until a separately authorized Release is published, and no automatic latest selection. See [installation](installation.md) for installing an available ready bundle. Existing daily installations, data and credentials remain untouched.

The immutable initial M1 governance and [authoritative roadmap](roadmap/ROADMAP.md) remain the prior planning baseline. The baseline checker still evaluates that baseline, not the current M5 gate. The source-only `governance/github-m5.json` is an informational projection of the newer human instruction; it is not a signature or acceptance certificate and is not shipped in the portable app. The independent M5 gate and real candidate results remain external to source. Local M4 E01–E19 acceptance is established only by the separately verified, exact candidate-bound report; see [testing](testing.md) and the [current roadmap](roadmap.md). No remote CI success or published release is inferred from this preparation.
