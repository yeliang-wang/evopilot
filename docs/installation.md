# Install EvoPilot Preview

## Current 0.6.0 candidate

The source tree builds a **0.6.0 Preview candidate**. Until an exact release is published, use its verified local bundle and the same installation commands below; do not infer a published download from the source version. Its plugin display name is **EvoPilot v0.6 Preview**. Inspect the actual version, installation ID, root and digest before activation. Core source is strict TypeScript and installed entry points are compiled JavaScript; see [language policy](language-policy.md).

Response writes advance Runtime/Harness database markers to **5**. Follow the [0.5 to 0.6 migration](migration.md#upgrade-from-v05-to-v060) before binding existing data. Keep a candidate on an isolated Workspace until package, recovery and actual Host acceptance succeed. Source tests and passive `doctor` do not prove a current Codex connection has refreshed. After updating a local plugin, restart the desktop app and verify it in a new chat as described by the [official plugin guide](https://developers.openai.com/plugins/build/plugins).

## Published 0.5.0 distribution

These instructions describe the v0.5.0 Preview distribution. Use an exact published release or a verified local candidate during acceptance. Publication, installed Host acceptance and daily cutover are separate. Preserve your previous installation and a verified pre-upgrade Workspace backup; online state uses owner database marker 4 and cannot be reopened by v0.4. Stop the independent online worker before backup, restore, relocation, toolchain maintenance or uninstall. Review [online Harness lifecycle and limits](online-harness.md).

Use **Node 24.14.0**. Download `evopilot-0.5.0-preview.tar.gz` and `SHA256SUMS` from the exact [v0.5.0 Preview release](https://github.com/yeliang-wang/evopilot/releases/tag/v0.5.0). Use immutable versioned Preview downloads, not a latest-stable selector. The bundle contains compiled JavaScript and needs no npm install or source build. Native validation additionally requires the explicitly prepared pinned toolchain; inspection never downloads it. It includes no Node executable, credentials, live configuration, business data or configured providers. Source builds belong to the [developer path](development.md).

## Verify and extract

In the directory containing both downloads, select exactly the bundle entry. This fails if the entry is missing or duplicated:

```sh
preview_checksum="$(awk '$2 == "evopilot-0.5.0-preview.tar.gz" && length($1) == 64 && $1 !~ /[^0-9a-fA-F]/ { line=$0; count++ } END { if (count != 1) exit 1; print line }' SHA256SUMS)" &&
  printf '%s\n' "$preview_checksum" | shasum -a 256 -c -
```

Continue only after verification succeeds. Checking the entire multi-asset `SHA256SUMS` requires every listed asset. Checksums detect changed bytes; they do not independently authenticate the publisher.

Choose a new extraction directory with an existing parent:

```sh
preview_bundle="/absolute/path/to/new-extracted-bundle"
mkdir "$preview_bundle" &&
  tar -xzf evopilot-0.5.0-preview.tar.gz -C "$preview_bundle"
```

## Install and register

Use canonical absolute paths without symlinks. The program root must be new with an existing parent, outside Git and separate from the source checkout and extracted bundle. Workspace setup happens later through the Expert. Upgrades use a new program root and preserve the previous verified installation until acceptance.

```sh
preview_root="/absolute/path/to/new-preview-program"
node "$preview_bundle/app/scripts/manage-preview.mjs" install --bundle "$preview_bundle" --root "$preview_root" --installation-id preview-install
node "$preview_bundle/app/scripts/manage-preview.mjs" doctor --root "$preview_root"
codex plugin marketplace add "$preview_root" --json
codex plugin add evopilot-v01-preview@evopilot-v01-preview-local --json
```

Installation does not create a Workspace. Program files live under `preview_root/app`; configuration `installationRoot` points to that directory. The later binding is stored beside the managed installation as `ROOT.evopilot-binding.json`, outside its immutable inventory. Public visibility never uploads data.

The installer verifies the inventory, renders Codex configuration with the current Node executable, and creates the private managed descriptor and local marketplace. Changed bytes, unexpected files, symlinks and hardlinks fail validation. `doctor` checks configuration and performs passive inspection. Installation itself does not activate a daemon or register the plugin; the Codex commands above register it.

Each installation receives a distinct MCP server name derived from its canonical configuration path. This keeps a candidate connection separate from a retained installation when both are registered. The plugin's display name alone does not prove which program is connected: before activation, inspect and compare its version, installation ID, root and digest. See [connection recovery](recovery.md#connection-recovery) if the Host still exposes an older connection.

Select the entry matching the installed bundle: **EvoPilot v0.5 Preview** for the published distribution above, or **EvoPilot v0.6 Preview** for the current verified local candidate. Request: “Inspect the installation, initialize my own Workspace, then activate and show the examples.” Compare its returned installation identity before proceeding. You may provide explicit project/state paths or use the defaults described in [Workspace](../workspace/README.md). Initialization is idempotent and does not overwrite an occupied directory or user edits. The Expert separately activates the current chat after successful setup. Existing users can request attachment of a validated, stopped Workspace; an already bound installation cannot silently switch to another Workspace.

Inspect and guide requests remain passive. Ordinary work then happens through the Expert without routine CLI operations. See [first journeys](first-journey.md), [Codex](codex.md), [migration](migration.md) and [provider limits](capabilities.md).

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

After initialization read the [native workflow](native-workflow.md). Use `toolchain_inspect` and explicit `toolchain_prepare`, then reactivate. Before upgrading existing data, stop the connection, verify a backup/recovery copy and preserve historical receipt bytes. An older installation must not open newly upgraded native state. Versioned installation roots allow an exact rollback using the preserved prior state, not an old reader against new tables.
