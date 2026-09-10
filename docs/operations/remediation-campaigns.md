# Remediation Campaigns

Audience: operators diagnosing Candidate, CI, Host, or repository failures. Applies to Runtime 5.1.0.

A remediation campaign persists across stage retries and Candidate replacement. It binds Target, execution binding, source, active Candidate, attempt budget, same-failure circuit breaker, wall-clock budget, history, and descendant lineage.

```bash
evopilot remediation start --file campaign.yaml --json
evopilot remediation decide <campaign-id> --file incident.yaml --json
evopilot remediation inspect <campaign-id> --json
evopilot remediation resume <campaign-id> --campaign-digest <sha256> --evidence-ref decision://resume --json
evopilot remediation cancel <campaign-id> --campaign-digest <sha256> --evidence-ref decision://cancel --json
```

Runtime can automatically resume from an immutable receipt, retry transient technical failures, or repair a deterministic reversible defect inside approved Target scope. A product repair creates new source bytes and a replacement Candidate; it never mutates, relabels, or reuses acceptance from the parent Candidate. Readiness and credential leases are refreshed, the failed check runs first, impacted criteria close, and then the complete matrix reruns.

Runtime stops for semantic changes, authority expansion or conflict, uncertain mutation state, destructive external effects, repeated identical failure, exhausted attempts, or elapsed time. Exact owning-human decisions remain required for credentials, database, production, destructive operations, acceptance, publication, and release.

Success is not merely “the retry passed”. It requires immutable receipts, exact source/Candidate lineage, criterion-specific evidence, impact closure, full-matrix closure, and no stale cross-Candidate evidence.
