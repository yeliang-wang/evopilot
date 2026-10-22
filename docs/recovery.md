# Preview diagnosis and recovery

## Workspace backup and restore

Ask the Expert to back up the configured project and state to a new separate private directory. Backup and migration hold a process-safe workspace lease and stop the verified daemon. Active requests or uncertain identity block maintenance. The OS releases a lease when its holder exits; this does not establish success of interrupted work.

Backups include editable project files and owner databases, assets, receipts and audit. Live PID/socket/token files and coordination sidecars are not restored into state. Original control/audit and maintenance journals remain beside the original state. Treat backups as private; do not include them in product releases.

The v0.7 checked copier accepts at most 128,000 entries and 8 GiB per inventoried root, with a 2 GiB per-file limit and 4 MiB transfer chunks. Internal relative links are retained without traversal; unsafe links, hardlinks, foreign ownership and writable-by-others files are rejected. See [bounded maintenance](preflight-maintenance.md). An optional private Git directory is part of the project backup; review its contents before sharing any backup.

Restore requires the exact backup manifest pinned by the retained maintenance journal. Foreign or self-rehashed backups are insufficient. It supports only the same host/uid and original canonical roots, both missing or empty. Retain backup anchors and requests under `STATE_ROOT.evopilot-maintenance/{known-backups,requests}` and relocation keys under `~/.local/share/evopilot/relocation-keys`. Copying project/state directories alone is not cross-machine disaster recovery.

After interruption, preserve request ID, journal and partial destination. Resume only the exact operation when its phase permits it. Never delete a journal to force retry. Restore and migration do not grant decisions, switch bindings or replay dispatches; verify owner snapshots before activation.

## Native toolchain cache during maintenance

v0.7 includes cache bytes and supported internal relative links in its verified backup. Absolute or external cache links remain unsupported; a verified generated cache containing them still requires the explicit preservation procedure below. Never silently omit files. The older v0.5/v0.6 copier also has the size and link limitations described below.

In v0.5.0, Workspace backup and relocation do **not** automatically exclude `STATE_ROOT/native-toolchain`. The pinned Python environment contains symbolic links, and a native executable can exceed the copier's 64 MiB file limit. A direct backup with this generated cache present can therefore fail with `MAINTENANCE_PERMISSIONS` or `MAINTENANCE_LIMIT`. Stopping the worker alone does not remove this limitation; do not weaken the copier or follow these links.

A same-host operator can preserve the cache separately while backing up business data:

1. Stop the independent worker and acquire the installed client's `withWorkspaceMaintenance` lease. It verifies and stops the shared connection. Keep that lease for the entire operation below.
2. Verify the exact cache with the installed `inspectNativeToolchain`. Require its canonical path and a new, private sibling destination outside both Workspace roots. Retain a recovery note with those exact paths.
3. Rename only the verified generated `native-toolchain` directory to that destination. Do not move owner databases, assets, receipts, project files, signing keys or maintenance journals.
4. Run the installed `maintainWorkspace(..., 'backup', ...)` and `inspectWorkspaceBackup`. The verified manifest now covers project and business state without the reproducible tool cache. Retain all original-location backup anchors and keys.
5. In a `finally` path, rename the preserved cache back to its exact original path and verify it again before releasing the lease or activating. If interrupted, retain the parked directory and recover those exact paths before retry; do not overwrite a newly occupied path.

This is an explicit operator procedure, not an automatic Expert/MCP backup feature. A restore of that business backup needs toolchain preparation before native validation. Reuse only hash-verified download artifacts; a relocated Python environment must be rebuilt at the new path. Never copy a live database, erase an interrupted maintenance journal, delete an unknown cache or treat the cached executables as business acceptance evidence.

## Connection recovery

If selecting a candidate plugin still returns another installation, keep the session inactive. Check the installed plugin cache's MCP configuration against the candidate configuration path. Corrected installations use distinct `evopilot_<path-hash>` server names; older releases used one shared name and can collide when registered together. Refresh the candidate registration using the supported Codex plugin commands and reconnect in the Host. Do not overwrite the old installation or edit an inventoried `.mcp.json` in place. Only the actual `inspect` receipt can establish that the new connection is in use.

Use Node 24.14.0 and the retained bundle's `app/scripts/manage-preview.mjs`, or the installed copy. ROOT is the canonical managed installation root.

```sh
node app/scripts/manage-preview.mjs doctor --root ROOT
node app/scripts/manage-preview.mjs stop --root ROOT
node app/scripts/manage-preview.mjs recover --root ROOT
```

Doctor validates the private descriptor, exact managed file and directory inventories, configuration through installed code, and passive authenticated health. It does not write state or start services. The descriptor records local integrity and ownership expectations; it is not proof of publisher authenticity.

Stop calls only the installed authenticated connection client. Identity mismatch, an unknown outcome, or active operations is a failure; no arbitrary process signals are sent. Closing one Codex chat does not stop the shared connection.

Recover is an explicit action for retained stale control state. The installed client checks the exact installation/workspace identity and proves the recorded PID absent before removing its stale record. A live or unknown process is never killed. Recovery does not replay requests or delete business state. For UNKNOWN operations, inspect the owning receipt and reconcile before considering any new request.

Uninstall requires removal of this preview's Codex registration first, as shown in [installation](installation.md). It refuses changed or unknown managed files before removal and retains all files on a failed preflight or authenticated stop. It never recursively deletes the managed root, workspace, control directory or audit evidence. Keep workspace and control locations in place during product changes.

Failed assembly or installation retains partial new program directories for diagnosis. Do not reuse that output path or treat it as ready. Inspect the failure and select a new empty output path for a corrected attempt. No automatic rollback deletes unknown files. The exact-path inventory guards removal but cannot provide an atomic transaction against concurrent filesystem modification; keep the managed program root quiescent during maintenance.

On macOS, a network-assigned hostname may differ from the configured local
computer name. Owner relocation validation recognizes the current OS hostname
and the system's `LocalHostName.local`; new records prefer the configured name.
It still requires the original home/uid, local signing key, exact historical
receipts and signed location chain. It does not rewrite old attestations or
accept caller-supplied host aliases. A genuinely different machine or changed
configured identity remains unsupported by same-host recovery.
