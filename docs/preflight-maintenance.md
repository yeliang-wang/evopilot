# Draft preflight and bounded maintenance

These interfaces are part of v0.7. Pause active project work and follow the [upgrade procedure](migration.md#upgrade-from-v06-to-v070) before shared maintenance or daily installation changes.

## Native project preflight

Call `native_project` with `operation=preflight` and `input={project, packages}`. `project` is the existing prepare input; `packages` contains the complete native Ontology and Harness drafts. The operation reads the exact source, calls the owner package validators, verifies mappings and the original fixed variant denominator, checks planned path conflicts, and runs the locked Ontology RDF/SHACL validator. It writes neither project candidates nor owner delivery records.

A new `freeze` requires the complete `packages` in addition to the exact scope review input. Missing metadata, cases, mappings or incompatible paths fail before creating the frozen project. Historical frozen records remain readable and idempotently retrievable. `materialize` runs the same checks before writing any asset. Native validation is technical evidence; later Harness execution, domain review, publication and project decisions remain independent.

Preflight requires the explicitly prepared locked native toolchain. It never downloads dependencies. Failed drafts can be corrected before freezing; an immutable retained candidate is never silently overwritten.

## Capacity and recovery

`workspace_capacity` reads file counts, byte totals and inventory digests. It does not stop services and is not a consistent backup: a live write can invalidate the scan. A backup/restore/migration still requires the existing maintenance lease and a quiescent verified connection.

The v0.7 copy path hashes and transfers in 4 MiB chunks. Per root limits are 128,000 entries and 8 GiB; one file is limited to 2 GiB. No cache entries are silently excluded. An interrupted transfer resumes only the same journal-bound request after validating the retained partial prefix. A conflict leaves existing bytes intact. Workspace identity files are copied first so restoration can resume after interruption.

Only relative links resolving inside their own root are preserved. Links are never traversed. External, dangling or cyclic links, hardlinked regular files, overlapping destinations, changed source and corrupted backups fail. Regular file modes and link text are retained; protected directories remain private. New backups use manifest v2; supported v1 backups retain their original interpretation.

The resource acceptance driver is `node scripts/verify-maintenance-v07.mjs /absolute/private/report.json`. It creates and removes its own synthetic corpus: over 100,000 entries, over 4 GiB, 256 MiB files, and 20 relative links. It checks backup/restore, the 900-second per-operation budget and 512 MiB peak RSS. A successful small fixture does not replace this resource evidence or actual owner-history recovery checks.

Native preflight/freeze/materialize requests use the bounded native transport timeout rather than the short ordinary-read timeout; the pinned validator itself retains its own fixed limit. Lost replies still require exact receipt/claim inspection, never automatic redispatch.

Large manifests are hashed and written through a bounded canonical JSON stream with byte-compatible historical digests. File data is synced before rename. Directory entries are synced in batches of at most 128 file renames, and the journal remains incomplete until full verification. Crash recovery verifies existing files and partial prefixes against the unchanged source before resuming; no cache files are silently omitted.
