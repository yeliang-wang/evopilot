# AI Agent Scenario Coverage

This matrix is for third-party AI Agents that simulate real human operation through EvoPilot CLI documentation. EvoPilot v3 is a Harness Catalog consumer. Harness lifecycle and evolution scenarios are executed in `evopilot-harness`, then EvoPilot reads the published Catalog directory during planning.

## Scenario Matrix

| Scenario | Actor | Commands | Human stop point | Success evidence |
|---|---|---|---|---|
| First-time owned repository to Goal Loop | Agent and human | `project onboard plan`, `project onboard`, `project preflight`, `project devops preflight`, `project llm preflight`, `target plan`, `target run` | Review `selectedHarness` plus Alpha/Beta/RC/GA phase plan before approval | `plan.selectedHarness`, `TargetEvidencePackage.status=GO`, `PhasePackage.decision.status=GO`, release decision |
| Existing project repeat target | Agent and human | `project onboard verify`, `target plan`, `target run` | Review changed objective, selected Harness, phase targets, and release gates | New goal id, selected Harness digest, loop id, final report |
| Third-party public upstream with writable fork | Agent and human | `project onboard plan github`, `project onboard github`, `project devops preflight`, `target plan`, `target run` | Confirm `claimBoundary=fork-ci-pr` before execution | Do not claim upstream merge or production release |
| Catalog readiness check | Operator | `status --json`, API `GET /api/v1/harness/catalogs` through Dashboard/API client | Stop if Catalog scan is invalid or empty | Catalog id, digest, entries, warnings, nextAction |
| Harness source evolution | Administrator | Use `evopilot-harness evolve ...`, then publish a usable Harness | Review draft, source coverage, validation, diff, approval confirmation in `evopilot-harness` | Published Catalog directory and updated `CATALOG.md` |
| Production release decision | Operator | `target run`, `goal run-status`, `goal evidence-matrix`, release decision APIs/CLI | Stop on NO-GO or missing evidence | Release decision status, evidence ids, request ids, LLM usage |

## First-Time Project Flow

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

If the checklist returns `nextAction=register-project`, onboard the project. If it returns a secret, SCM, DevOps, or LLM blocker, repair that prerequisite first.

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

Verify readiness:

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

The agent must show `plan.selectedHarness` and the phase plan to the user or project owner. If `selectedHarness` is absent, stop and ask an administrator to publish or configure a usable Harness Catalog through `evopilot-harness`.

After approval:

```bash
evopilot target plan approve <goal-id> \
  --confirmed-by "project-owner" \
  --confirmation "Project owner reviewed selectedHarness and approved the Alpha/Beta/RC/GA phase plan" \
  --json

evopilot target run \
  --project my-agent \
  --objective "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for My Agent" \
  --llm-profile my-agent-llm \
  --max-steps 20 \
  --json
```

## Report Contract

Every completed scenario summary must include:

- project id, goal id, target id, loop id
- selected Harness id, version, domain, catalog id, catalog digest, entry path, entry digest
- request ids and correlation ids
- LLM provider, model, token totals, and request ids
- evidence package ids and GO/NO-GO status
- remaining blockers or `nextAction`

## Stop Rules

Stop on `nextAction`, `WAITING_INPUT`, `BLOCKED`, `FAILED`, `NO-GO`, missing source credentials, missing DevOps readiness, missing READY LLM profile, missing `selectedHarness`, pending plan approval, human review, timeout, or max-step boundaries.
