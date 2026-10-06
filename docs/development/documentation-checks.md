# Documentation checks

Documentation must work in the place readers receive it. A relative link that works in this repository can fail on npm when its target is outside the package or omitted by the package's `files` selection.

## Check npm package READMEs

From the repository root, run:

```bash
npm run verify:package-doc-links
npm run test:package-doc-links
```

The existing CI runs `npm run check`, which includes this package-documentation check after distribution validation. Its regression tests also run in the existing unit-test suite.

The first command checks the root README of every public workspace package. It obtains each file inventory using `npm pack --json --dry-run --ignore-scripts --offline --workspaces=false` in that package directory. It does not build, invoke lifecycle hooks, write tarballs, publish, or fetch external URLs. npm's local cache and logging behavior still apply.

Packages with a nonempty `prepare` script are rejected before npm starts, on every npm version. npm 10 can execute `prepare` even with `--ignore-scripts`, so the checker reports `READ_ONLY_INVENTORY_UNSUPPORTED` instead of risking an execution. The current public workspaces have no `prepare` scripts. `prepack` and `postpack` remain suppressed by `--ignore-scripts`; regression tests check both suppression and the explicit `prepare` refusal.

To select a package or obtain machine-readable results:

```bash
npm run verify:package-doc-links -- --package-root packages/cli
npm run verify:package-doc-links -- --package-root packages/cli --package-root packages/adapter-mcp --json
```

`--package-root` can also point at a separate npm package checkout. Without it, `--root <repository>` selects the workspace root. Relative arguments resolve from the current directory. Exit code `0` means the selected checks passed; `1` means a link or inventory check failed. JSON output from the script has schema `evopilot-package-documentation-check/v1` and scope `packed-root-readmes`; use `node scripts/check-package-doc-links.mjs --json` when the output must contain JSON only.

## What is checked

- Local inline and reference Markdown links and images in each packed root README, plus HTML `href` and `src` attributes on `a`, `img`, and `source` elements.
- Targets selected by npm, including directory links with packed children. Existence only in the source checkout is insufficient.
- Paths that escape the package, including encoded traversal, filesystem URLs, and absolute paths.
- Fragments in packed Markdown targets, using common GitHub heading IDs (including duplicate headings) and explicit HTML `id` or `name` anchors. A directory fragment requires a packed README.

Code examples and HTML comments are ignored. External URLs are skipped. The checker is dependency-free and covers these Markdown forms; it is not a complete Markdown renderer. It does not recursively check links in every packed document, validate fragments inside non-Markdown assets, inspect remote pages, or certify previously published tarballs. Build first if a README intentionally links to generated files; the check itself never creates missing targets.

## Fixing failures

| Failure | Correction |
| --- | --- |
| `TARGET_NOT_PACKED` | Include the target in the package's `files` selection, or use an absolute documentation URL if the page belongs only to the repository. |
| `PATH_ESCAPES_PACKAGE` | Replace repository-relative links such as `../../docs/…` with an absolute documentation URL. |
| `FRAGMENT_NOT_FOUND` | Update the fragment to match the target heading or explicit anchor. |
| `FRAGMENT_TARGET_UNRESOLVED` | Link to a specific packed Markdown file or include the directory's README. |
| `ROOT_README_MISSING_OR_AMBIGUOUS` | Supply exactly one root Markdown README in the package. |
| `PACKAGE_CHECK_FAILED` | Inspect the reported npm inventory or filesystem error before retrying. |

Keep package README installation instructions consistent with the [distribution guide](../operations/distribution.md). Repository-level link checks, the [contribution workflow](../../CONTRIBUTING.md), and `npm run verify:distribution` cover different concerns. Passing this check does not replace release acceptance or authorization.
