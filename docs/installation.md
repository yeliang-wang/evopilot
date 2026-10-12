# Local preview installation

This is a local-only 0.1.0 preview, requiring Node **24.14.0** on the destination machine. It bundles no Node executable, credentials, live configuration, business state, or default providers. No npm command or network access is needed to install a ready bundle. Package fixture tests are not three-product or Codex Host acceptance; actual product assembly and Host verification remain operator work.

## Assemble from source

In a qualified checkout with the actual three products populated, first run the existing offline artifact verifier with its locked dependency cache available. All path arguments below denote canonical absolute paths. Output directories must be new, their parents must exist, and artifacts and bundle must be outside the source checkout and each other.

```sh
node scripts/verify-artifacts.mjs --out ARTIFACTS
node scripts/assemble-preview.mjs --artifacts ARTIFACTS --out BUNDLE
```

The assembler rechecks package identities, version, smoke results, contract pin, tarball digests, extracted package bytes, retained dependency locks and installed dependency inventory. It copies only the parent whitelist and packed product files, with regular nested dependencies. Generated npm locks and `.bin` links are omitted. The bundle manifest inventories every app file. It records source tarball and lock hashes without developer paths. These local integrity records do not authenticate a publisher.

## Install a ready portable bundle

Copy the complete bundle to the destination. From its directory run:

```sh
node app/scripts/manage-preview.mjs install --bundle BUNDLE --root NEW_ROOT --workspace WORKSPACE --workspace-id preview-workspace --installation-id preview-install
node app/scripts/manage-preview.mjs doctor --root NEW_ROOT
```

The managed root must be new, canonical, outside Git, and separate from the source, bundle, workspace and control directory. The workspace may exist or be a missing final directory with an existing parent. Installation never writes it. Do not select an existing installation or business-data location as a new program root. Symlinks, hardlinked files, unexpected bundle files and changed bytes fail validation.

Installation renders `app/plugins/codex/.mcp.json` with the current Node executable, installed server and private root configuration. It creates a private managed descriptor and the local marketplace at `.agents/plugins/marketplace.json`. Configuration validation uses the installed code. PASS means complete local configuration and passive inspection succeeded; installation does not activate a daemon or register with Codex.

Register explicitly using the locally verified Codex plugin CLI commands:

```sh
codex plugin marketplace add NEW_ROOT --json
codex plugin add evopilot-v01-preview@evopilot-v01-preview-local --json
```

The marketplace is `evopilot-v01-preview-local`, with local plugin source `./app/plugins/codex` and AVAILABLE/ON_INSTALL policy. Existing and M0 plugin entries remain untouched. Select the preview and submit an EvoPilot task: this is sufficient explicit activation intent for the current chat, with no second enable confirmation. Pure guide requests remain passive; see [Codex](codex.md). Classification and legacy Catalog still require their documented trusted provider wiring; installation does not configure it.

For removal, first unregister **only this preview**:

```sh
codex plugin remove evopilot-v01-preview@evopilot-v01-preview-local --json
codex plugin marketplace remove evopilot-v01-preview-local --json
node app/scripts/manage-preview.mjs uninstall --root NEW_ROOT
```

Run the management command from the retained bundle, or use the corresponding installed `NEW_ROOT/app/scripts/manage-preview.mjs`. Unregistration is an operator prerequisite; the tool does not inspect private Codex databases. Uninstall verifies the exact managed inventory and uses authenticated stop for its own healthy daemon. Changed files, unknown files, stale ownership or active operations block removal. Only inventoried program files and empty managed directories are removed; workspace, control evidence and audit data remain. See [recovery](recovery.md).
