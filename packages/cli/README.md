# EvoPilot CLI

Command-line client for operating an EvoPilot control-plane server from terminals, CI jobs, release scripts, and AI agents.

The CLI is an HTTP client. It does not start EvoPilot locally and does not bypass server-side RBAC, tenant/workspace scope, approval gates, source-closure preflight, release policy, deployment gates, or audit records.

## Quick Start

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

evopilot target run \
  --project <project-id> \
  --template ga \
  --objective "Promote the project to GA with source closure, native DevOps evidence, deploy evidence, and release decision" \
  --until terminal \
  --max-steps 20 \
  --require-devops-ready \
  --json
```

## Documentation

The canonical CLI documentation lives in the EvoPilot repository:

- `docs/cli/README.md`
- `docs/cli/workflows.md`
- `docs/cli/commands.md`
- `docs/cli/automation.md`
