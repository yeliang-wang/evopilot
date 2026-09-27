# EvoPilot CLI Commands

> Command reference for `@evopilot/cli`.

The CLI uses EvoPilot HTTP APIs. It is an adapter, not a local state manager.

## Global Flags

```text
--server <url>              EvoPilot server URL
--token <token>             Bearer token
--tenant <id>               Tenant scope header
--workspace <id>            Workspace scope header
--actor <id>                Actor scope header
--client <surface>          Client surface for logs, for example mac-terminal or workbuddy
--idempotency-key <key>     Idempotency key for mutating commands
--timeout <duration>        Wrapper stop boundary, for example 30s, 10m, or 2h
--until <policy>            Wrapper stop policy: terminal or blocked-or-complete
--require-source-ready      Explicit source readiness assertion for onboarding
--require-devops-ready      Explicit DevOps readiness assertion for onboarding
--execution-mode <mode>     owned-repository | read-only-public | fork-validated-pr | upstream-authorized
--upstream-repo <repo>      Public upstream repository for read-only or fork-validated PR mode
--working-repo <repo>       Writable repository where EvoPilot writes code and runs project DevOps
--devops-owner <account>    GitHub owner or GitLab namespace whose account runs CI/CD
--devops-token-ref <ref>    Optional server-side DevOps tokenRef
--credential-principal <id> Optional operator-readable principal expected behind the DevOps tokenRef
--llm-profile <id>          LLM profile for project onboarding or this Goal/Loop run
--require-llm-ready         Explicit LLM readiness assertion for onboarding
--level <debug|info|warn|error> EvoPilot structured logging level
--include-stack <true|false>    Include redacted stack traces in error logs
--json                      Print JSON response data
--config <file>             Config path, defaults to ~/.evopilot/config.json
```

No `evopilot harness ...` authoring or publication commands exist in EvoPilot Runtime. Use `evopilot-harness` for Harness Asset lifecycle, evolution, review, approval, versioning, and publication. Runtime provides `lifecycle`, `lifecycle-run`, `project-definition`, and `evolution` commands for running project-delivery Lifecycles against an exact published HarnessBundle; it does not move Harness Asset ownership into EvoPilot.

## Output Schemas

Use `--json` for AI agents and CI. Human-readable output is for operators and can change.

| Command | JSON Schema | Important Fields |
|---|---|---|
| `status --json` | `evopilot-cli-status/v1` | `health`, `ready`, `api`, `summary`, `client`, `llmUsage` |
| `project onboard plan ... --json` | `evopilot-project-onboarding-checklist/v1` | `status`, `nextAction`, `missingInputs`, `blockers`, `commands`, `sourceCredentials`, `devops`, `llm`, `requestId` |
| `project onboard verify ... --json` | `evopilot-project-onboarding-checklist/v1` | persisted project readiness and `nextAction` |
| `project onboard ... --json` | `evopilot-cli-project-onboard/v1` | `projectId`, `sourceCredentials`, `devops`, `steps`, `result`, `llmUsage` |
| `logging inspect/set --json` | `evopilot-logging-settings/v1` or `evopilot-logging-settings-update-result/v1` | `level`, `format`, `includeStack`, `source`, `updatedBy`, `updatedAt` |
| `target plan ... --json` | `evopilot-cli-target-plan/v1` | `projectId`, `targetId`, `goalId`, `phasePlan`, `editablePlan`, `selectedHarness`, `llmUsage` |
| `target plan diff ... --json` | `evopilot-cli-target-plan-diff/v1` | `addedTargets`, `removedTargets`, `changedTargets`, `changedPhases`, `baselineGuard` |
| `target run ... --json` | `evopilot-cli-goal-run/v1` | `status`, `steps`, `result`, `llmUsage` |
| `goal run ... --json` | `evopilot-cli-goal-run/v1` | `status`, `steps`, `result`, `llmUsage` |
| `loop run ... --json` | `evopilot-cli-loop-run/v1` | `loop`, `steps`, `result`, `llmUsage` |

Wrapper `result.exitCode=0` means the command reached its governed success boundary. `result.exitCode=2`, a non-zero process exit, or `nextAction` values such as `plan-target`, `approve-plan`, `connect-github-account`, `connect-gitlab-account`, `human-approval`, `configure-source-credentials`, `configure-devops`, `configure-llm-profile`, `repair`, `BLOCKED`, `FAILED`, or `NO-GO` are stop conditions for automation.

## Auth And Config

```bash
evopilot auth login --server <url> --username <user> --password <pass>
evopilot auth token
evopilot config path
evopilot config show
evopilot status --json
```

## Project

```bash
evopilot project register --id <id> --provider <local-git|github|gitlab> [options]
evopilot project onboard plan <github|gitlab|local-git> [options]
evopilot project onboard <github|gitlab|local-git> [options]
evopilot project onboard verify <project-id> [options]
evopilot project list
evopilot project preflight <project-id>
evopilot project credentials set <project-id> [options]
```

`project onboard plan` is a non-mutating checklist. `project onboard` registers the project and configures source/DevOps/LLM readiness, but it does not start Goal/Loop execution.

### Project semantic discovery and review (6.3.0 source development)

These commands operate the current source-checkout Runtime; they are not a claim
that 6.3.0 has been released. Prerequisites: an existing scoped project, current
Runtime authentication/readiness, and server-configured Registry plus independent
semantic Catalog policy. Select exact published digests returned by discovery.

```text
evopilot project semantic capabilities <project-id> --json
evopilot project semantic onboarding <project-id> --catalog <catalog-id> --json
evopilot project semantic inspect <project-id> --catalog <catalog-id> --json
evopilot project semantic compatibility <project-id> --catalog <catalog-id> --artifact-set-digest <sha256> --bundle-digest <sha256> --json
evopilot project semantic review <project-id> --catalog <catalog-id> --artifact-set-digest <sha256> --bundle-digest <sha256> --json
evopilot project semantic approve <project-id> --review-digest <sha256> --decision APPROVE --json
evopilot project semantic binding <project-id> --json
evopilot project semantic activation <project-id> --json
evopilot project semantic transitionReview <project-id> --action <ACTIVATE|MIGRATE|ROLLBACK> --expected-head-digest <sha256> --destination-digest <sha256> --json
evopilot project semantic transitionApprove <project-id> --transition-review-digest <sha256> --decision APPROVE --json
```

Each operation first negotiates the Runtime's project-scoped semantic capability.
A version string alone is insufficient. A legacy Runtime, missing capability or
wrong-project response stops the command; there is no legacy execution fallback.
Requests have a 30-second transport deadline, reject redirects and do not retry.
Only the listed operation fields and connection/identity/output flags are accepted;
duplicate options, arbitrary payload files, policy paths and approval shortcuts fail.

Discovery and compatibility are read-only. `review` persists an immutable review
but does not approve it. Show the exact review and digest to the owning human before
`approve`; `--decision APPROVE` is explicit, never a default. Runtime derives the
principal from current credentials, not `--actor`. It checks current scope, role,
Catalog permission, material and review digests again on mutation. Approval returns
`review`, `decision` and `binding`; `binding.eligibleForExecution` remains `false`.
Exit zero means this HTTP operation succeeded, **not** that a Goal or release passed.

`onboarding` is a read-only next-step guide for an already registered project and
one explicitly selected Catalog. With no semantic binding it evaluates up to 64
published ArtifactSet/Bundle pairs; larger sets fail closed without truncation.
One compatible pair yields `REVIEW_REQUIRED`, several yield `SELECTION_REQUIRED`;
both recommend `DUAL_BINDING_REVIEW` but leave selection empty. Supply the exact
pair to `review` and separately approve its digest. Missing semantic declarations
yield `EVIDENCE_REQUIRED`; incompatible or empty choices yield
`NO_COMPATIBLE_MATCH` or `NO_PUBLISHED_CANDIDATE`. None silently falls back or
upgrades a legacy project. An existing valid binding yields `EXISTING_BINDING`
and is preserved (the requested Catalog is not searched in this branch); read
activation before considering any separately approved transition. Revocation,
project drift or missing configuration is an error, not an unbound state.
Business field/product type remain unknown. This guide neither registers the
project nor satisfies credentials, readiness, Harness eligibility or execution gates.

After an uncertain approval response, use `binding` to inspect Runtime-owned state
before considering an exact retry. Do not select another digest or infer failure
from a dropped response. CLI JSON preserves `requestId`; MCP can inspect the same
binding without repeating approval. See the [API boundary](../api/README.md) and
[implementation status](../architecture/semantic-catalog-consumer.md).

For a future-plan switch, read `activation` first. `transitionReview` requires the
exact current head: ACTIVATE/ROLLBACK take a binding digest, while MIGRATE takes a
prepared binding review digest. Review changed fields and the explicit action;
`transitionApprove` needs a separate human decision bound to `transitionReviewDigest`.
A prior binding approval is not a switch approval. After a lost switch response,
read activation history and match that exact review digest; do not replay automatically.
Historical receipts do not establish the current head. Existing runs keep their
original binding pins, and current permissions still apply. No switch grants
execution, Goal completion, asset publication or Release authority.

The read-only command `evopilot project semantic gap <project-id> --catalog <id> --artifact-set-digest <sha256> --bundle-digest <sha256> --json`
reports compatibility findings for one exact published pair. It distinguishes ontology
material review, Harness declaration review, cross-contract mismatch and unverified
evidence/reasoning. A review destination is not defect attribution. No successor is
selected, published or bound; existing runs retain pins. A separately published
successor needs exact compatibility, a prepared binding review, the current head,
an explicit MIGRATE transition preview and separate digest-bound approval.

### Project semantic execution (6.3.0 source development)

This is a separate capability surface from project discovery/binding. It requires
a current scoped operator/admin, existing reviewed project binding, a persisted
approved pending Lifecycle request and exact current governance/executor sources.

```text
evopilot project execution capabilities <project-id> --json
evopilot project execution <planning|draft|prepare|inspect|bind|resolve|mapping|review|approveReview|dispatch|collect|evaluate|commitStage|stageReceipt|completeTarget|completionReceipt|completionStatus|completePhase|phaseReceipt|completeGoal|goalReceipt> <project-id> --file <request.json> --json
```

The file is an exact JSON declaration, not a script. Before preparing a plan,
`planning` takes `identity`, `runId`, `requestDigest`, `goalTarget` and returns a
digest-bound basis: current criteria, allowed concepts/relations and the complete
published Harness/Lifecycle obligation union. No rules or selections are inferred.
`draft` takes those four fields plus `basisDigest`, explicit `selection`, `business`,
`harness` rule arrays and exact governance/executor `selections`. It revalidates the
basis and derives action/material pins and plan digests. Its `declaration` is usable
as `prepare` input, but the draft is not persisted, approved or dispatched.
Rules use the finite outcome predicates, must reference selected concepts, and must
cover all Harness obligations. Domain meaning and criterion coverage still require
the separate review after binding. Stale basis, revoked access and invented pins
are rejected; do not automatically retry with a newer basis or invent replacement
rules. Available choices are bounded to 128 concepts, 256 relations and 64
obligations; output is at most 64 KiB within one bounded deadline.

`prepare` accepts `identity`,
`runId`, `requestDigest`, `goalTarget`, `contextPlan`, `outcomePlan`, `selections`.
`inspect` and `bind` accept only `identity`. Execution operations require `identity`
and `bindingDigest`; `review` also requires `coverage`, and `approveReview` requires
`reviewDigest` and the explicit `decision: "APPROVE"`. Identity contains exactly
`projectId`, `goalId`, `targetId`, `harnessBindingDigest`. The project must match
the command argument. Nested plans and selections are validated by their Runtime
owners; the CLI does not create domain rules or current authority.

`mapping` takes only `identity` and `bindingDigest`. This read-only operation returns
the already bound outcome plan, actual criteria and concepts, separate business and
Harness rules, and empty `coverageInputs`. Empty rule lists are unresolved input,
not defaults; supply explicit coverage before separate review and approval. Every
criterion and business rule must be covered; Harness rules cannot cover business
criteria. This is not pre-plan domain authoring. Business field/product type remain
unknown, and concept/criterion prose is untrusted data, never executable instructions.

Negotiation must advertise the exact operation. Requests are limited to 64 KiB,
reject redirects, have a 30-second transport deadline and are never automatically
retried. `dispatch` is advertised only when the server has an explicitly configured
adapter; each call still revalidates its persisted qualification, permissions and
business mapping approval. A default server does not select an adapter or Host.

`collect` is advertised only with an explicitly server-configured evidence
collector. Its payload is only `identity` and `bindingDigest`, never facts, URLs,
commands or a collector selection. Runtime derives selectors and correlation from
the approved plan and persisted dispatch receipt. The exact descriptor must match
the active evidence policy. Replies contain only receipt/request digests, origin,
kinds and non-completion authority; facts stay in private Runtime storage.
Synthetic origin is retained through evaluation. A retained claim without a
receipt stops for reconciliation; neither transport nor server retries it.

Exit zero is operation success, not business success. `evaluate` may persist an
`INDETERMINATE`, `FAILED` or `DUAL_VALIDATED_NOT_COMPLETED` report; completion remains
false. After timeout or lost response, preserve the identity and binding. Do not
automatically rerun: an explicitly requested exact dispatch retry may return a
retained receipt, but an unresolved claim blocks pending reconciliation.
`commitStage` accepts only `identity` and `bindingDigest`. It freshly verifies both
validation planes, independent collection, native process evidence and current
scoped stage-completion policy before committing the pending stage. It does not
advance subsequent stages; use the existing governed Lifecycle advance operation.
After an uncertain response, use `stageReceipt` with `identity`, `bindingDigest`,
`runId` and `requestDigest` to read the exact settled historical receipt.

`completeTarget`, `completionReceipt` and `completionStatus` each accept only
`identity` and `runId`. The writer requires a terminal Lifecycle, verified evidence
for every stage and an explicit current Target-completion policy. Phase-associated
Targets additionally require a typed independently collected package and explicit
phase-Target policy; dependent phases require a verified aggregate predecessor
receipt. A non-phase Goal closes only when all required Targets have verified
receipts; GA/phase Goals remain open. No facts, success flags or release overrides
are accepted. Negotiation must advertise both the exact operation and
`completionAvailable=true` with `completionScope=VALIDATED_TARGET_AND_NON_PHASE_GOAL`.

`completePhase` and `phaseReceipt` additionally require `phaseTargetId` and
`phaseCompletionAvailable=true`. The anchor identity/run must be a required member
with a verified completion receipt and independently collected typed phase package.
The phase writer checks every required Target receipt, reviewed aggregate mapping,
required evidence/reviews/outputs and current scoped phase policy before one Goal
CAS. Phase GO does not close the GA Goal or authorize Release. After uncertainty,
read `phaseReceipt`; do not replay or clear a retained write lock automatically.

`completeGoal` and `goalReceipt` take only `identity`/`runId` and additionally
require `goalCompletionAvailable=true`. Final closure verifies all required Target
and declared phase receipts against the same approved Goal/plan, plus a separate
current `semanticFinalGoalCompletionPolicy`. It writes one durable Goal receipt
and COMPLETED in a single CAS. GA requires a verified GA phase; the declared GA
maturity ladder cannot omit or reorder predecessors. Read `goalReceipt` after an
uncertain response. Goal completion grants no release, deployment or publication.

`completionStatus` is a separate read-only semantic report. Its `targetPercent`
counts verified required Targets, not release progress. `goalCompleted` stays false
when phase/GA closure is pending. `release.status=NOT_EVALUATED` and all authority
flags are false. Existing `goal list`, `goal inspect`, `goal snapshot`, `goal graph`,
`goal evidence-matrix` and `goal final-report` reads use verified receipts for
semantic-owned Goals and require current operator/admin. A verified non-phase Goal returns a final
report; phase/GA Goals require the separate verified final Goal receipt, and
missing required evidence remains blocked. Neither view replaces
phase packages or a release decision. `completionReceipt` can
recover a settled success after restart without dispatch, recollection or rewriting
completion. The HTTP `run-status` read uses the separate
`evopilot-semantic-goal-run-status/v1` schema for semantic-owned Goals, with verified
receipt references and a typed `llmUsage` subtotal from verified completed Target
receipts. Status is UNAVAILABLE (null totals), PARTIAL or VERIFIED_COMPLETED_TARGETS;
missing/legacy telemetry remains unknown, not zero. Provider/model/Host routes,
execution provenance and coverage exclusions are explicit. This excludes pending,
failed and uncertain dispatches and is not settled provider billing.
There is no `goal run-status` CLI command. HTTP run-status also provides `dispatchUsage` for
reachable succeeded, failed and uncertain dispatch receipts, independently of
Target completion. Waiting/missing/legacy evidence is explicit and never triggers
replay. Its totals overlap `llmUsage` and must not be added to it. Neither subtotal
is a provider bill. Lists retain the
existing scope/order/last-50 window and fail if any visible semantic verification
fails; they are not atomic cross-Goal snapshots.
`SEMANTIC_EXECUTION_RECONCILIATION_REQUIRED` means a retained uncertain
write: stop and inspect the claim; never clear it or replay automatically.
Production collector/Host qualification, installed-package E2E and release remain
separate work. No publication command is exposed here.
Legacy Lifecycle `external-result` also refuses a semantic-owned run with
`LIFECYCLE_SEMANTIC_COMPLETION_REQUIRED`, even when semantic fields are omitted.

## Project Definitions (v5 development)

Project Definitions are immutable, declarative project aggregates. YAML is the human-editable form; registration normalizes the declaration and records its canonical digest. Use an explicit `--version` to inspect or roll back to an earlier definition without rewriting history.

```bash
evopilot project-definition list --json
evopilot project-definition inspect <project-id> [--version <version>] --json
evopilot project-definition discover --file <detected-facts.yaml|json> --json
evopilot project-definition register --file <definition.yaml|json> --json
evopilot project-definition diff <project-id> --from <version> --to <version> --json
evopilot project-definition activate <project-id> --version <version> --evidence-ref <ref> --json
evopilot project-definition rollback <project-id> --version <version> --evidence-ref <ref> --json
evopilot evolution plan --file <plan-request.yaml|json> --json
evopilot evolution run --file <exact-binding-run-request.yaml|json> --json
evopilot evolution revalidate --file <current-state.yaml|json> --json
evopilot evolution recover --file <failure.yaml|json> --json
```

See [Project Definitions](../guides/project-definitions.md) for the schema, reference declarations, and versioning rules.

## Governed resources

```bash
evopilot resource list [--kind <kind>] --json
evopilot resource inspect <kind> <resource-id> [--version <version>] --json
evopilot resource register --file <resource.yaml|json> --json
evopilot resource diff <kind> <resource-id> --from <version> --to <version> [--runtime-version 6.0.0] --json
evopilot resource activate <kind> <resource-id> --version <version> --evidence-ref <ref> --json
evopilot resource rollback <kind> <resource-id> --version <version> --evidence-ref <ref> --json
evopilot evolution inventory --file <capability-inventory.yaml|json> --json
evopilot evolution governance --file <governance-evaluation.yaml|json> --json
evopilot provider qualify --file <provider-qualification.yaml|json> --json
```

Registration never implies activation. Compatible resource revisions preserve Runtime and Expert package versions. See [Resource Versioning](../guides/resource-versioning.md) and [Action Providers](../reference/action-providers.md).

## Project DevOps

```bash
evopilot project devops set <project-id> --provider <github-actions|gitlab-ci> [options]
evopilot project devops inspect <project-id>
evopilot project devops preflight <project-id>
evopilot project devops clear <project-id>
```

## Secrets

```bash
evopilot secret set --id <secret-ref> --kind <source-token|deploy-token|llm-key|llm-api-key|github-app-private-key|github-webhook-secret> (--value <value>|--value-file <file>|--from-env <env>) --json
evopilot secret list --json
```

## LLM Profiles

```bash
evopilot secret set --id <secret-ref> --kind <source-token|deploy-token|llm-key|llm-api-key|github-app-private-key|github-webhook-secret> (--value <value>|--value-file <file>|--from-env <env>) --json
evopilot llm profile list --json
evopilot llm profile set <profile-id> --provider openai-compatible --base-url <url> --model <name> --api-key-ref <secret-ref> --json
evopilot llm profile inspect <profile-id> --json
evopilot llm profile preflight <profile-id> --json
evopilot runtime readiness --json
evopilot llm providers --json
evopilot llm workspace-default inspect --json
evopilot llm workspace-default bind --profile <profile-id> --profile-digest <sha256> --reason <text> --json
evopilot llm migrate-v61 [--profile <profile-id>] [--reason <text>] --json
evopilot llm bootstrap --preview --json
evopilot llm bootstrap --opt-in --input-stdin --profile <new-id> --secret-id <new-id> --reason <text> --json
evopilot llm migrate-v61 --opt-in --input-stdin --profile <new-id> --secret-id <new-id> --reason <text> --json
evopilot project llm set <project-id> --profile <llm-profile-id> --json
evopilot project llm inspect <project-id> --json
evopilot project llm preflight <project-id> --json
evopilot project llm clear <project-id> --json
```

Runtime 6.3 retains the setup-only gate introduced in 6.2: a workspace-scoped Profile must pass live preflight and an administrator must explicitly bind its exact digest as the workspace default. Without `--input-stdin`, `migrate-v61` only binds an existing governed Profile and stops on ambiguous selection; it does not convert a legacy configuration.

For administrator-operated headless initialization, inspect `llm bootstrap --preview` first. Then provide exactly one JSON configuration on a trusted, non-echoing stdin pipe with `providerName`, `baseUrl`, `modelName`, and `value` (the sensitive provider credential), and explicitly pass `--opt-in`. `llm migrate-v61 --input-stdin` accepts the same representation of a deliberately selected 6.1 provider. An array is accepted only when it contains exactly one candidate. Neither command discovers or reads shell/environment defaults, legacy files, or Agent Host configuration. Do not paste the sensitive input into chat, shell arguments, project files, logs, or an Expert/MCP payload.

The administrator-only Runtime endpoint `POST /api/v1/runtime-readiness/bootstrap` receives `optIn: true`, `source: explicit-headless|explicit-v61`, new `profileId` and `secretId`, a `reason`, and the single-element `candidates` array. Runtime enforces the authenticated workspace, persists the encrypted SecretRef and Profile, performs live preflight, and binds the default only on success. Existing ids or a default binding cause refusal without overwrite. Provider URLs with embedded credentials, query strings, or fragments are refused. The CLI limits stdin to 64 KiB and creates no input/config file or environment fallback. Clearing its input buffer is not a guarantee of zeroized JavaScript memory, nor can the CLI erase a caller's upstream file or environment; the input producer remains responsible for those.

Failure after provisioning leaves governed resources for explicit inspection and repair; it is not a transaction rollback. Repeating bootstrap will stop, not rotate or recreate those resources. Inspect the returned ids, repair via the governed Secret/Profile APIs, run a fresh Profile preflight, and explicitly bind with the expected prior binding digest. A Profile change or credential rotation invalidates old preflight; concurrent modification during a probe fails closed. A successful response includes the Profile and binding digests and Runtime readiness. These headless administration commands do not replace the Expert-over-MCP ordinary-human entry or grant project, execution, acceptance, or Release authority.

## Project LLM

The server global default LLM is not sufficient for enterprise GitHub/GitLab loops. Use a READY workspace LLM profile and bind it to the project.

```bash
evopilot project llm set <project-id> --profile <llm-profile-id> --json
evopilot project llm preflight <project-id> --json
```

## GitHub App

```bash
evopilot github-app installations --json
evopilot github-app preflight <installation-id> --json
```

## Goal And Target

```bash
evopilot maturity standards list --json
evopilot maturity standards inspect <alpha|beta|rc|ga> --json
evopilot target list --json
evopilot target create --project <id> [--id <target-id>] [--criteria <target.json>] --json
evopilot target plan --project <id> --objective <business-goal> [--llm-profile <id>] --json
evopilot target plan export <goal-id> [--format <json|yaml>]
evopilot target plan diff <goal-id> --file <plan.json> --json
evopilot target plan apply <goal-id> --file <plan.json> --json
evopilot target plan approve <goal-id> --confirmed-by <user-or-owner> --confirmation <text> --json
evopilot target run --project <id> --objective <business-goal> [--llm-profile <id>] [--max-steps <n>] [--timeout <duration>] --json
```

`target plan` dynamically reads the configured Harness Registry and enabled Catalogs, then returns `selectedHarness` when a published Harness matches the project and objective.

## Open Lifecycle Harness (v4 development)

Lifecycle definitions are human-readable YAML data. Starting a run does not authorize it. Answering questions does not imply approval. One exact binding authorization covers the reviewed plan; later human decisions occur only at declared risk or publication boundaries.

```bash
evopilot lifecycle list --json
evopilot lifecycle inspect <lifecycle-id> --version <version> --json
evopilot lifecycle resolve --lifecycle <id> --goal-text <text> --file <labels.yaml|json> --json
evopilot lifecycle inputs <lifecycle-id> --file <answers.yaml|json> --json
evopilot lifecycle start --lifecycle <id> --project <id> --file <binding.yaml|json> --goal <goal-id> --json
evopilot lifecycle-run list --json
evopilot lifecycle-run inspect <run-id> --json
evopilot lifecycle-run answer <run-id> --file <answers.yaml|json> --json
evopilot lifecycle-run finalize-binding <run-id> --file <binding.yaml|json> --json
evopilot lifecycle-run authorize <run-id> --decision <APPROVED|REJECTED> --binding-digest <sha256> --evidence-ref <ref> --json
evopilot lifecycle-run advance <run-id> --json
evopilot lifecycle-run decision <run-id> --stage <id> --decision <APPROVED|REJECTED> --binding-digest <sha256> --evidence-ref <ref> --json
evopilot lifecycle-run cancel <run-id> --binding-digest <sha256> --evidence-ref <ref> --json
evopilot lifecycle-run signal <run-id> --request-id <id> --status <SUCCEEDED|FAILED|UNCERTAIN> --receipt-digest <sha256> --file <evidence.yaml|json> --json
evopilot lifecycle-run feedback <run-id> --binding-digest <sha256> --evidence-ref <human-approval-ref> --json
```

`signal ... --status UNCERTAIN` stops at a recovery decision; it never silently retries an uncertain external mutation. `feedback` requires separate approval and creates an immutable, strict-redacted, private package without modifying a Harness asset.

## Governed Evolution Runtime (v5 development)

These commands use the same tenant/workspace-scoped HTTP API as MCP and other Agent adapters. Planning binds an immutable Project Definition and published HarnessBundle. Recovery applies deterministic policy; it cannot manufacture authority, retry an uncertain external mutation without a receipt, or turn conversation into approval.

```bash
evopilot evolution plan --file <plan-request.yaml|json> --json
evopilot evolution revalidate --file <revalidation.yaml|json> --json
evopilot evolution recover --file <recovery-context.yaml|json> --json
evopilot remediation start --file <campaign.yaml|json> --json
evopilot remediation inspect <campaign-id> --json
evopilot remediation decide <campaign-id> --file <incident.yaml|json> --json
evopilot remediation resume <campaign-id> --campaign-digest <sha256> --evidence-ref <ref> --json
evopilot remediation cancel <campaign-id> --campaign-digest <sha256> --evidence-ref <ref> --json
evopilot automation list --json
evopilot automation propose --file <rule-proposal.yaml|json> --json
evopilot automation activate <rule-id> --file <exact-decision.json> --json
evopilot automation revoke <rule-id> --file <exact-decision.json> --json
```

Automation proposals remain inactive until an exact decision activates them. An active rule is constrained by failure class, signature, scope, reversibility, external-effect policy, and the server-derived authority boundary.

## Maturity Standards

Use `maturity standards list/inspect` to read the Alpha/Beta/RC/GA baseline. Do not treat release target ids as skip instructions.

## Loops And Evidence

```bash
evopilot goal list --project <id> --json
evopilot goal inspect <goal-id> --json
evopilot goal plan <goal-id> --json
evopilot goal approve-plan <goal-id> --confirmed-by <user-or-owner> --confirmation <text> --json
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase <alpha|beta|rc|ga> --json
evopilot loop list --json
evopilot loop run [<loop-id>] [--project <id> --target <target-id> --objective <text>] --json
evopilot evidence push --project <id> --file <events.json> --json
evopilot release decisions --project <project-id> --target <target-id> --json
evopilot audit list --limit 50 --json
evopilot source-closure execute <loop-id> --json
```

Audit API equivalent: `/api/v1/audit?limit=<n>&order=desc`.

If the server is unreachable, commands return `SERVER_UNREACHABLE` diagnostics through `status=UNREACHABLE`.

## Harness Catalog API Projection

The EvoPilot server exposes a read-only API projection for Dashboard and integration visibility:

```http
GET /api/v1/harness/catalogs
GET /api/v1/harness/catalogs/{catalogId}
```

These are server APIs, not CLI lifecycle commands. Mutating Harness endpoints are intentionally absent from EvoPilot v3.

## Complete Command Index

These atomic commands are part of the CLI help surface and should be used with `--json` for automation:

```bash
evopilot secret revoke <secret-ref> --json
evopilot logging set --level info --json
evopilot github-app installation list --json
evopilot github-app installation set <installation-id> --json
evopilot github-app installation preflight <installation-id> --json
evopilot target decision --project <project-id> --target <target-id> --json
evopilot goal create --project <project-id> --objective <text> --json
evopilot goal run <goal-id> --json
evopilot goal targets <goal-id> --json
evopilot goal advance <goal-id> --json
evopilot goal snapshot <goal-id> --json
evopilot goal phases <goal-id> --json
evopilot goal graph <goal-id> --json
evopilot goal final-report <goal-id> --json
evopilot loop create --project <project-id> --target <target-id> --objective <text> --json
evopilot loop start <loop-id> --json
evopilot loop approve <loop-id> --json
evopilot source-closure preflight <loop-id> --json
evopilot source-closure approve-release <loop-id> --json
evopilot source-closure reject-release <loop-id> --json
evopilot source-closure merge <loop-id> --json
evopilot source-closure auto-merge <loop-id> --json
evopilot release-run list --json
evopilot release-run inspect <run-id> --json
evopilot release-run repair-candidates <run-id> --json
evopilot release-run repair <run-id> --json
evopilot release-run repair-all --json
evopilot release-run finalizers --json
evopilot worker queue --json
evopilot worker leases --json
evopilot worker claim --json
evopilot worker heartbeat --json
evopilot sandbox proof <loop-id> --json
evopilot sandbox verify <loop-id> --json
evopilot replay checkpoints <loop-id> --json
evopilot replay run <loop-id> --json
evopilot trace tree <loop-id> --json
evopilot trace events <loop-id> --json
evopilot connector deploy list --json
evopilot connector deploy create --json
evopilot release gate --json
evopilot release current --json
```
