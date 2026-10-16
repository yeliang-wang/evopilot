# Preview diagnosis and recovery

## Workspace backup and restore

Ask the Expert to back up the configured project and state to a new separate private directory. Backup and migration hold a process-safe workspace lease and stop the verified daemon. Active requests or uncertain identity block maintenance. The OS releases a lease when its holder exits; this does not establish success of interrupted work.

Backups include editable project files and owner databases, assets, receipts and audit. Live PID/socket/token files and coordination sidecars are not restored into state. Original control/audit and maintenance journals remain beside the original state. Treat backups as private; do not include them in product releases.

The checked copier accepts at most 20,000 entries, 64 MiB per file and 512 MiB of file content per inventoried root. Links, foreign ownership and writable-by-others files are rejected. An optional private Git directory is part of the project backup; review its contents before sharing any backup.

Restore requires the exact backup manifest pinned by the retained maintenance journal. Foreign or self-rehashed backups are insufficient. It supports only the same host/uid and original canonical roots, both missing or empty. Retain backup anchors and requests under `STATE_ROOT.evopilot-maintenance/{known-backups,requests}` and relocation keys under `~/.local/share/evopilot/relocation-keys`. Copying project/state directories alone is not cross-machine disaster recovery.

After interruption, preserve request ID, journal and partial destination. Resume only the exact operation when its phase permits it. Never delete a journal to force retry. Restore and migration do not grant decisions, switch bindings or replay dispatches; verify owner snapshots before activation.

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
