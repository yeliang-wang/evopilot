# `@evopilot/adapter-opencode`

The current published package is **6.3.2**. Its process-observation v2 reports
input, output and cached input tokens without requiring monetary telemetry or
pricing configuration. Unavailable token counts remain unavailable; measured
zero remains zero. Cached input is part of input and is not added to the total
again. See [token usage and v1 compatibility](https://github.com/yeliang-wang/evopilot/blob/41e45117e545a768b728ac96cf3a470b3fd789c0/docs/architecture/token-usage.md)
and the [verified public release](https://github.com/yeliang-wang/evopilot/blob/41e45117e545a768b728ac96cf3a470b3fd789c0/docs/releases/current-release.md). This
default-branch documentation does not rebuild or replace published tarballs.

Historical 6.3.0 receipt compatibility:

In the released 6.3.0 package, process observations bind optional
`usageCoverage=COMPLETE|PARTIAL|UNAVAILABLE` into their receipt digest. COMPLETE
requires explicit valid cost and input/output token telemetry in every parsed
`step_finish`; no telemetry or legacy observations must not be interpreted as
measured zero. Existing numeric cost fields remain compatible. Runtime semantic
usage views use this coverage marker, not merely those numeric defaults. This is
reported process usage, not settled provider billing or real-Host qualification.

First-class OpenCode runtime adapter for EvoPilot's Open Lifecycle Harness. It
invokes an exact external OpenCode runtime through `opencode run --format json`,
normalizes its event stream into a digest-bound execution receipt, and persists
only redacted metadata required for safe request replay.

The adapter never uses OpenCode's automatic permission bypass flags. Lifecycle
YAML cannot change the executable, model, workspace, timeout, output limit, or
capability set bound in the reviewed `AgentRuntimeProfile`. Provider credentials
remain in the OpenCode or Host environment and are not written to Lifecycle
inputs, receipts, evidence, or logs.

OpenCode is an external runtime and is intentionally not embedded in EvoPilot.
Install and configure an exact OpenCode version separately, then construct the
adapter with `createOpenCodeExecutorAdapter`. A successful adapter result is
execution evidence only; it never grants approval, publication, or Release
authority.

The source implementation also supports the optional
`evopilot-agent-process-observation/v1` owner read. It records only process
boundary metadata and output digests, correlated to the exact request/result and
profile. It does not attest business facts, inner tool authorization or reported
billing. Injected test runners are explicitly synthetic; native execution does
not by itself establish live Host qualification.

Native receipt storage must be private and outside the Agent workspace. Receipt
files are bounded, synced and inserted without replacement; symlinks and hardlinks
are refused. The Host still owns real filesystem isolation. In-memory observations
are capped at 128; restart/eviction means unavailable observation, not permission
to rerun a request. Legacy receipts gain no invented provenance. See the
[Runtime collection boundary](https://github.com/yeliang-wang/evopilot/blob/41e45117e545a768b728ac96cf3a470b3fd789c0/docs/architecture/semantic-catalog-consumer.md#adapter-process-observation-and-finite-runtime-collection).
