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

Continue only when `status=READY`, `health.status=UP`, `ready.status=READY`, and authenticated `summary` is present. `logging inspect` shows the active EvoPilot log level and stack policy. For normal automation keep the server at `info`; an administrator may temporarily use `evopilot logging set --level debug --json` during diagnosis, then restore `info`.

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

## Admin: Maintain Template Harness

Project onboarding consumes an already published template, but normal onboarding does not require the operator to choose one manually. Fresh installs include `python-enterprise-harness`, `java-ddd-service-harness`, `node-saas-control-plane-harness`, `go-middleware-harness`, `observability-apm-harness`, and `generic-management-software-harness`. EvoPilot automatically matches a template from project runtime/repository context and the goal loop target; `--from-template` is only an explicit administrator or advanced override. These built-ins are initialized from selected public projects, official specifications, and enterprise engineering practice, then fixed inside EvoPilot as structured template data with `sourceReferences[]`.

Administrators can publish additional template ids or versions for different languages, architecture styles, or software types:

```bash
evopilot harness template list --json
evopilot harness template inspect python-enterprise-harness --json
evopilot harness template upgrade \
  --file ./python-enterprise-harness-1.1.0.yaml \
  --changelog "Add FastAPI service defaults and pytest coverage gates." \
  --json
```

The template file must contain `schema: evopilot-harness-template/v1`, `id`, `version`, and the template sections. YAML or JSON is authoritative; Markdown is documentation only. The server stores it in the control plane with a computed digest and changelog. Reusing the same `id@version` is rejected unless the administrator passes `--force`. Existing active project profiles are not silently rewritten; use `harness profile generate` or `harness profile upgrade` to create a reviewed project revision.

## 5. Generate And Confirm Project Harness Profile

Before phase planning, create the project-level harness definition that controls capability boundaries, runtime commands, validation, evidence, failure handling, diagnostics, observability, and governance.

```bash
evopilot harness profile generate \
  --project my-agent \
  --goal-loop-target "Enable tenant onboarding and lifecycle workflow visibility" \
  --llm-profile my-agent-llm \
  --json
```

For a first onboarding, EvoPilot automatically matches a template and generates the DRAFT from that template, the goal loop target, and project context. For a second onboarding or project evolution, EvoPilot first reuses the previous active profile's template unless an administrator explicitly overrides it, then includes the previous active profile in the generation context and returns a diff-aware DRAFT. The response `generatedBy.evidence[]` includes `templateSelection=auto-match`, `templateSelection=previous-active-profile`, or `templateSelection=request-override`.

Continue only when the JSON response shows:

```text
schema=evopilot-project-harness-profile-generate-result/v1
status=DRAFT
profile.status=DRAFT
profile.validation.status=VALIDATED
profile.version=<harness-version>
profile.compiledDigest=<digest>
```

Stop after generation. Show these fields to the user or project owner:

```text
profile.sourceContent
profile.compiledContent
profile.validation
profile.diffFromActive
profile.generatedBy
profile.sourceDigest
profile.compiledDigest
summary
```

If the user asks for changes, write the edited source profile to YAML or JSON, then repeat validate/diff/apply:

```bash
evopilot harness profile validate --project my-agent --file /tmp/my-agent-harness-profile.yaml --json
evopilot harness profile diff default --project my-agent --file /tmp/my-agent-harness-profile.yaml --json
evopilot harness profile apply --project my-agent --file /tmp/my-agent-harness-profile.yaml --json
```

After `apply`, use the returned `profile.version` as `<harness-version>` for activation.

If the generated DRAFT is accepted without edits, review the server diff and activate the reviewed version:

```bash
evopilot harness profile inspect default --project my-agent --version <harness-version> --json
evopilot harness profile diff default --project my-agent --version <harness-version> --json
evopilot harness profile activate default --project my-agent --version <harness-version> --json
evopilot harness profile explain default --project my-agent --json
```

Do not activate a profile version until the user or project owner confirms that the DRAFT harness definition is acceptable. After activation, `target plan` and `goal plan` must bind the active profile by version and digest.

## 6. Generate The Phase Plan

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

Also show `plan.projectHarness` or `phasePlan.projectHarness`. It must include the activated harness profile id, version, template reference, source digest, compiled digest, and capabilities. If the binding is missing, stop and repair the harness activation before approval.

## 7. Apply User Changes And Approve

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

## 8. Run The Target

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

## 9. Inspect Evidence Packages

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

## 10. Final Agent Report

Report server-derived fields only:

```text
projectId=<project-id>
projectHarnessProfile=<profile-id-or-missing>
projectHarnessVersion=<version-or-missing>
projectHarnessDigest=<compiled-digest-or-missing>
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
