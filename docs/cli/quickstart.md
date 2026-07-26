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
```

Continue only when `status=READY`, `health.status=UP`, `ready.status=READY`, and authenticated `summary` is present.

## 2. Prepare LLM Profile

Store the raw LLM key once in the EvoPilot server-side secret vault:

```bash
evopilot secret set \
  --id LLM_API_KEY_MY_AGENT \
  --kind llm-key \
  --from-env LLM_API_KEY_MY_AGENT \
  --json
```

Create and verify the profile:

```bash
evopilot llm profile set my-agent-llm \
  --provider openai-compatible \
  --base-url https://llm.example.com/v1 \
  --model qwen2.5-coder-32b \
  --api-key-ref LLM_API_KEY_MY_AGENT \
  --json

evopilot llm profile preflight my-agent-llm --json
```

Continue only when the profile preflight returns `READY`.

## 3. Choose Repository Mode

Use exactly one execution mode:

```text
owned-repository       user/org owns source and CI/CD
fork-validated-pr      third-party upstream, writable fork runs CI/CD
upstream-authorized    maintainer credentials write to upstream
read-only-public       public inspection only; no real loop or release claim
```

If no GitHub/GitLab account, organization, group, service account, deploy token, or GitHub App principal exists, use `read-only-public` and stop before real loop execution.

## 4. Onboard Or Verify Project

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

## 5. Generate The Phase Plan

The objective is a business goal, not a maturity label:

```bash
evopilot target plan \
  --project my-agent \
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --client workbuddy \
  --json
```

EvoPilot always decomposes the objective into:

```text
Alpha -> Beta -> RC -> GA
```

Stop after this command. Show `phasePlan.phases[]`, `phasePlan.targets[]`, and `editablePlan` to the user or project owner.

## 6. Apply User Changes And Approve

Only after the user or project owner confirms:

```bash
evopilot target plan export <goal-id> --format json > /tmp/my-agent-phase-plan.json
evopilot target plan diff <goal-id> --file /tmp/my-agent-phase-plan.json --json
evopilot target plan apply <goal-id> --file /tmp/my-agent-phase-plan.json --json

evopilot target plan approve <goal-id> \
  --confirmed-by "project-owner" \
  --confirmation "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan" \
  --json
```

Do not invent confirmation text.

## 7. Run The Target

```bash
evopilot target run \
  --project my-agent \
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --max-steps 20 \
  --llm-profile my-agent-llm \
  --client workbuddy \
  --json
```

If the plan is not approved, the wrapper stops with `PENDING_PLAN_APPROVAL` and `nextAction=approve-plan`.

## 8. Inspect Evidence Packages

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase alpha --json
evopilot release decisions --project my-agent --target my-agent-ga --json
evopilot audit list --limit 50 --json
```

Completion requires:

```text
TargetEvidencePackage.status=GO
PhasePackage.decision.status=GO
releaseDecision.status=GO
llmUsage.summary.provider is present
llmUsage.summary.model is present
llmUsage.summary.totalTokens is present
```

## 9. Final Agent Report

Report server-derived fields only:

```text
projectId=<project-id>
goalId=<goal-id>
activeTargetId=<target-id>
loopId=<loop-id>
nextAction=<next-action>
targetPackage=<GO|NO-GO|PENDING>
phasePackage=<GO|NO-GO|PENDING>
releaseDecision=<GO|CONDITIONAL-GO|NO-GO|missing>
llmProvider=<provider>
llmModel=<model>
inputTokens=<n>
outputTokens=<n>
totalTokens=<n>
requestIds=<ids>
blockers=<blockers>
```
