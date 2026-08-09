# EvoPilot CLI Quickstart For AI Agents

> Shortest safe path for WorkBuddy and other AI agents that operate EvoPilot through the CLI.

This quickstart assumes EvoPilot already runs as a remote API server and the caller has an EvoPilot API token. The CLI does not start EvoPilot locally.

## 1. Configure The Session

```bash
export EVOPILOT_SERVER="https://evopilot.example.com"
export EVOPILOT_API_TOKEN="<operator-or-admin-token>"
export EVOPILOT_TENANT="tenant-production"
export EVOPILOT_WORKSPACE="workspace-agent-products"
export EVOPILOT_ACTOR="workbuddy"
export EVOPILOT_CLI_CLIENT="workbuddy"
export EVOPILOT_CONFIG="$PWD/.evopilot-agent-config.json"
```

Verify before changing state:

```bash
evopilot status --json
evopilot logging inspect --json
```

Continue only when `status=READY`, `health.status=UP`, `ready.status=READY`, and authenticated `summary` is present.

## 2. Prepare Harness Catalog

Harness lifecycle is outside EvoPilot.

An administrator publishes Harness definitions with `evopilot-harness`, then configures the EvoPilot server:

```bash
EVOPILOT_HARNESS_REGISTRY_CONFIG=/path/to/evopilot-harness/harness-registry.yaml
```

The Registry can contain multiple Catalog roots. Legacy direct Catalog configuration remains available only when no Registry is configured:

```bash
EVOPILOT_HARNESS_CATALOG_DIRS=/path/to/catalog-a:/path/to/catalog-b
```

Each enabled Catalog root must contain `CATALOG.md` with an `evopilot-harness-catalog` fenced YAML block. EvoPilot reads the Registry and Catalog files at use time. The EvoPilot CLI does not import, mount, scan, approve, publish, or evolve Harness definitions.

Operators can view available Catalogs only through API/Dashboard read-only projections. If no Catalog is configured, goal planning can still create a maturity plan but `plan.selectedHarness` is missing and the operator should stop.

## 3. Prepare LLM Profile

Store the raw LLM key once in the EvoPilot server-side secret vault:

```bash
evopilot secret set \
  --id LLM_API_KEY_MY_AGENT \
  --kind llm-key \
  --scope workspace \
  --from-env LLM_API_KEY_MY_AGENT \
  --json
```

Create and verify the profile:

```bash
evopilot llm profile set my-agent-llm \
  --scope workspace \
  --provider-preset custom \
  --provider-name qwen-private \
  --base-url https://llm.example.com/v1 \
  --model qwen2.5-coder-32b \
  --api-key-ref LLM_API_KEY_MY_AGENT \
  --json

evopilot llm profile preflight my-agent-llm --json
```

Continue only when the profile preflight returns `READY`.

## 4. Choose Repository Mode

Use exactly one execution mode:

```text
owned-repository       user/org owns source and CI/CD
fork-validated-pr      third-party upstream, writable fork runs CI/CD
upstream-authorized    maintainer credentials write to upstream
read-only-public       public inspection only; no real loop or release claim
```

If no GitHub/GitLab account, organization, group, service account, deploy token, or GitHub App principal exists, use `read-only-public` and stop before real loop execution.

## 5. Onboard Or Verify Project

For a new owned GitHub project:

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
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --json
```

If the checklist returns `nextAction=store-secret`, `connect-github-account`, `connect-gitlab-account`, `configure-devops`, or `configure-llm-profile`, stop and repair that blocker first.

After prerequisites are ready:

```bash
evopilot project onboard github \
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
  --client workbuddy \
  --json

evopilot project onboard verify my-agent --json
evopilot project preflight my-agent --json
evopilot project devops preflight my-agent --json
evopilot project llm preflight my-agent --json
```

Continue only when source credentials, DevOps, and LLM readiness are `READY`.

## 6. Plan With Published Harness Auto-Match

```bash
evopilot target plan \
  --project my-agent \
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --client workbuddy \
  --json
```

Read:

```text
goalId
phasePlan.phases[]
phasePlan.targets[]
editablePlan
plan.selectedHarness
llmUsage.summary
requestId
```

Stop after planning. Show the phase plan and `selectedHarness` digest evidence to the project owner. If `selectedHarness` is missing, ask an administrator to publish/configure a Harness Catalog and regenerate the plan.

## 7. Approve And Run

```bash
evopilot target plan export <goal-id> --format json > /tmp/my-agent-phase-plan.json
evopilot target plan diff <goal-id> --file /tmp/my-agent-phase-plan.json --json
evopilot target plan apply <goal-id> --file /tmp/my-agent-phase-plan.json --json
evopilot target plan approve <goal-id> \
  --confirmed-by project-owner \
  --confirmation "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan" \
  --json
evopilot target run \
  --project my-agent \
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --client workbuddy \
  --json
```

## 8. Verify Completion

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase ga --json
evopilot release decisions --project my-agent --target <target-id> --json
evopilot audit list --limit 50 --json
```

Do not call a run complete unless server evidence shows the relevant TargetEvidencePackage, PhasePackage, release decision, request IDs, token usage, and selected Harness digest.
