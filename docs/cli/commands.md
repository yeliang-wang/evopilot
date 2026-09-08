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

No `evopilot harness ...` commands exist in v3. Use `evopilot-harness` for Harness Asset lifecycle, evolution, review, approval, versioning, and publication. The v4 development line adds `lifecycle` and `lifecycle-run` commands for running project-delivery Lifecycles against an exact published HarnessBundle; it does not move Harness Asset ownership into EvoPilot.

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

## Project Definitions (v5 development)

Project Definitions are immutable, declarative project aggregates. YAML is the human-editable form; registration normalizes the declaration and records its canonical digest. Use an explicit `--version` to inspect or roll back to an earlier definition without rewriting history.

```bash
evopilot project-definition list --json
evopilot project-definition inspect <project-id> [--version <version>] --json
evopilot project-definition register --file <definition.yaml|json> --json
```

See [Project Definitions](../guides/project-definitions.md) for the schema, reference declarations, and versioning rules.

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
evopilot project llm set <project-id> --profile <llm-profile-id> --json
evopilot project llm inspect <project-id> --json
evopilot project llm preflight <project-id> --json
evopilot project llm clear <project-id> --json
```

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
