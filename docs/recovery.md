# Preview diagnosis and recovery

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
