# Configure and operate online Harness

This guide is for v0.5 Preview users with a private Workspace, the pinned native toolchain, and a read-only Prometheus endpoint. The managed independent worker is supported on macOS arm64 through the current user's launchd GUI domain. It uses existing telemetry services; EvoPilot does not install a monitoring platform or change a production deployment.

## First setup through Expert

1. Select the installed EvoPilot plugin and ask: “Guide me through online Harness setup for this service.” Inspect actual installation identity and read guide `V05-U01`. Resolve installed guide paths against `inspect.connection.identity.installationRoot`.
2. Identify the exact service, environment and deployment revision. Provide a Prometheus origin and **private credential file paths**, never paste tokens into chat. Prometheus credentials must be read-only. The Alertmanager receiver requires a bearer credential file. Files must be canonical, owned by the current user, mode `0600`, and contain a 16–4096-byte token.
3. Review the proposed OpenSLO profile and native policy. Publish the exact Rego package through its normal put/validate/review/decide/publish lifecycle. The [online profile](https://github.com/yeliang-wang/evopilot-harness/blob/main/specifications/online/v1/README.md) declares supported fields and the RatioTimeslices calculation. Business thresholds are decisions, not defaults inferred from logs.
4. With this chat active, use `evopilot_v01_online_configure` with `settings`, `expectedDigest` (initially `null`) and a new `requestId`. Configuration stops the shared connection and deactivates this chat; activate again to load it. Configuration alone starts no monitoring.
5. Through `evopilot_v01_native`, create a Harness `online.binding.put` candidate. Review its exact digest, record the actual `online.binding.decide` decision, then explicitly `online.binding.select` it. Use a new immutable binding for a policy, threshold or deployment change.
6. Explicitly start `evopilot_v01_online_worker` with operation `start`. Inspect until its actual status is ready and measurements appear. A running process alone is not evidence of a healthy service.

Illustrative server settings (replace the paths, scope, origin and port with your own):

```json
{
  "scopes": [{"visibility":"private","projectId":"example"}],
  "prometheus": [{"id":"metrics","origin":"https://metrics.example.invalid","bearerTokenFile":"/absolute/private/prometheus-token","freshnessSeconds":30}],
  "alertmanager": [{"id":"alerts","bearerTokenFile":"/absolute/private/alertmanager-token"}],
  "receiverPort": 19095,
  "tickSeconds": 10
}
```

The authenticated webhook route is `POST http://127.0.0.1:<receiverPort>/alerts/<sourceId>` with `Content-Type: application/json`. Configure the matching Alertmanager receiver with `http_config.authorization.credentials_file` and `send_resolved: true`. Each routed batch must identify one configured project and matching selected bindings through `service`, `environment` and `deployment` labels. External routing, TLS and production alert changes remain the operator's responsibility; this guide does not authorize them.

## Inspect and respond

Guide `V05-U02` covers live inspection. `online.inspect` shows selection, last/next window, incidents and pending delivery. `online.observation.inspect` shows measured values, source timestamps, actual native command receipts and diagnostics. Missing, stale, partial, zero-denominator or unavailable data is **INCOMPLETE**, never PASS. Configuration validity and native test validity are separate from an actual online measurement.

Guide `V05-U03` follows a confirmed finding. Harness retains its history and delivers it through trusted readback to Runtime. `online.repair.inspect` returns a **repair candidate** with `status: REVIEW_REQUIRED`, no requested software version and no release or ontology mutation. Review the evidence, source baseline and proposed change before preparing a normal Runtime Target/Run. Recovery closes current incident state while retaining failure evidence; it does not erase the original fault or approve a repair.

Guide `V05-U04` compares a retained fault observation and later passing observation using `online.regression.verify`. Both must use the same immutable binding/policy and actual successful native executions, with quality FAIL then PASS. The reviewable comparison does not publish a rule. Any policy revision still needs explicit source mapping, positive/negative cases and a new native review.

## Stop, upgrade and recover

Guide `V05-U05` covers lifecycle. A selected, explicitly started launchd worker continues after Codex closes. Chat deactivation does not stop monitoring. Deselect a binding to stop its schedule; use worker operation `stop` or `uninstall` to unload the owned Workspace worker. These operations preserve evidence and credentials. Do not kill arbitrary PIDs or remove live databases.

Backup, restore, relocation and toolchain maintenance require the independent worker to be stopped, in addition to stopping the shared Codex connection. The maintenance lease and worker check enforce this boundary. The first online write advances Harness/Runtime state to database marker 4; older installations must not open it. Roll back with a verified matching pre-upgrade backup and installation.

Configuration lives privately under protected state `online/configuration.json`; observations, watermarks, pending windows and findings live in owner databases. Worker supervision/status is adjacent to protected state in `.evopilot-online-worker`. Backups include the configuration and owner evidence. Credential files referenced outside that state remain user-owned and must be preserved separately. After restoring, verify their references and exact installation, then explicitly start the worker; retained configuration does not start it automatically.

Repeated windows return retained observations. An interrupted read-only query can resume the same window. The worker reports backlog and hard storage/resource limits instead of silently skipping windows or removing history. Preview has bounded history and no distributed scheduler, metrics retention platform, autonomous repair executor or automatic patch-release policy.

See [process design](architecture/0005-online-harness.md), [owner API](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/online-harness.md), [feedback](feedback.md) and [recovery](recovery.md). The fixed [v0.5 Target](../governance/online-harness-v05.json) defines acceptance; these instructions and examples are not acceptance evidence.
