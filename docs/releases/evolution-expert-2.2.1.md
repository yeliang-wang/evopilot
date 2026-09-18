# Evolution Expert 2.2.1 — public CLI recovery

Status: implementation under approved Target; **not released or accepted**.
Runtime remains the immutable published 6.2.0 release. Expert 2.2.0 remains
immutable history with its recorded public CLI remediation requirement.

## Changes

- `doctor` and `compatibility` derive all five capability requirements from the
  generated adapter instead of an incomplete CLI-local list.
- Omitted Runtime version defaults to `6.2.0`; unsupported versions,
  malformed stable versions and unknown packaged Hosts fail closed.
- The public verifier checks Core v3 and its canonical digest, all five
  adapters, portable Skill, explicit/default CLI paths and exact installed
  file equality to the accepted tarball.
- Expert Candidate construction materializes pinned published Runtime
  contracts and offline compiled test fixtures, without rebuilding or starting
  a Runtime deployment. Only Expert is compiled and packaged.

Package self-check success is not observed Host capability, Runtime readiness,
product acceptance or release authority. Ordinary humans still use Expert over
MCP; CLI diagnostics remain administrator/machine surfaces.

## Completion and publication

The [recovery acceptance plan](../operations/expert-2.2.1-recovery-acceptance.md)
keeps 10 current criteria, 355 historical criteria, 10 cross-product rows and
RC01–RC05 pending until exact Candidate-bound evidence is available. Applicable
5400-second active-soak, impact closure and NO_REGRESSION obligations remain.

Commit/push, Candidate formation and the counted Host campaign need their
separate exact authorization. Release then needs a separate decision and must
promote accepted bytes without rebuilding. Fresh public npm installation,
integrity, signatures, provenance and CLI/Core checks close that later stage.
No installation command here implies that 2.2.1 is already in npm.
