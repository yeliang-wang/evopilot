# EvoPilot CLI

Command-line client for operating an EvoPilot control-plane server from terminals, CI jobs, release scripts, and AI agents.

The CLI is an HTTP client. It does not start EvoPilot locally and does not bypass server-side RBAC, tenant/workspace scope, approval gates, source-closure preflight, release policy, deployment gates, or audit records.

## Quick Start

Install the current release CLI tarball set:

```bash
npm install -g \
  https://github.com/yeliang-wang/evopilot/releases/download/v2.4.2/evopilot-contracts-2.4.2.tgz \
  https://github.com/yeliang-wang/evopilot/releases/download/v2.4.2/evopilot-client-2.4.2.tgz \
  https://github.com/yeliang-wang/evopilot/releases/download/v2.4.2/evopilot-cli-2.4.2.tgz
```

Use `npm install -g @evopilot/cli@2.4.2` only after public npm registry publication has been verified for that exact version.

```bash
evopilot --server https://evopilot.example.com auth login \
  --username <user> \
  --password <password>

evopilot status --json
```

For short-lived automation, pass a bearer token through the environment:

```bash
export EVOPILOT_SERVER="https://evopilot.example.com"
export EVOPILOT_API_TOKEN="<operator-or-admin-token>"
export EVOPILOT_TENANT="tenant-production"
export EVOPILOT_WORKSPACE="workspace-agent-products"
export EVOPILOT_ACTOR="workbuddy"

evopilot target plan \
  --project <project-id> \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for the project" \
  --llm-profile <llm-profile-id> \
  --json

evopilot target plan export <goal-id> --format json > /tmp/evopilot-phase-plan.json
evopilot target plan diff <goal-id> --file /tmp/evopilot-phase-plan.json --json
# STOP: show the phase plan to the user or project owner; continue only after explicit confirmation.
evopilot target plan approve <goal-id> \
  --confirmed-by "project-owner" \
  --confirmation "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan" \
  --json

evopilot target run \
  --project <project-id> \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for the project" \
  --max-steps 20 \
  --llm-profile <llm-profile-id> \
  --json
```

WorkBuddy, Codex, Claude Code, and digital-human sessions must show the generated Alpha/Beta/RC/GA phase plan to the user or project owner before `target plan approve`. Approval requires `--confirmed-by` and `--confirmation`; AI Agents must not fabricate those values.
Before Goal/Loop execution, wrapper commands preflight source writeback, project DevOps readiness, and selected LLM readiness by default. Project DevOps can be GitHub-native, GitLab-native, or explicit GitHub source + GitLab CI bridge. GitHub/GitLab enterprise real loops require an explicit READY project LLM profile or run-level `--llm-profile`; the server global default LLM is not sufficient for user/project attribution.

For a new GitHub project, ask for a checklist before mutating state:

```bash
evopilot project onboard plan github \
  --repo <owner>/<repo> \
  --id <project-id> \
  --token-ref GITHUB_TOKEN_<PROJECT> \
  --execution-mode owned-repository \
  --devops-owner <owner> \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --cd-workflow deploy-prod.yml \
  --deploy-environment production \
  --health-url https://<app>/health \
  --llm-profile <llm-profile-id> \
  --json
```

Then use the onboarding wrapper after the writable tokenRef exists on the EvoPilot server:

```bash
evopilot project onboard github \
  --repo <owner>/<repo> \
  --id <project-id> \
  --token-ref GITHUB_TOKEN_<PROJECT> \
  --execution-mode owned-repository \
  --devops-owner <owner> \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --cd-workflow deploy-prod.yml \
  --deploy-environment production \
  --health-url https://<app>/health \
  --llm-profile <llm-profile-id> \
  --json
```

After registration, verify persisted readiness:

```bash
evopilot project onboard verify <project-id> --json
evopilot harness template list --json
evopilot harness policy list --json
evopilot harness profile generate \
  --project <project-id> \
  --goal-loop-target "Define the project harness for this project" \
  --llm-profile <llm-profile-id> \
  --json
evopilot harness profile activate default --project <project-id> --version 1 --json
evopilot target plan --project <project-id> --objective "Enable the requested business capability and lifecycle evidence" --llm-profile <llm-profile-id> --json
```

`ProjectHarnessProfile` is a project-level control-plane definition. It is generated or imported as YAML/JSON, validated by the server, activated explicitly, and then bound into `GoalPlan.projectHarness` by version and digest. If the tenant/workspace has an active `TenantHarnessPolicy`, the compiled profile also includes `policyRefs[]`; activation and goal planning are blocked when the profile was compiled against an older active policy.

Fresh installs include runtime template harnesses such as `python-enterprise-harness`, `java-ddd-service-harness`, `node-saas-control-plane-harness`, `go-middleware-harness`, and `observability-apm-harness`, plus v2 domain templates `database-product-harness` and `api-gateway-harness`. Project onboarding automatically matches a published template from domain signals, project runtime/repository context, and the goal loop target; `--from-template` is only an explicit administrator or advanced override. Inspect `sourceReferences[]` to see the public projects, official specifications, or engineering-practice sources used to initialize a template. The authoritative template format is YAML or JSON; Markdown is documentation only.

Administrators can publish or replace template harness versions through the separate server-governed administrator CLI channel:

```bash
evopilot harness template upgrade \
  --file <template.yaml> \
  --changelog "Describe this template version." \
  --json
```

The same `id@version` requires `--force`; normal updates should publish a new version and then draft project profile upgrades from it.

Administrators can publish tenant/workspace private constraints through a separate policy channel:

```bash
evopilot harness policy apply \
  --file <policy.yaml> \
  --changelog "Describe this private policy version." \
  --json
evopilot harness policy activate default --version <policy-version> --json
```

Policy source files use `schema: evopilot-tenant-harness-policy/v1` and can require organization-specific capabilities, evidence fields, correlation IDs, structured log fields, exception attributes, diagnostics, observability, governance booleans, and phase mappings for matching project profiles.

## Documentation

The canonical CLI documentation lives in the EvoPilot repository:

- `docs/cli/README.md`
- `docs/cli/workflows.md`
- `docs/cli/commands.md`
- `docs/cli/automation.md`
