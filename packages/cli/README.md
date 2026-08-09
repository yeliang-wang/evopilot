# EvoPilot CLI

Command-line client for operating an EvoPilot control-plane server from terminals, CI jobs, release scripts, and AI agents.

The CLI is an HTTP client. It does not start EvoPilot locally and does not bypass server-side RBAC, tenant/workspace scope, approval gates, source-closure preflight, release policy, deployment gates, or audit records.

## Quick Start

Install the current release CLI tarball set:

```bash
npm install -g \
  https://github.com/yeliang-wang/evopilot/releases/download/v3.1.0/evopilot-contracts-3.1.0.tgz \
  https://github.com/yeliang-wang/evopilot/releases/download/v3.1.0/evopilot-client-3.1.0.tgz \
  https://github.com/yeliang-wang/evopilot/releases/download/v3.1.0/evopilot-cli-3.1.0.tgz
```

Use `npm install -g @evopilot/cli@3.1.0` only after public npm registry publication has been verified for that exact version.

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
evopilot target plan --project <project-id> --objective "Enable the requested business capability and lifecycle evidence" --llm-profile <llm-profile-id> --json
```

EvoPilot v3 has no `evopilot harness ...` command group. Harness lifecycle, source evolution, review, approval, versioning, and publication are owned by `evopilot-harness`. The EvoPilot server reads the configured Harness Registry and enabled published Catalog directories, then records the selected published Harness as `plan.selectedHarness` during `target plan` or `goal plan`. Show `selectedHarness` id, version, registry digest, catalog id, catalog digest, entry path, and entry digest before approving a phase plan.

## Documentation

The canonical CLI documentation lives in the EvoPilot repository:

- `docs/cli/README.md`
- `docs/cli/workflows.md`
- `docs/cli/commands.md`
- `docs/cli/automation.md`
