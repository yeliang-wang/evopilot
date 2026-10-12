# Source development

Use Node 24.14.0 and npm. The parent owns the canonical compatibility module; each child owns its ESM source, exact dependency declarations, tests and pinned vendor bytes. No sibling source or old installation is needed for an independent child checkout.

Each child installs from its own committed lock with `npm ci --ignore-scripts --no-audit --no-fund`. Parent bare public imports also require local package bindings. Do not regenerate locks during verification. Product dependencies remain exact: Runtime has none, Harness uses yaml 2.9.0, Ontology uses ajv 8.20.0 and yaml 2.9.0. Offline rehearsal requires those packages and their transitive dependencies already in npm's cache.

From each child source directory:

```sh
npm run check
npm run build
npm test
```

Build for these pure ESM packages verifies owned sources and the existing pinned vendor. It does not generate code or consult a parent. Run the same commands in an unrelated standalone copy with its own dependencies. Source-development scripts/tests are omitted from consumer tarballs.

From the populated parent, install dependencies and bind local packages before tests:

```sh
for product in runtime harness ontology; do
  npm --prefix "projects/evopilot-$product" ci --ignore-scripts --no-audit --no-fund
done
npm install --ignore-scripts --no-save --package-lock=false --no-audit --no-fund ./projects/evopilot-runtime ./projects/evopilot-harness ./projects/evopilot-ontology
npm run build
npm run check
npm test
npm run roadmap:check
```

The bindings use ignored parent node_modules and change neither package.json nor parent dependencies. Add --offline to npm commands only with all prerequisites and locked packages cached locally. A ready bundle installs without npm; fresh online distribution remains later M5 work. See [installation](installation.md).

These three bindings are the current local public packages: `@evopilot-next/runtime`, `@evopilot-next/harness` and `@evopilot-next/ontology`, each at `0.1.0`. The parent test glob includes `integration/e2e/local-acceptance.test.mjs`; its synthetic report-verifier unit fixtures do not establish Host acceptance. See [testing](testing.md) for focused checks and verification of a separate candidate report. Keep that private report outside the app, source checkout and real workspace; evidence updates do not require changing candidate documentation bytes.

Only the parent build regenerates canonical vendor copies; it never refreshes pins. The full parent suite remains separate from artifact verification. In restricted environments, `OPENSSL_CONF=/dev/null` avoids reading inaccessible system OpenSSL configuration.

For an authorized local artifact rehearsal, choose a new directory outside every source checkout whose parent already exists:

```sh
npm run artifacts:verify -- --out /absolute/operator-selected/new-artifacts
```

The verifier packs with scripts disabled, validates exact file inventory, paths, source digests, contract pin and product identity before extraction, then retains each dependency-bearing child's exact own lock as `dependency-lock.json` beside its tarball. This separate assembly material is not included by npm in the tarball. The verifier validates lock identity, direct dependencies and resolved records, copies those exact bytes to the extracted `package/package-lock.json`, and runs `npm ci --offline --ignore-scripts --no-audit --no-fund`. It compares the complete installed version/resolved/integrity inventory against the retained lock; npm ci verifies cached tarball integrity. Runtime asserts empty dependencies and performs no dependency resolution. Public subpaths run under Node permissions limited to that extracted package and its dependencies. Missing offline cache fails; no network fallback occurs. Output preserves tarballs and a JSON manifest with versions, package SHA256, own exports, explicit lock source/bundle paths and SHA256, resolved dependency inventory and smoke status, including partial failures. Existing output is refused. This is local package rehearsal, not GitHub release or product acceptance.

The operator separately initializes four local repositories and wires the three exact child commits as parent gitlinks and .gitmodules entries. Remote URLs and public URL metadata remain pending authorization; no final remote is assumed. After all source is committed and repositories are clean, report assembly evidence:

```sh
npm run components:lock
npm run components:lock -- --out /absolute/operator-selected/new-components.json
```

The lock command refuses missing/unpopulated children, inherited parent repositories, dirty/untracked source and index gitlinks differing from child HEADs. It never stages, commits or changes remotes. Output is deterministic for the same source commits and contract, and must not overwrite source or an existing file.

The four checked-in CI workflows are future configuration only: read-only contents permission, checkout/setup-node, lock-based child dependency installation and parent local package binding and source checks; the parent adds recursive checkout and offline artifact rehearsal. Their presence does not mean GitHub was authorized or CI ran. See [native authoring boundaries](architecture/0003-local-authoring.md).


The bundle assembler translates only relative Markdown product link destinations from projects/evopilot-OWNER to node_modules/@evopilot-next/OWNER. Prose, commands, code examples and absolute URLs remain unchanged. Source guide references resolve from the checkout; installedReferences resolve from the verified `installationRoot`, which already equals `managedRoot/app`. The packed children retain public licenses, provenance and documentation; no product implementation is duplicated or symlinked. Development commands above require a populated source checkout; the portable app omits source tests and assembly tools. It includes the public documentation, workspace templates, immutable governance baseline, report verifier and roadmap checker. The exact mapping is covered by the distribution tests described in [testing](testing.md).
