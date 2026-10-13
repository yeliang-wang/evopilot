# Install EvoPilot 0.1.1 Preview

Use **Node 24.14.0**. Download `evopilot-0.1.1-preview.tar.gz` and `SHA256SUMS` from the exact [v0.1.1 Preview release](https://github.com/yeliang-wang/evopilot/releases/tag/v0.1.1). Use immutable versioned Preview downloads, not a latest-stable selector. The bundle contains compiled JavaScript and needs no npm install or source build. It includes no Node executable, credentials, live configuration, business data or configured providers. Source builds belong to the [developer path](development.md).

## Verify and extract

In the directory containing both downloads, select exactly the bundle entry. This fails if the entry is missing or duplicated:

```sh
preview_checksum="$(awk '$2 == "evopilot-0.1.1-preview.tar.gz" && length($1) == 64 && $1 !~ /[^0-9a-fA-F]/ { line=$0; count++ } END { if (count != 1) exit 1; print line }' SHA256SUMS)" &&
  printf '%s\n' "$preview_checksum" | shasum -a 256 -c -
```

Continue only after verification succeeds. Checking the entire multi-asset `SHA256SUMS` requires every listed asset. Checksums detect changed bytes; they do not independently authenticate the publisher.

Choose a new extraction directory with an existing parent:

```sh
preview_bundle="/absolute/path/to/new-extracted-bundle"
mkdir "$preview_bundle" &&
  tar -xzf evopilot-0.1.1-preview.tar.gz -C "$preview_bundle"
```

## Install and register

Use canonical absolute paths without symlinks. The program root must be new; its parent and the workspace parent must exist. Keep the program root and workspace outside Git and separate from the source checkout, extracted bundle and each other. The adjacent `WORKSPACE.evopilot-control` directory must also be separate. Use a dedicated Preview workspace; do not replace daily installations or data.

```sh
preview_root="/absolute/path/to/new-preview-program"
preview_workspace="/absolute/path/to/new-preview-workspace"
node "$preview_bundle/app/scripts/manage-preview.mjs" install --bundle "$preview_bundle" --root "$preview_root" --workspace "$preview_workspace" --workspace-id preview-workspace --installation-id preview-install
node "$preview_bundle/app/scripts/manage-preview.mjs" doctor --root "$preview_root"
codex plugin marketplace add "$preview_root" --json
codex plugin add evopilot-v01-preview@evopilot-v01-preview-local --json
```

The workspace may exist or be a missing final directory. Installation does not write workspace data. Runtime, Harness and Ontology own public and private data there when used; public visibility does not upload anything. Program files live under `preview_root/app`; configuration `installationRoot` already points to that `app` directory.

The installer verifies the inventory, renders Codex configuration with the current Node executable, and creates the private managed descriptor and local marketplace. Changed bytes, unexpected files, symlinks and hardlinks fail validation. `doctor` checks configuration and performs passive inspection. Installation itself does not activate a daemon or register the plugin; the Codex commands above register it.

Select **EvoPilot v0.1 Preview** and submit your first task. That activates the current chat, checks the shared daemon and starts it if absent. Inspect and guide requests remain passive. Ordinary work then happens through the Expert without routine CLI operations. See [first journeys](first-journey.md), [Codex](codex.md) and [provider limits](capabilities.md).

## Recovery and removal

For a stale connection, inspect with `doctor` and follow [recovery](recovery.md). Use the applicable command for the diagnosed installation:

```sh
node "$preview_bundle/app/scripts/manage-preview.mjs" stop --root "$preview_root"
node "$preview_bundle/app/scripts/manage-preview.mjs" recover --root "$preview_root"
```

Do not delete control evidence to bypass recovery. An uncertain operation requires its exact retained receipt, not redispatch.

To remove this Preview, unregister its entry first, then uninstall from the retained bundle:

```sh
codex plugin remove evopilot-v01-preview@evopilot-v01-preview-local --json
codex plugin marketplace remove evopilot-v01-preview-local --json
node "$preview_bundle/app/scripts/manage-preview.mjs" uninstall --root "$preview_root"
```

The manager is also at `preview_root/app/scripts/manage-preview.mjs`. Uninstall verifies the exact managed inventory and uses authenticated stop for its own healthy daemon. Changed or unknown files, stale ownership and active operations block removal. It removes only inventoried program files and empty managed directories; workspace data, control evidence and audit records remain. Other installations and plugin entries stay in place.
