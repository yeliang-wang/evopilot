# Locked native toolchain

The parent owns `integration/toolchain/toolchain.lock.json` and its TypeScript
preparer. Exact native archives, pure Python wheels, tool versions, file hashes,
licenses and resource bounds are pinned. Preparation verifies downloaded bytes
before extraction; inspection reconstructs expected contents from those pinned
artifacts and rejects executable, dependency or Python-configuration drift.

The currently verified platform is **darwin-arm64**. Other platforms fail with
`TOOLCHAIN_UNSUPPORTED_PLATFORM`; they are not silently routed to global tools.
See the lock for exact Python, pySHACL, RDFLib, OPA and Conftest versions. Do not
confuse Conftest's embedded OPA version with the separate OPA CLI version.

After building the parent:

```sh
node dist/integration/toolchain/cli.js lock
node dist/integration/toolchain/cli.js prepare --cache /absolute/private/cache
node dist/integration/toolchain/cli.js inspect --cache /absolute/private/cache
```

Each command prints JSON only on success. `prepare --offline --mirror DIR` uses
pre-downloaded artifacts named by their SHA-256; absent or incorrect artifacts
fail. Inspection never downloads or repairs. Save successful inspect output to a
private JSON file and set `EVOPILOT_TEST_NATIVE_TOOLCHAIN` to that file when running
native validation tests. Do not publish the machine-specific executable paths.

Harness and Ontology include generated standalone entrypoints at
`vendor/compatibility/v1/toolchain/cli.js`, with the same commands and lock. They
need neither a parent checkout nor code fetched from another branch. The parent
alone regenerates these copies with `node scripts/sync-toolchain.mjs`; normal
builds check their exact bytes. `manifest.json` records each generated file and
the TypeScript source digests. Native validation still verifies the executable and
complete dependency content rather than trusting that metadata alone.

In the Codex plugin, `toolchain_inspect` checks the bound Workspace cache.
`toolchain_prepare` deactivates this session, stops the connection and returns
after admission. Downloads continue in that adapter while it remains alive;
the Workspace maintenance lease prevents concurrent preparation or activation.
Inspect progress with backoff. A retained `RUNNING` receipt is not readiness.
The same request ID reads its receipt without dispatching again. Another process
reports an unfinished receipt as `UNKNOWN`; diagnose the original operation and
retain its evidence rather than changing request IDs to bypass uncertainty.
After a terminal `FAILED`, an explicitly authorized new request can reuse only
complete hash-verified downloads. No partial artifact is cached. Each artifact
has a fifteen-minute body deadline; there is no automatic download retry.
Activate only after inspection verifies `ready=true`. Readiness is not an asset
approval, project completion or Host acceptance result.
