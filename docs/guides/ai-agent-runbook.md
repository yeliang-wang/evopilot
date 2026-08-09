# AI Agent Runbook

> Production runbook for WorkBuddy, Codex, Claude Code, CI jobs, and other AI agents that operate EvoPilot through the CLI.

EvoPilot is the system of record for projects, credentials, LLM profiles, goals, loops, evidence, release decisions, tenant/workspace scope, and audit. Harness lifecycle management belongs to `evopilot-harness`. The EvoPilot CLI is an HTTP adapter and must not bypass RBAC, approval gates, source-closure preflight, release policy, deployment gates, or audit.

## Harness Catalog Precondition

Before using EvoPilot for domain-aware planning, an administrator publishes a usable Harness with `evopilot-harness` and makes the published Catalog directory visible to the EvoPilot server:

```bash
EVOPILOT_HARNESS_CATALOG_DIR=/opt/evopilot/.evopilot/external-harness-catalogs/evopilot-public-harness-catalog
EVOPILOT_HARNESS_CATALOG_DIRS=/opt/catalogs/database:/opt/catalogs/gateway
```

The directory must contain `CATALOG.md`. EvoPilot reads it dynamically during `target plan` or `goal plan` and records the selected published Harness as `plan.selectedHarness`. EvoPilot does not expose `evopilot harness ...` commands, Harness write APIs, Catalog mutation APIs, or Harness lifecycle activation.

If `plan.selectedHarness` is missing, stop and report that no suitable published Harness was available. The remediation is to publish or republish a Harness in `evopilot-harness`, configure the server Catalog directory, and generate a new plan.

## Fast Path

Configure access with environment variables. Prefer env vars over saved config for automation.

```bash
export EVOPILOT_SERVER="https://evopilot.example.com"
export EVOPILOT_API_TOKEN="<operator-or-admin-token>"
export EVOPILOT_TENANT="tenant-production"
export EVOPILOT_WORKSPACE="workspace-agent-products"
export EVOPILOT_ACTOR="workbuddy"
export EVOPILOT_CLI_CLIENT="workbuddy"
```

Verify the control plane before making changes:

```bash
evopilot config show --json
evopilot status --json
evopilot logging inspect --json
```

For a first-time GitHub or GitLab project, ask EvoPilot for a checklist before mutating state:

```bash
evopilot project onboard plan github \
  --repo owner/my-agent \
  --id my-agent \
  --branch main \
  --token-ref GITHUB_WRITE_TOKEN_MY_AGENT \
  --execution-mode owned-repository \
  --devops-owner owner \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --ci-required-check test \
  --cd-workflow deploy-prod.yml \
  --deploy-environment production \
  --health-url https://my-agent.example.com/health \
  --llm-profile my-agent-llm \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for My Agent" \
  --json
```

Read `status`, `steps`, `sourceCredentials`, `devops`, `missingInputs`, `blockers`, `commands`, and `nextAction`. If `nextAction=store-secret`, use the suggested `secret set` command only from a trusted shell. If `nextAction=connect-github-account`, `connect-gitlab-account`, or `configure-llm-profile`, stop until that prerequisite is repaired. If `nextAction=register-project`, run `project onboard`. If `nextAction=plan-target`, generate the phase plan.

```bash
evopilot project onboard github \
  --repo owner/my-agent \
  --id my-agent \
  --branch main \
  --token-ref GITHUB_WRITE_TOKEN_MY_AGENT \
  --execution-mode owned-repository \
  --devops-owner owner \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --ci-required-check test \
  --cd-workflow deploy-prod.yml \
  --deploy-environment production \
  --health-url https://my-agent.example.com/health \
  --llm-profile my-agent-llm \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for My Agent" \
  --json
```

## Project LLM

For GitHub/GitLab enterprise loops, use an explicit READY project LLM profile or run-level `--llm-profile`. Do not rely on a global debug LLM for user/project attribution.

```bash
export LLM_API_KEY_MY_AGENT="<real-llm-api-key>"

evopilot secret set \
  --id LLM_API_KEY_MY_AGENT \
  --kind llm-key \
  --scope workspace \
  --from-env LLM_API_KEY_MY_AGENT \
  --json

evopilot llm profile set my-agent-llm \
  --scope workspace \
  --provider-preset custom \
  --provider-name qwen-private \
  --base-url https://llm.example.com/v1 \
  --model qwen2.5-coder-32b \
  --api-key-ref LLM_API_KEY_MY_AGENT \
  --json

evopilot llm profile preflight my-agent-llm --json
evopilot project llm set my-agent --profile my-agent-llm --json
```

Daily commands pass only the LLM profile id, never the raw key.

## Plan And Run

For an already registered project, verify source, DevOps, LLM, and onboarding readiness:

```bash
evopilot project preflight my-agent --json
evopilot project devops preflight my-agent --json
evopilot project llm preflight my-agent --json
evopilot project onboard verify my-agent --json
```

Generate the plan:

```bash
evopilot target plan \
  --project my-agent \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for My Agent" \
  --llm-profile my-agent-llm \
  --json
```

Stop after planning. Show the project owner:

- `plan.selectedHarness.harnessId`
- `plan.selectedHarness.version`
- `plan.selectedHarness.domain`
- `plan.selectedHarness.catalogId`
- `plan.selectedHarness.catalogDigest`
- `plan.selectedHarness.entryPath`
- `plan.selectedHarness.entryDigest`
- `plan.selectedHarness.matchReasons`
- Alpha -> Beta -> RC -> GA phase plan and editable targets

Approve only after explicit owner confirmation:

```bash
evopilot target plan approve <goal-id> \
  --confirmed-by "project-owner" \
  --confirmation "Project owner reviewed selectedHarness and approved the Alpha/Beta/RC/GA phase plan" \
  --json
```

Run the approved goal:

```bash
evopilot target run \
  --project my-agent \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for My Agent" \
  --llm-profile my-agent-llm \
  --max-steps 20 \
  --json
```

Stop on `nextAction`, blockers, `NO-GO`, `BLOCKED`, `FAILED`, credential repair, LLM repair, human approval, timeout, or max-step boundaries.

## Required Final Summary

Report these fields for automation handoff:

- `requestId` and correlation ids
- project id, goal id, target ids, loop ids
- `selectedHarness` id, version, domain, catalog id, catalog digest, entry path, and entry digest
- LLM provider, model, input/output/total tokens, credits, and `llmRequestId`
- `TargetEvidencePackage` ids and status
- `PhasePackage` decision status and blockers
- release decision id/status and GO/NO-GO reason
- unresolved `nextAction` or blockers

## Troubleshooting

Use JSON and server evidence:

```bash
evopilot logging inspect --json
evopilot goal status <goal-id> --json
evopilot goal run-status <goal-id> --json
evopilot goal timeline <goal-id> --json
evopilot goal evidence-matrix <goal-id> --json
```

Common blockers:

| Blocker | Meaning | Action |
|---|---|---|
| `selectedHarness` missing | No suitable published Harness was available from configured Catalogs. | Publish/configure a Harness in `evopilot-harness`, then regenerate the plan. |
| `LLM_PROFILE_NOT_READY` | The selected LLM profile cannot preflight. | Repair the server-side secret or provider config. |
| `SOURCE_CREDENTIAL_TOKEN_REQUIRED` | The server cannot resolve the project source credential. | Store or repair the project tokenRef. |
| `PENDING_PLAN_APPROVAL` | The phase plan has not been approved. | Show the plan and selected Harness evidence to the owner, then approve with confirmation. |
| `NO-GO` | Release evidence failed. | Use the phase package blockers and evidence matrix; do not claim release readiness. |

Do not create, approve, publish, or mutate Harness definitions from EvoPilot. Use `evopilot-harness` for those operations.
