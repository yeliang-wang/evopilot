# v0.8 delivery execution

The accepted [v0.8 plan](asset-usability-v08.md) and machine planning record retain all 18 requirements and 20 acceptance IDs. The additive [delivery target](../governance/asset-usability-v08-delivery.json) binds source files, resource budgets and 79 active delivery variants. Its `.D01`–`.D04` suffixes distinguish delivery checks from the previous source variants; the 27 usability, 18 intent-admission and 19 owner-admission variants remain required. Public planning records do not contain a user's acceptance decisions or actual progress.

Run the applicable alignment gate against the accepted Roadmap:

```sh
node scripts/verify-usability-delivery.mjs --roadmap /absolute/path/to/accepted/docs/roadmap.md
```

`ALIGNED` verifies pins and the fixed requirement/acceptance inventory. It does not mean the candidate passed acceptance or is releasable. Source identity, actual evidence, semantic decisions and exact release authorization are retained in private execution records.

The current implementation adds Harness assessment persistence and a [standalone read-only asset service](asset-service.md). [The assessment ADR](architecture/0008-usability-assessment.md) preserves owner boundaries. New source behavior remains a candidate until all mandatory version acceptance closes.

The next execution work must retain the independent oracle, actual bounded reconstruction adapter, two clean reconstructions, substantive real-project contract evolution, actual installed Expert/Host, upgrade/recovery and exact four-repository release/download readback requirements. None can be replaced by source tests, negative rejection tests or a gap report.

The accepted scope correction removes graphical frontend implementation and browser acceptance before v1.0 release. V08-E15 retains HTTP/SDK, report and actual installed Expert/Host parity and exact-receipt navigation. Withdrawn variant V08-E15.D03 is recorded as out of scope, never as passed; the other 79 delivery variants and all 64 prior source variants remain required.

The T3 source candidate adds the [independent behavior oracle](architecture/0009-behavior-oracle.md): reviewed fixed cases and negative controls, protected observation reads, output/state/error/effect comparison, durable claims and recovery. Source E2E exercises failures and interruption with explicitly synthetic fixtures. It does not replace the independent real-project oracle, actual Runtime adapter or the two clean reconstruction journeys required by T4/T5.

## T4 controlled execution

Runtime now provides exact reviewed reconstruction plans, durable claims, bounded attempts, cancellation, original-receipt reconciliation and verified observation consumption through its public API. The parent routes Harness evidence reads through Runtime when the reconstruction provider is configured. See [controlled reconstruction](architecture/0010-controlled-reconstruction.md) and the [Runtime API](../projects/evopilot-runtime/docs/reconstruction.md).

The initial local adapter runs bounded offline Node generation/build/run stages in fresh macOS sandboxes. It has no remote model, token consumption or ambient credential access. Synthetic process tests do not fulfill the real independent project reconstruction or installed coding-Agent acceptance. Those fixed delivery requirements remain pending; no L3 or release readiness is inferred.

Authenticated Codex must satisfy the separate [executor admission and recovery requirements](architecture/0010-controlled-reconstruction.md#authenticated-codex-admission). Native permission probes, real model generation and recovery readback are prerequisites to adapter admission. The Runtime receipt must retain unavailable cost or token measurements explicitly, and a different app-server's unloaded/interrupted snapshot must never authorize redispatch. These prerequisites do not replace the real project oracle, two independent reconstructions or version-specific E2E acceptance.

The execution ceiling is now 60 minutes of cumulative wall time per reviewed plan. This is a configurable EvoPilot resource bound selected for bounded long-running generation, not a universal industry timeout or an acceptance relaxation. Existing plans and failures retain their original budgets. A new recovery plan requires actual authorization and fresh exact bindings; it cannot erase prior consumption, silently reset unknown usage or add unlimited retries. See the [execution limits and recovery policy](architecture/0010-controlled-reconstruction.md#execution-limits-and-recovery-policy). The fixed requirements, variants, two independent clean reconstructions and real evolution obligations are unchanged.
