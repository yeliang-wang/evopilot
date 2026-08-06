# EvoPilot CLI Commands

> Command reference for `@evopilot/cli`.

The CLI uses EvoPilot HTTP APIs. Global flags can be used with any command:

```text
--server <url>              EvoPilot server URL
--token <token>             Bearer token
--tenant <id>               Tenant scope header
--workspace <id>            Workspace scope header
--actor <id>                Actor scope header
--client <surface>          Client surface for logs, for example mac-terminal or workbuddy
--idempotency-key <key>     Idempotency key for mutating commands
--timeout <duration>        Wrapper stop boundary, for example 30s, 10m, or 2h
--until <policy>            Wrapper stop policy: terminal or blocked-or-complete; default is terminal for target run, goal run, and loop run
--require-source-ready      Explicit source readiness assertion for onboarding; target/goal/loop run preflights source writeback by default
--require-devops-ready      Explicit DevOps readiness assertion for onboarding; remote target/goal/loop run preflights project DevOps by default
--execution-mode <mode>     owned-repository | read-only-public | fork-validated-pr | upstream-authorized
--upstream-repo <repo>      Public upstream repository for read-only or fork-validated PR mode
--working-repo <repo>       Writable repository where EvoPilot writes code and runs project DevOps when repository-native
--devops-owner <account>    GitHub owner or GitLab namespace whose account runs CI/CD
--devops-token-ref <ref>    Optional server-side DevOps tokenRef, otherwise source tokenRef is used
--credential-principal <id> Optional operator-readable principal expected behind the DevOps tokenRef
--llm-profile <id>          LLM profile for project onboarding or this Goal/Loop run
--require-llm-ready         Explicit LLM readiness assertion for onboarding/profile setup; target/goal/loop run preflights the selected LLM by default
--from-template <id>        Optional admin override for ProjectHarnessProfile generation, or required template id for profile upgrade
--from-template-version <v> Optional template version override for ProjectHarnessProfile generation or upgrade
--goal-loop-target <text>   Goal loop target used to draft a project-level ProjectHarnessProfile
--path <path>               HarnessTemplate pack directory for pack validate/publish
--root <path>               HarnessTemplate pack root directory for pack list
--source <kind=value>       HarnessTemplate evolution source: url=, github=, gitlab=, local-pack=, file=, template=, runtime-evidence=, or note=
--runtime-evidence <id>     HarnessTemplate evolution source pointing to runtime evidence or an evidence bundle id
--file <path>               HarnessTemplate evolution attachment or YAML/JSON file input for commands that accept files
--local-pack <path>         HarnessTemplate evolution source pack directory
--intent <text>             HarnessTemplate evolution objective reviewed by administrators
--target-version <version>  HarnessTemplate evolution target template version
--target-template <id>      HarnessTemplate evolution target template id
--refresh                   Recompute HarnessTemplate evolution impact
--level <debug|info|warn|error> EvoPilot structured logging level
--include-stack <true|false>    Include redacted stack traces in error logs
--json                      Print JSON response data
--config <file>             Config path, defaults to ~/.evopilot/config.json
```

## Output Schemas

Use `--json` for AI agents and CI. Human-readable output is for operators and can change.

| Command | JSON Schema | Important Fields |
|---|---|---|
| `status --json` | `evopilot-cli-status/v1` | `health`, `ready`, `api`, `summary`, `client`, `llmUsage` |
| `project onboard plan ... --json` | `evopilot-project-onboarding-checklist/v1` | `status`, `nextAction`, `missingInputs`, `blockers`, `commands`, `sourceCredentials`, `devops`, `llm`, `requestId` |
| `project onboard verify ... --json` | `evopilot-project-onboarding-checklist/v1` | Persisted project readiness, same fields as `plan`, including project LLM readiness |
| `project onboard ... --json` | `evopilot-cli-project-onboard/v1` | `projectId`, `sourceCredentials`, `devops`, `steps`, `result`, `llmUsage`; onboarding does not start Goal/Loop execution |
| `logging inspect/set --json` | `evopilot-logging-settings/v1` or `evopilot-logging-settings-update-result/v1` | `level`, `format`, `includeStack`, `source`, `updatedBy`, `updatedAt` |
| `harness template pack list/validate/publish ... --json` | `evopilot-harness-template-pack-*-v1` or `evopilot-harness-template-apply-result/v1` | `packs`, `localValidation`, `serverValidation`, `template`, `action`, `digest` |
| `harness template evolution create/advance/approve/publish/impact ... --json` | `evopilot-harness-template-evolution-*-result/v1` | `evolution`, `status`, `nextAction`, `draft`, `validation`, `sourceCoverage`, `impactReport` |
| `harness policy apply/activate ... --json` | `evopilot-tenant-harness-policy-*-result/v1` | `policy`, `summary`, `validation`, `compiledDigest`; active policies constrain matching project profiles |
| `harness profile generate ... --json` | `evopilot-project-harness-profile-generate-result/v1` | `profile`, `summary`, `validation`, `generatedBy`, `instruction`; generated profiles are DRAFT until activated |
| `harness profile validate/apply/activate ... --json` | `evopilot-project-harness-profile-*-result/v1` | `profile`, `summary`, `validation`, `diffFromActive`, `compiledDigest`, `templateRef`, `policyRefs` |
| `target plan ... --json` | `evopilot-cli-target-plan/v1` | `projectId`, `targetId`, `goalId`, `terminalMaturity`, `phasePlan.phases`, `phasePlan.targets`, `editablePlan`, `llmUsage` |
| `target plan diff ... --json` | `evopilot-cli-target-plan-diff/v1` | `addedTargets`, `removedTargets`, `changedTargets`, `changedPhases`, `baselineGuard` |
| `target run ... --json` | `evopilot-cli-goal-run/v1` | `status`, `steps`, `result`, `llmUsage` |
| `goal run ... --json` | `evopilot-cli-goal-run/v1` | `status`, `steps`, `result`, `llmUsage` |
| `loop run ... --json` | `evopilot-cli-loop-run/v1` | `loop`, `steps`, `result`, `llmUsage` |

Wrapper `result.exitCode=0` means the command reached its governed success boundary. `result.exitCode=2`, a non-zero process exit, or `nextAction` values such as `plan-target`, `approve-plan`, `connect-github-account`, `connect-gitlab-account`, `human-approval`, `configure-source-credentials`, `configure-devops`, `configure-llm-profile`, `policy-review`, `repair`, `BLOCKED`, `FAILED`, or `NO-GO` are stop conditions for automation.

Every wrapper schema includes `llmUsage` with `summary`, `process.responses[]`, and server-side usage evidence when the API returns it. Agents must report provider, model, token totals, and request IDs for LLM-backed runs.

## Auth

```bash
evopilot auth login --server <url> --username <user> --password <pass>
evopilot auth token
```

`auth login` stores server, token, tenant, workspace, and user metadata unless `--no-save` is used.

## Config

```bash
evopilot config path
evopilot config show
```

## Status

```bash
evopilot status --json
```

Checks `/health`, `/ready`, and authenticated `/api/v1/summary` when a token is configured.
It also reads `/api/v1/version` and returns `cli.version`, `api.serverVersion`, `api.apiContractVersion`, and `api.minimumCliVersion` when the server supports the version endpoint.

`status --json` also returns `status`, `client`, `config`, `missingConfig`, `diagnosis`, and `llmUsage`. If the API Server cannot be reached, the CLI still prints schema `evopilot-cli-status/v1` to stdout with `status=UNREACHABLE`, `diagnosis.code=SERVER_UNREACHABLE`, the configured server URL, config path, token/tenant/workspace/actor configuration flags, and an actionable `recommendedAction`, then exits `2`. Automation should read `llmUsage.summary.provider`, `llmUsage.summary.model`, and token fields before starting a cost-sensitive run.

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

Common register options:

```text
--name <name>
--profile-id <profile-id>
--root <path>
--git-url <url>
--base-url <url>
--project-id <gitlab-project-id>
--owner <github-owner>
--repo <owner/repo>
--repo-name <repo>
--branch <branch>
--execution-mode <owned-repository|read-only-public|fork-validated-pr|upstream-authorized>
--upstream-repo <owner/repo-or-group/project>
--working-repo <owner/repo-or-group/project>
--username <username>
--password <password>
--source-token <token>
--token-ref <server-side-token-ref>
```

Credential options:

```text
--username <username>
--password <password>
--source-token <token>
--token-ref <server-side-token-ref>
--branch <branch>
--clear-inline-token
--clear-password
--clear-token-ref
--llm-profile <llm-profile-id>
--require-llm-ready
```

`project onboard plan` is a non-mutating front-door checklist. It calls `POST /api/v1/onboarding/project/checklist` and returns `evopilot-project-onboarding-checklist/v1` with `status`, `steps`, `sourceCredentials`, `devops`, `missingInputs`, `blockers`, `commands`, `nextAction`, and `requestId`.

Writable GitHub/GitLab modes require an execution principal. If the checklist returns `nextAction=connect-github-account` or `nextAction=connect-gitlab-account`, the operator must connect or create the account/organization/group/service principal, fork or authorize the repository as needed, and store the server-side `tokenRef` before rerunning onboarding. Use `read-only-public` when no SCM account exists.

Use it before first project registration:

```bash
evopilot project onboard plan github \
  --repo owner/my-agent \
  --id my-agent \
  --token-ref GITHUB_TOKEN_MY_AGENT \
  --execution-mode owned-repository \
  --devops-owner owner \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --cd-workflow deploy-prod.yml \
  --deploy-environment production \
  --health-url https://my-agent.example.com/health \
  --llm-profile my-agent-llm \
  --json
```

`project onboard verify` replays the same checklist against a persisted project through `GET /api/v1/projects/{projectId}/onboarding-checklist`.

```bash
evopilot project onboard verify my-agent --json
```

`project onboard` is the mutating wrapper for a new project. It registers the repository, runs source credential preflight, optionally configures project DevOps, and runs DevOps preflight. It does not start Goal/Loop execution. After the project checklist is `READY_TO_RUN`, the next action is `plan-target`: run `target plan`, show and approve the phase plan, then run `target run`.

For GitHub/GitLab enterprise real loop onboarding, `--execution-mode`, `--token-ref`, `--devops-owner` or `--devops-namespace`, repository-native CI, a CD or production health boundary, and an explicit READY project LLM profile or `--llm-profile` are required unless the mode is explicitly `read-only-public`. `read-only-public` is analysis-only and cannot be used for real Goal/Loop execution.

`project onboard` returns a white-box result and next action after registration and preflight. For writable GitHub/GitLab modes it stops before Goal/Loop execution unless source writeback and project DevOps are ready. `--require-source-ready` and `--require-devops-ready` are accepted as explicit assertions for onboarding scripts, but enterprise wrapper runs enforce the same readiness by default.

Common onboard options:

```text
--id <project-id>
--repo <owner/repo>
--owner <github-owner>
--repo-name <github-repo>
--base-url <gitlab-or-github-api-base-url>
--project-id <gitlab-project-id>
--branch <branch>
--token-ref <server-side-secret-ref>
--execution-mode <owned-repository|read-only-public|fork-validated-pr|upstream-authorized>
--upstream-repo <owner/repo-or-group/project>
--working-repo <owner/repo-or-group/project>
--devops-owner <github-owner-or-gitlab-namespace>
--devops-token-ref <server-side-devops-secret-ref>
--credential-principal <principal>
--ci-workflow <workflow-file>
--ci-required-check <check>
--ci-required-stage <stage>
--ci-required-job <job>
--cd-workflow <workflow-file>
--deploy-environment <environment>
--health-url <url>
--ready-url <url>
--llm-profile <llm-profile-id>
--require-llm-ready
```

## Project DevOps

```bash
evopilot project devops set <project-id> --provider <github-actions|gitlab-ci> [options]
evopilot project devops inspect <project-id>
evopilot project devops preflight <project-id>
evopilot project devops clear <project-id>
```

Common options:

```text
--token-ref <server-side-token-ref>
--execution-mode <owned-repository|fork-validated-pr|upstream-authorized>
--upstream-repo <owner/repo-or-group/project>
--working-repo <owner/repo-or-group/project>
--devops-owner <github-owner-or-gitlab-namespace>
--devops-namespace <gitlab-namespace>
--workflow-repo <owner/repo-or-group/project>
--devops-token-ref <server-side-devops-secret-ref>
--source-mode <repository-native|external-source>
--workflow-provider <gitlab>
--workflow-base-url <gitlab-base-url>
--workflow-project-id <gitlab-project-id-or-path>
--workflow-branch <gitlab-branch>
--gitlab-ref <gitlab-pipeline-ref>
--credential-principal <principal>
--ci-workflow <workflow-file>
--ci-ref <ref>
--ci-required-check <check>
--ci-required-stage <stage>
--ci-required-job <job>
--ci-timeout-seconds <seconds>
--cd-workflow <workflow-file>
--deploy-environment <environment>
--cd-required-stage <stage>
--cd-required-job <job>
--deploy-input <key=value>
--health-url <url>
--ready-url <url>
--deploy-timeout-seconds <seconds>
```

DevOps configuration requires an explicit execution boundary. The CLI blocks ambiguous commands such as `evopilot project onboard github --repo apache/skywalking --with-devops` because it cannot know whether DevOps should run in the public upstream, a fork, a maintainer-owned namespace, or an explicitly configured external CI bridge.

Bridge mode is explicit. Use it only when GitHub is the source repository and GitLab CI is the execution system:

```bash
evopilot project devops set my-agent \
  --provider gitlab-ci \
  --source-mode external-source \
  --workflow-provider gitlab \
  --workflow-base-url https://gitlab.example.com \
  --workflow-repo platform/agent-ci \
  --gitlab-ref main \
  --execution-mode owned-repository \
  --devops-owner platform \
  --devops-token-ref GITLAB_CI_TOKEN \
  --ci-required-stage test \
  --ci-required-job build \
  --json
```

Execution modes:

| Mode | Use When | Required Principal | Claim Boundary |
|---|---|---|---|
| `owned-repository` | The same GitHub/GitLab owner controls source writeback and CI/CD. | Owner, organization, group, service account, deploy token, or GitHub App principal with write/CI permission. | `working-repo-ci` |
| `read-only-public` | The repository is public and no writable token/account is available. | None. | `read-only-analysis` |
| `fork-validated-pr` | The upstream is public or third-party, and EvoPilot works in a writable fork. | Operator-owned fork account/organization/group that runs CI/CD. | `fork-ci-pr` |
| `upstream-authorized` | A maintainer token can write to and run CI/CD in the upstream. | Upstream maintainer principal. | `upstream-release` |

`project devops preflight` returns `sourceMode`, `sourceProvider`, `workflowProvider`, `executionMode`, `repositoryOwner`, `devopsOwner`, `workflowRepository`, `credentialRef`, `credentialPrincipal`, and `claimBoundary`. Automation must stop when `status` is not `READY`, and must not claim a stronger result than `claimBoundary`.

## Secrets

```bash
evopilot secret list
evopilot secret set --id <secret-ref> --kind <kind> (--value <value>|--value-file <file>|--from-env <env>)
evopilot secret revoke <secret-ref>
```

Secret values are sent to the EvoPilot server once and are not printed back. Source and DevOps `tokenRef` resolution first checks server environment variables, then EvoPilot's secret vault.
Use `--value-file` or `--from-env` for private keys and other values that start with `-`.

Common kinds:

```text
source-token
deploy-token
github-app-private-key
github-webhook-secret
llm-key
llm-api-key
generic
```

## LLM Profiles

```bash
evopilot llm profile list
evopilot llm profile set <profile-id> --provider openai-compatible --base-url <url> --model <name> --api-key-ref <secret-ref>
evopilot llm profile inspect <profile-id>
evopilot llm profile preflight <profile-id>
```

Common profile options:

```text
--name <display-name>
--provider openai-compatible
--provider-name <provider-label>
--base-url <openai-compatible-base-url>
--model <model-name>
--model-name <model-name>
--api-key-ref <server-side-secret-ref>
--timeout-seconds <seconds>
--max-retries <n>
--default-max-output-tokens <tokens>
--max-output-tokens <tokens>
--temperature <0..2>
--thinking <type>
--disabled
```

`llm profile set` creates or updates a tenant/workspace-scoped profile. It stores only metadata and a server-side `apiKeyRef`; it does not print the raw key. Before creating a profile, store the key once:

```bash
evopilot secret set \
  --id LLM_API_KEY_QWEN_PRIVATE \
  --kind llm-key \
  --from-env LLM_API_KEY_QWEN_PRIVATE \
  --json
```

`llm profile preflight` returns `evopilot-llm-profile-readiness/v1` with:

```text
profileId
source
status
provider
model
baseUrl
apiKeyRef
checks[]
blockers[]
nextAction
```

Stop when `status` is not `READY`. Typical `nextAction` values are `store-llm-secret`, `configure-llm-profile`, and `repair-llm-provider`.

## Project LLM

```bash
evopilot project llm set <project-id> --profile <llm-profile-id>
evopilot project llm inspect <project-id>
evopilot project llm preflight <project-id>
evopilot project llm clear <project-id>
```

`project llm set` binds a project default LLM profile. Add `--require-llm-ready` during setup to assert the profile can resolve its key and pass provider preflight:

```bash
evopilot project llm set my-agent \
  --profile qwen-private \
  --require-llm-ready \
  --json
```

Goal and Loop creation resolve the LLM in this order:

```text
--llm-profile override -> project default profile -> server global default LLM
```

For GitHub/GitLab enterprise real loops, the selected profile must be explicit through a READY project default or a run-level `--llm-profile`; the server global default LLM is not sufficient for user/project attribution. Use `project llm clear` only for local/debug projects or explicitly non-enterprise runs that are allowed to fall back to the global default.

## Logging Control

```bash
evopilot logging inspect --json
evopilot logging set --level debug --include-stack false --json
```

`logging inspect` reads the server-side EvoPilot logging setting. `logging set` requires admin permission and updates the control-plane setting used by structured `evopilot-log/v1` output. Supported levels are `debug`, `info`, `warn`, and `error`; `format` is currently fixed to `json`. When no control-plane setting exists, the server uses `EVOPILOT_LOG_LEVEL` and `EVOPILOT_LOG_STACK`, defaulting to `info` and stack output enabled.

Agents should use `requestId`, `correlation.*`, `event`, `errorCode`, `diagnosis.recommendedAction`, and harness metadata such as `templateId`, `templateVersion`, `profileVersion`, `sourceDigest`, and `compiledDigest` to trace failures. Do not ask operators to expose raw tokens or secrets; structured logs are recursively redacted.

## Project Harness Profiles

```bash
evopilot harness template list
evopilot harness template inspect python-enterprise-harness
evopilot harness template inspect java-ddd-service-harness
evopilot harness template pack list harness-templates/public
evopilot harness template pack validate harness-templates/public/python-enterprise-harness
evopilot harness template pack publish harness-templates/public/python-enterprise-harness [--force]
evopilot harness template evolution list
evopilot harness template evolution create --base-template python-enterprise-harness --target-version <version> --intent <text> --source github=fastapi/fastapi#master
evopilot harness template evolution sources <evolution-id> --url https://example.com/harness-notes.md --file ./observability-notes.md --note "Add trace-linked error envelopes."
evopilot harness template evolution advance <evolution-id> [--llm-profile <id>] [--require-llm]
evopilot harness template evolution inspect <evolution-id>
evopilot harness template evolution approve <evolution-id> --confirmed-by <admin> --confirmation <text>
evopilot harness template evolution publish <evolution-id> [--force]
evopilot harness template evolution impact <evolution-id> [--refresh]
evopilot harness template apply --file <template.yaml> --changelog <text> [--force]
evopilot harness template update --file <template.yaml> --changelog <text> [--force]
evopilot harness template upgrade --file <template.yaml> --changelog <text> [--force]
evopilot harness policy list
evopilot harness policy inspect default
evopilot harness policy apply --file <policy.yaml> [--changelog <text>]
evopilot harness policy update --file <policy.yaml> [--changelog <text>]
evopilot harness policy upgrade --file <policy.yaml> [--changelog <text>]
evopilot harness policy activate default --version <n>
evopilot harness profile list --project <project-id>
evopilot harness profile generate --project <project-id> --goal-loop-target <text> [--llm-profile <id>] [--from-template <template-id>]
evopilot harness profile validate --project <project-id> --file <profile.yaml>
evopilot harness profile apply --project <project-id> --file <profile.yaml>
evopilot harness profile diff --project <project-id> --file <profile.yaml>
evopilot harness profile inspect default --project <project-id>
evopilot harness profile explain default --project <project-id>
evopilot harness profile activate default --project <project-id> --version <n>
evopilot harness profile upgrade default --project <project-id> --from-template python-enterprise-harness --from-template-version <version>
```

`ProjectHarnessProfile` is a project-level control-plane profile, not a per-goal plan and not a target maturity template. It defines the project's capability boundaries, runtime commands, validation rules, evidence contract, failure handling, diagnostics, observability, release governance, LLM draft policy, and the template and policy versions/digests it inherits.

`HarnessTemplate` is an administrator-managed control-plane resource. Fresh installs include multiple built-in template types:

```text
python-enterprise-harness@1.1.0
java-ddd-service-harness@1.1.0
node-saas-control-plane-harness@1.1.0
go-middleware-harness@1.1.0
observability-apm-harness@1.1.0
generic-management-software-harness@1.1.0
```

Built-in templates are initialized from selected public projects, official specifications, and long-running enterprise engineering practice, then fixed inside EvoPilot as structured template data. The `@1.1.0` baselines include structured logs, exception tracking, trace correlation, SLO monitoring, alert routing, operational runbooks, language-specific diagnostics, and release evidence rules. Inspect `sourceReferences[]` to see that initialization basis. Project onboarding automatically matches one published template from project runtime/repository context and the goal loop target. `--from-template` is an explicit administrator or advanced override, not the normal first-onboarding path.

The recommended administrator editing model is the human-readable template pack directory under `harness-templates/public/<template-id>/`:

```text
README.md
template.yaml
CHANGELOG.md
examples/default-project-profile.yaml
```

Administrators validate and publish packs with a deliberately small CLI surface:

```bash
evopilot harness template pack list harness-templates/public --json
evopilot harness template pack validate harness-templates/public/python-enterprise-harness --json
evopilot harness template pack publish harness-templates/public/python-enterprise-harness --json
```

`pack validate` performs local pack-shape checks and calls the server's non-persistent `POST /api/v1/harness/templates/validate`. `pack publish` repeats server validation before writing the version through the control plane. EvoPilot intentionally does not expose first-stage `compile`, `diff`, or `publish-all` pack commands; use Git for file diffs and add batch publishing later only if CI/admin usage needs it.

`harness template evolution` is the administrator lifecycle for upgrading a public template from reviewable knowledge sources without bypassing the control plane. Sources can be `url=`, `github=owner/repo#ref`, `gitlab=`, `local-pack=`, `file=`, `template=<id>@<version>`, `runtime-evidence=<id>`, or `note=`.

```bash
evopilot harness template evolution create \
  --base-template python-enterprise-harness \
  --target-version 1.1.7 \
  --intent "Add Python exception tracking and AI troubleshooting metadata." \
  --source github=fastapi/fastapi#master \
  --source url=https://opentelemetry.io/docs/languages/python/ \
  --file ./workspace-observability-notes.md \
  --note "Require requestId/traceId/errorCode on every error log." \
  --json
```

Advance is intentionally step-based and server-governed:

```bash
evopilot harness template evolution advance <evolution-id> --json
evopilot harness template evolution advance <evolution-id> --json
evopilot harness template evolution advance <evolution-id> --llm-profile platform-harness-llm --json
```

The lifecycle is `CREATED -> SOURCES_COLLECTED -> ANALYZED -> REVIEW_REQUIRED -> APPROVED -> PUBLISHED`. `REVIEW_REQUIRED` returns a reviewable `draft` with `pack.readme`, `pack.templateYaml`, `pack.changelog`, `pack.examples`, `validation`, `diffFromBase`, `sourceCoverage`, and `generatedBy`. The first-stage GitHub source collector reads repository README files through `raw.githubusercontent.com`; text, Markdown, YAML, JSON, and similar attachments are semantically extracted, while binary PDF/PPT/DOCX attachments record digest and warning only.

Publishing requires explicit administrator approval:

```bash
evopilot harness template evolution approve <evolution-id> \
  --confirmed-by platform-admin \
  --confirmation "Reviewed the draft, validation, source coverage, and impact." \
  --json
evopilot harness template evolution publish <evolution-id> --json
evopilot harness template evolution impact <evolution-id> --refresh --json
```

LLM output is draft-only. The server validates the draft again during publish, records audit events, writes the new `HarnessTemplate` version only after approval, and generates an impact report for active project profiles that still bind older versions or digests. Existing active `ProjectHarnessProfile` versions are never silently rewritten; administrators must generate or upgrade reviewed project profile revisions and activate them.

Administrators can also publish direct YAML/JSON template files through the lower-level aliases:

```bash
evopilot harness template upgrade \
  --file python-enterprise-harness-1.2.0.yaml \
  --changelog "Add organization-specific runtime and observability defaults." \
  --json
```

`apply`, `update`, and `upgrade` are aliases for publishing a template version. The file must contain `schema: evopilot-harness-template/v1`, `id`, `version`, and the template sections. YAML or JSON is authoritative; Markdown documents the pack and examples. The server computes `digest`, stores the version under the control plane, and requires a changelog entry for that version. Include `sourceReferences[]` when the template is derived from public projects, official docs, or internal engineering practice. Reusing an existing `id@version` is rejected unless `--force` is supplied; prefer publishing a new version for normal changes. Existing active `ProjectHarnessProfile` versions keep their old `templateRef` until an administrator generates or upgrades a new profile revision.

`TenantHarnessPolicy` is the tenant/workspace private control layer between public templates and project profiles. Administrators publish policy versions with `harness policy apply|update|upgrade`, then explicitly activate a reviewed version. A policy can require organization-specific capabilities, evidence fields, correlation IDs, structured log fields, exception attributes, diagnostics, observability, governance booleans, and phase mappings. It is stored under `<dataRoot>/tenant-harness-policies/<tenantId>/<workspaceId>/<policyId>/versions/v<version>.json` with source/compiled digests and changelog entries. Active policies are applied automatically during `harness profile generate`, `validate`, and `apply`; `harness profile activate` and `target plan`/`goal plan` block with `PROJECT_HARNESS_PROFILE_POLICY_STALE` if the profile does not bind the current active policy version and digest.

Policy source files can be YAML or JSON:

```yaml
schema: evopilot-tenant-harness-policy/v1
policyId: default
name: Workspace private harness policy
appliesTo:
  languageFamilies:
    - python
requiredCapabilities:
  - id: tenant-audit-boundary
    name: Tenant audit boundary
    boundary: Every project profile preserves tenant audit and repair evidence.
    requiredEvidence:
      - tenant-audit-proof
evidence:
  correlationFields:
    - tenantId
    - workspaceId
    - projectId
    - requestId
    - traceId
observability:
  structuredLogs:
    requiredFields:
      - tenantId
      - workspaceId
      - projectId
      - errorCode
governance:
  tenantPolicyRequired: true
  cannotWeaken:
    - tenantPolicyRequired
enforcement:
  requiredGovernanceTrue:
    - tenantPolicyRequired
```

Generated profiles are stored as `DRAFT` versions. A user or administrator must review the profile, run `validate` or `apply`, and then call `activate` before goal planning binds it. When an active profile exists, `target plan` and `goal plan` include `plan.projectHarness.profileId`, `version`, `templateRef`, `policyRefs`, `sourceDigest`, and `compiledDigest`; those fields make the plan reproducible and auditable.

Profile files can be YAML or JSON. The server is the source of truth; the file is only an import source:

```yaml
schema: evopilot-project-harness-profile/v1
profileId: default
projectId: my-agent
name: My Agent Python Harness
template:
  templateId: python-enterprise-harness
runtime:
  language: python
  installCommands:
    - pip install -e .
  lintCommands:
    - ruff check .
  typecheckCommands:
    - mypy .
  unitCommands:
    - pytest
  smokeCommands:
    - pytest -q tests
validation:
  commands:
    - installCommands
    - lintCommands
    - typecheckCommands
    - unitCommands
    - smokeCommands
evidence:
  requiredArtifacts:
    - target-evidence-package
    - phase-package
    - goal-completion-report
governance:
  tenantWorkspaceScopeRequired: true
  targetPlanRequiresApproval: true
  profileActivationRequiresApproval: true
  promotionRequiresReleaseDecision: true
  sourceClosureRequired: true
  noSilentProfileMutation: true
```

Use `explain` when an administrator wants to see how one profile maps to EvoPilot modules. It returns the mapping from profile sections to project onboarding, goal target planning, executor/runtime, evidence, failure diagnostics, observability, and release governance.

## GitHub App

```bash
evopilot github-app installation list
evopilot github-app installation set --id <id> --installation-id <github-installation-id> --account <org-or-user> [options]
evopilot github-app installation preflight <id>
```

Common options:

```text
--private-key-secret-ref <secret-ref>
--webhook-secret-ref <secret-ref>
--repository <owner/repo>
--permission <name=value>
```

## Evidence

```bash
evopilot evidence push --project <project-id> --file <events.json>
```

The file must contain a JSON event object or an array of events accepted by EvoPilot evidence ingestion.

## Maturity Standards

```bash
evopilot maturity standards list
evopilot maturity standards inspect <alpha|beta|rc|ga|standard-id>
```

`maturity standards list` returns the active versioned maturity set. The default standard set is `evopilot-default/v1` and the terminal maturity is GA. `inspect` returns one `evopilot-maturity-standard-template/v1` with baseline rules, acceptance criteria, required evidence, review capabilities, package outputs, GO/NO-GO rules, and override policy.

## Target

```bash
evopilot target list [--project <project-id>]
evopilot target create --project <project-id> [--id <target-id>] [--criteria <target.json>]
evopilot target plan --project <project-id> --objective <business-goal> [--llm-profile <id>]
evopilot target plan export <goal-id> [--format json|yaml]
evopilot target plan diff <goal-id> --file <plan.json>
evopilot target plan apply <goal-id> --file <plan.json>
evopilot target plan approve <goal-id> --confirmed-by <user-or-owner> --confirmation <text>
evopilot target run --project <project-id> --objective <business-goal> [--llm-profile <id>]
evopilot target decision <target-id> [--project <project-id>]
```

`target plan` creates or reuses the project release target and GlobalGoal, generates the server plan, and returns the Alpha -> Beta -> RC -> GA phase plan for user review. `target plan export` writes the same plan shape that `target plan apply` accepts, so a user or WorkBuddy can edit project-specific targets or strengthen phase criteria, run `diff`, apply the proposal, and then approve it.

`target run` is the one-command wrapper for a project release target. It requires a business `--objective`; do not write the objective as "promote to GA" unless that is the actual business outcome. The terminal maturity is GA, and EvoPilot always expands the goal through Alpha, Beta, RC, and GA. If the plan is not approved, the wrapper stops at `PENDING_PLAN_APPROVAL` and returns `nextAction=approve-plan`. WorkBuddy and other digital-human callers must run `target plan`, show the phase plan to the user or project owner, wait for confirmation, approve, and only then run the wrapper.

`target plan approve` and `goal approve-plan` require `--confirmed-by` and `--confirmation`. The CLI rejects the command before calling the server when either value is missing, and the API also rejects direct approval requests without the same confirmation payload. AI Agents must not fabricate these values.

`--until` does not confirm or skip phases. It only controls wrapper stop behavior. `target run`, `goal run`, and `loop run` default to `--until terminal`; `--until blocked-or-complete` is mainly useful for low-level `loop run` when an agent should stop as soon as the LoopRun becomes `BLOCKED`.

Before Goal/Loop execution, `target run` always checks source writeback, project DevOps for GitHub/GitLab projects, and selected LLM readiness. Use `--require-source-ready`, `--require-devops-ready`, or `--require-llm-ready` only as explicit assertions for scripts that want the command line to state the contract.
Use `--llm-profile <id>` to override the project default LLM for this run. If the selected profile is blocked, the wrapper stops before Loop execution and returns `nextAction=store-llm-secret`, `configure-llm-profile`, or `repair-llm-provider`.

The CLI does not accept maturity-template parameters for `target plan`, `target run`, or `project onboard`. GA is the fixed terminal maturity. The server generates the Alpha -> Beta -> RC -> GA phase plan from the business `--objective`, the active maturity standard set, and project release evidence.

`target run`, `goal run`, `loop run`, and `project onboard` wrapper output includes command-level and step-level LLM visibility:

```text
llmUsage.client.surface
llmUsage.summary.provider
llmUsage.summary.model
llmUsage.summary.totalTokens
llmUsage.summary.inputTokens
llmUsage.summary.outputTokens
llmUsage.summary.creditsConsumed
llmUsage.process.responses[].requestId
llmUsage.server.steps[].nodeId
llmUsage.server.steps[].totalTokens
```

Use `--client workbuddy` or `EVOPILOT_CLI_CLIENT=workbuddy` when WorkBuddy invokes the CLI. EvoPilot HTTP logs store the same caller under `metadata.client.surface` and request token deltas under `metadata.llmUsage.request.totalTokens`.

## Goal

```bash
evopilot goal create --project <id> --target <target-id> --objective <text>
evopilot goal list [--project <id>] [--target <target-id>] [--status <status>]
evopilot goal inspect <goal-id>
evopilot goal plan <goal-id>
evopilot goal approve-plan <goal-id> --confirmed-by <user-or-owner> --confirmation <text>
evopilot goal targets <goal-id>
evopilot goal phases <goal-id>
evopilot goal phase-package <goal-id> --phase <alpha|beta|rc|ga>
evopilot goal target-package <goal-id> --target <target-id>
evopilot goal advance <goal-id> [--no-auto-start] [--approve-human-gate]
evopilot goal run [<goal-id>] [--project <id> --target <target-id> --objective <text>]
evopilot goal snapshot <goal-id>
evopilot goal graph <goal-id>
evopilot goal timeline <goal-id>
evopilot goal evidence-matrix <goal-id>
evopilot goal final-report <goal-id>
```

`goal phases` returns the current Alpha/Beta/RC/GA phase projection. `goal target-package` returns one GoalTarget's package with acceptance criteria, required evidence, LoopRun status, source closure gate evidence, blockers, LLM usage, and GO/NO-GO decision. `goal phase-package` returns the phase package with target summary, acceptance criteria, required evidence, blockers, review capabilities, package outputs, target package list, and GO/NO-GO decision.
GoalTargets are `DONE` only when their `TargetEvidencePackage.status` is `GO`; a `LoopRun.status=SUCCEEDED` without required package/source/DevOps evidence leaves the target blocked.
`goal advance` advances one server-governed step. It is atomic even when a wrapper command calls it repeatedly.
`goal create` and `goal run` accept `--llm-profile <id>` for run-level LLM selection.

## Loop

```bash
evopilot loop create --project <id> --target <target-id> --objective <text>
evopilot loop list
evopilot loop start <loop-id>
evopilot loop approve <loop-id>
evopilot loop run [<loop-id>] [--project <id> --target <target-id> --objective <text>]
```

Common loop options:

```text
--source-closure <json-file>
--executor-graph <graph-id>
--force-decision <SUCCEED|BLOCK|FAIL>
--max-iterations <n>
--until <terminal|blocked-or-complete>  # default: terminal
--llm-profile <llm-profile-id>
--require-llm-ready
```

## Source Closure

```bash
evopilot source-closure preflight <loop-id>
evopilot source-closure execute <loop-id> --write-file <repo-path>:<local-file>
evopilot source-closure approve-release <loop-id>
evopilot source-closure reject-release <loop-id> [--reason <text>]
evopilot source-closure merge <loop-id>
evopilot source-closure auto-merge <loop-id>
```

Common execute options:

```text
--branch <branch>
--message <commit-message>
--write-file <repo-path>:<local-file>
```

## Release Run

```bash
evopilot release-run list [--loop <loop-id>]
evopilot release-run inspect <run-id> [--loop <loop-id>]
evopilot release-run repair-candidates [--include-repaired]
evopilot release-run repair <run-id> [--execute]
evopilot release-run repair-all [--execute]
evopilot release-run finalizers [--status <PENDING|SUCCEEDED|FAILED>]
```

## Worker

```bash
evopilot worker queue
evopilot worker leases
evopilot worker claim --worker-id <id> [--loop <loop-id>]
evopilot worker heartbeat --worker-id <id> --loop <loop-id>
```

## Sandbox

```bash
evopilot sandbox proof <loop-id>
evopilot sandbox verify <loop-id>
```

## Replay

```bash
evopilot replay checkpoints <loop-id>
evopilot replay run <loop-id> [--from-iteration <n>]
```

## Trace

```bash
evopilot trace tree <loop-id>
evopilot trace events <loop-id>
```

## Audit

```bash
evopilot audit list [--limit <n>]
```

`--limit` is sent to `/api/v1/audit?limit=<n>&order=desc`, so the server reads and returns only the newest bounded audit records instead of streaming the entire audit log to the CLI. Use `--limit 50 --json` for WorkBuddy troubleshooting; omit `--limit` only when an operator intentionally needs the full audit history.

## Deploy Connectors

```bash
evopilot connector deploy list
evopilot connector deploy create --id <id> --type <http-webhook|ecs-docker-compose>
```

Common create options:

```text
--url <url>
--connector-token <token>
--token-ref <server-side-token-ref>
--working-dir <server-path>
--compose-file <compose-file>
--service-name <service>
--git-remote <remote>
--health-path <path>
--ready-path <path>
--timeout-seconds <seconds>
```

## Release

```bash
evopilot release gate --project <id> --target <target-id> --scenario <id=PASS>
evopilot release current
evopilot release decisions [--project <id>] [--target <target-id>]
```

Release verdicts must come from EvoPilot release decisions, not from CLI-side inference.
