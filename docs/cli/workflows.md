# EvoPilot CLI Workflows

These workflows describe EvoPilot operation after Harness definitions have been published by `evopilot-harness`.

## Owned Repository

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
  --json
```

Stop if onboarding returns a blocker. When onboarding verification returns `nextAction=plan-target`, continue to `target plan`.

For GitLab:

```bash
evopilot project onboard plan gitlab \
  --repo group/my-agent \
  --id my-agent-gitlab \
  --token-ref GITLAB_TOKEN_MY_AGENT \
  --execution-mode owned-repository \
  --devops-owner group \
  --ci-required-stage test \
  --cd-environment production \
  --llm-profile my-agent-llm \
  --json
```

Inspect the GA baseline when users ask what the phase ladder means:

```bash
evopilot maturity standards inspect ga --json
```

## Plan With Published Harness

```bash
evopilot target plan \
  --project my-agent \
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --json
```

Expected successful planning fields:

```text
phasePlan.phases[]
phasePlan.targets[]
plan.selectedHarness.harnessId
plan.selectedHarness.version
plan.selectedHarness.catalogId
plan.selectedHarness.catalogDigest
plan.selectedHarness.entryDigest
plan.selectedHarness.registryPath
plan.selectedHarness.registryDigest
plan.selectedHarness.registryCatalogPriority
editablePlan.status
nextAction=approve-plan
```

If `selectedHarness` is missing, stop and ask an administrator to publish/configure a Harness Registry and Catalog through `evopilot-harness`.

## Approve Plan

```bash
evopilot target plan export <goal-id> --format json > /tmp/phase-plan.json
evopilot target plan diff <goal-id> --file /tmp/phase-plan.json --json
evopilot target plan apply <goal-id> --file /tmp/phase-plan.json --json
evopilot target plan approve <goal-id> \
  --confirmed-by project-owner \
  --confirmation "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan" \
  --json
```

Do not approve without owner review.

## Execute Goal Loop

```bash
evopilot target run \
  --project my-agent \
  --objective "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --require-devops-ready \
  --require-llm-ready \
  --json
```

Stop on `BLOCKED`, `FAILED`, `NO-GO`, or repair `nextAction`.

## Verify Release

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase ga --json
evopilot release decisions --project my-agent --target <target-id> --json
evopilot audit list --limit 50 --json
```

The final report must include selected Harness id/version/digests, LLM provider/model/token totals, request IDs, evidence package status, phase package decision, and release decision.

## Configure A Project LLM

The server global default LLM is not sufficient for enterprise GitHub/GitLab loops. Store a secret, create a profile, bind it to the project, and preflight the binding:

```bash
evopilot secret set --id LLM_API_KEY_MY_AGENT --kind llm-key --scope workspace --from-env LLM_API_KEY_MY_AGENT --json
evopilot llm profile set my-agent-llm --scope workspace --provider-preset custom --provider-name qwen-private --base-url https://llm.example.com/v1 --model qwen2.5-coder-32b --api-key-ref LLM_API_KEY_MY_AGENT --json
evopilot project llm set my-agent --profile my-agent-llm --json
evopilot project llm preflight my-agent --json
```

## Unreachable Server

If the server cannot be reached, `evopilot status --json` returns `status=UNREACHABLE` with `diagnosis.recommendedAction`. This is a server-side bounded read failure, not project evidence.

## Read-Only Public Repository

Use:

```bash
evopilot project onboard plan github \
  --repo upstream/project \
  --id upstream-project \
  --execution-mode read-only-public \
  --json
```

Do not claim writeback, CI/CD, deploy, release readiness, or GA in `read-only-public` mode.

## Fork Validated PR

Use `fork-validated-pr` when the operator owns a fork but not the upstream:

```bash
evopilot project onboard github \
  --repo my-org/project-fork \
  --upstream-repo upstream/project \
  --working-repo my-org/project-fork \
  --id project-fork \
  --token-ref GITHUB_TOKEN_PROJECT_FORK \
  --execution-mode fork-validated-pr \
  --devops-owner my-org \
  --ci-workflow ci.yml \
  --ci-required-check build \
  --llm-profile my-agent-llm \
  --json
```

The release claim is bounded to fork CI and PR evidence unless upstream maintainers merge and release.
