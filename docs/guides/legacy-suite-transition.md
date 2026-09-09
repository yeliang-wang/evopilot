# Legacy Codex Suite Transition

This migration guide is for maintainers preparing EvoPilot v5 while the existing EvoPilot Codex Suite and DataRig Codex Suite continue to serve their projects. It describes preparation and evidence collection only. It does not authorize or perform Suite disablement, movement, archival, uninstall, default switching, or retirement.

Supported line: EvoPilot Runtime `5.0.1` completion recovery and later Candidate validation. Actual Cutover begins only after public Runtime 5.0.1 plus Expert 1.0.1 release and exact installation verification.

## Goal and success signal

The pre-release goal is to prove that exact v5 Candidate bytes can complete governed journeys without either Suite present in the isolated Candidate environment, while the real installed Suites remain active, independently owned, independently evolving, and untouched.

Preparation succeeds when:

- each comparison binds a current `evopilot-legacy-suite-snapshot/v1`;
- Suite drift marks only affected comparison evidence `STALE` and schedules a selective rerun;
- isolated Candidate traces prove both Suites absent, `legacySuiteInvocationCount=0`, and no loaded path or fallback reference;
- real-installed-Suite mutation evidence remains empty;
- no pre-release action changes the user's installed Suite defaults or files.

## 1. Capture late-bound read-only snapshots

Capture snapshots as late as practical before a shadow comparison. Each snapshot binds:

- Suite identity and source identity;
- Suite version and source-tree SHA-256 digest;
- a sorted Skill and rule inventory with a digest for each path;
- capture time;
- the exact comparison-corpus digest;
- `readOnly: true`.

The machine contract is [legacy-suite-snapshot-v1.schema.json](../../schemas/governed-evolution/legacy-suite-snapshot-v1.schema.json). Snapshot collection must only read the Suite. Do not copy the Suite into EvoPilot Runtime, import its implementation, restrict its evolution, or treat the snapshot as product authority.

## 2. Detect drift and rerun selectively

Before consuming shadow-comparison evidence, compare its baseline snapshot with a fresh snapshot. Source identity, version, tree, Skill/rule inventory, or corpus changes make the affected evidence stale. Capture a replacement snapshot and rerun only the evidence references associated with that Suite; unrelated project and Runtime evidence remains current.

Capture time alone does not invalidate evidence when every semantic binding is unchanged. Both exact snapshot digests remain in the comparison record.

## 3. Prove Candidate independence in isolation

Install exact Runtime and compatible Expert Candidate artifacts outside their source checkouts. The isolated environment must not contain either legacy Suite. Run the declared success, failure, resume, upgrade, and rollback variants and record:

- the exact Runtime, Expert, Host Adapter, project, Lifecycle, Harness Registry/Catalog, and HarnessExecutionBinding digests;
- absence of both Suite identities and paths in the isolated environment;
- `legacySuiteInvocationCount=0`;
- no fallback value and no process or loaded-path sentinel match;
- an empty list of mutations against the real installed Suites.

This proves technical independence. It is not a Cutover and does not make post-release operational migration automatic.

## 4. Keep release and Cutover separate

The v5 release may close when its own exact Candidate acceptance and release gates pass. Legacy Suite Cutover is not a v5 release blocker.

After public v5 release and exact installation verification, a separate `evopilot-post-v5.0.0-legacy-suite-cutover` Target may propose explicit default switching, an observation period, zero-invocation verification, recoverable archival, rollback rehearsal, and final closure. That Target requires a separate human authorization. Break-glass rollback is explicit and audited; it is never a hidden Runtime fallback.

## Rollback boundary

Before Cutover, rollback means discarding stale comparison evidence or selecting a prior immutable Project Definition/Lifecycle version; the installed Suites remain unchanged. During a future authorized Cutover, rollback details belong to that Cutover Target and must identify exact files, defaults, versions, evidence, and recovery actions.
