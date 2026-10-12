# Source development

Use Node 24.14.0 and npm. The parent owns the canonical compatibility module; each child owns its ESM source, exact dependency declarations, tests and pinned vendor bytes. No sibling source or old installation is needed for an independent child checkout.

Harness and Ontology each install from their own committed lock with `npm ci --ignore-scripts --no-audit --no-fund`. The parent and Runtime need no install. Do not regenerate locks during verification. Product dependencies remain exact: Runtime has none, Harness uses yaml 2.9.0, Ontology uses ajv 8.20.0 and yaml 2.9.0. Offline rehearsal requires those packages and their transitive dependencies already in npm's cache.

From each child source directory:

```sh
npm run check
npm run build
npm test
```

Build for these pure ESM packages verifies owned sources and the existing pinned vendor. It does not generate code or consult a parent. Run the same commands in an unrelated standalone copy with its own dependencies. Source-development scripts/tests are omitted from consumer tarballs.

From the populated parent:

```sh
npm run build
npm run check
npm test
npm run roadmap:check
```

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

The four checked-in CI workflows are future configuration only: read-only contents permission, checkout/setup-node, lock-based dependency installation for Harness/Ontology only and source checks; the parent adds recursive checkout and offline artifact rehearsal. Their presence does not mean GitHub was authorized or CI ran. See [native authoring boundaries](architecture/0003-local-authoring.md).

