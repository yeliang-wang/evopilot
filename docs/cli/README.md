# EvoPilot CLI

> Command-line access to an EvoPilot control-plane server for operators, CI jobs, release scripts, and AI agents.

The EvoPilot CLI is an HTTP client. It can run on macOS, Windows, Linux, WorkBuddy, Codex, Claude Code, or any environment that can execute Node.js commands and reach the EvoPilot server URL.

The CLI does not start EvoPilot locally and does not bypass server governance. RBAC, tenant/workspace scope, approvals, source-closure preflight, project DevOps, deployment gates, audit records, selected Harness evidence, and release decisions are enforced by the EvoPilot server.

## AI Agent Entry

If you are WorkBuddy, Codex, Claude Code, CI, or another AI agent, read these first:

1. [AGENTS.md](AGENTS.md) - non-negotiable rules and stop conditions.
2. [quickstart.md](quickstart.md) - shortest safe command flow.
3. [automation.md](automation.md) - JSON fields, parse order, and report format.
4. [workflows.md](workflows.md) - scenario workflows.
5. [AI Agent Scenario Coverage](../guides/ai-agent-scenarios.md) - end-to-end scenario matrix for third-party agent simulation and human operators.
6. [commands.md](commands.md) - full command reference.

For production incident handling and full end-to-end operating steps, read [AI Agent Runbook](../guides/ai-agent-runbook.md).

## Install

Production installation uses the GitHub Release CLI tarball set for the current release:

```bash
npm install -g \
  https://github.com/yeliang-wang/evopilot/releases/download/v3.1.0/evopilot-contracts-3.1.0.tgz \
  https://github.com/yeliang-wang/evopilot/releases/download/v3.1.0/evopilot-client-3.1.0.tgz \
  https://github.com/yeliang-wang/evopilot/releases/download/v3.1.0/evopilot-cli-3.1.0.tgz
evopilot --version
```

The public npm registry package remains a separate post-publish layer. Use `npm install -g @evopilot/cli@3.1.0` only after `npm run verify:npm-registry -- --version 3.1.0` passes.

From this repository, use the same CLI package without publishing:

```bash
npm install
npm run cli:build
npm run cli -- --version
```

The package requires Node.js 22 or later.

## Connect

Configure the target EvoPilot server and scope:

```bash
export EVOPILOT_SERVER="https://evopilot.example.com"
export EVOPILOT_API_TOKEN="<operator-or-admin-token>"
export EVOPILOT_TENANT="tenant-production"
export EVOPILOT_WORKSPACE="workspace-agent-products"
export EVOPILOT_ACTOR="workbuddy"
export EVOPILOT_CLI_CLIENT="workbuddy"
```

`EVOPILOT_BASE_URL` is also accepted as a server URL fallback. Command-line flags override environment variables and saved config:

```bash
evopilot --server "$EVOPILOT_SERVER" --token "$EVOPILOT_API_TOKEN" status --json
```

Use `--config <file>` or `EVOPILOT_CONFIG` for short-lived agent sessions.

## Harness Boundary

EvoPilot v3 does not manage Harness lifecycle.

- Publish and evolve Harness definitions in `evopilot-harness`.
- Configure the EvoPilot server with `EVOPILOT_HARNESS_REGISTRY_CONFIG`.
- EvoPilot dynamically reads `harness-registry.yaml` and enabled `CATALOG.md` files during planning.
- `target plan` / `goal plan` returns `plan.selectedHarness` when a published Harness matches the project and objective.
- The CLI intentionally has no `evopilot harness ...` command group.

Read-only server projection:

```http
GET /api/v1/harness/catalogs
GET /api/v1/harness/catalogs/{catalogId}
```

## Verify

Always verify the session before changing product state:

```bash
evopilot config show --json
evopilot status --json
evopilot logging inspect --json
```

Expected result:

- `status` is `READY`.
- `health.status` is `UP`.
- `ready.status` is `READY`.
- `api.schema` is `evopilot-version/v1`.
- `summary` is present when the token is valid for the requested tenant/workspace.
- `llmUsage.summary.provider`, `model`, and token totals are present when server-side LLM usage exists.
- Exit code is `0`.

If the API Server cannot be reached, `status --json` still prints schema `evopilot-cli-status/v1` with `status=UNREACHABLE`, `stage`, `server`, `config`, `missingConfig`, `diagnosis.recommendedAction`, and `error.message`, then exits `2`.

## AI Agent Contract

1. Configure `EVOPILOT_SERVER`, `EVOPILOT_API_TOKEN`, `EVOPILOT_TENANT`, `EVOPILOT_WORKSPACE`, `EVOPILOT_ACTOR`, and `EVOPILOT_CLI_CLIENT`.
2. Run `evopilot status --json`.
3. For a new GitHub project, run `evopilot project onboard plan github ... --json` before mutating state.
4. Store or repair server-side `tokenRef` values when the checklist asks for it.
5. Verify with `project preflight`, `project devops preflight`, and `project onboard verify`.
6. Store the LLM key server-side, create an LLM profile, bind it to the project, and run `project llm preflight` when real loops need a project-specific model.
7. Generate the Goal phase plan with `target plan`.
8. Show `plan.selectedHarness`, `phasePlan.phases[]`, `phasePlan.targets[]`, and `editablePlan` to the user or operator.
9. Export, review, optionally edit, diff, apply, and approve the Alpha -> Beta -> RC -> GA phase plan only after confirmation.
10. Run `target run`, `goal run`, or `loop run` with `--json`.
11. Stop on blockers, human gates, credential gaps, repair actions, `NO-GO`, `BLOCKED`, `FAILED`, timeouts, or max-step boundaries.
12. For troubleshooting, run `evopilot audit list --limit 50 --json`.
13. Report the server-derived result, selected Harness id/version/digests, release verdict, IDs, LLM provider/model, token totals, and request IDs.

Minimal project onboarding command sequence:

```bash
evopilot project onboard plan github --repo owner/repo --id my-agent --token-ref GITHUB_TOKEN_MY_AGENT --execution-mode owned-repository --devops-owner owner --json
evopilot project onboard github --repo owner/repo --id my-agent --token-ref GITHUB_TOKEN_MY_AGENT --execution-mode owned-repository --devops-owner owner --json
evopilot project onboard verify my-agent --json
```

## LLM And Token Visibility

For JSON output, agents must read:

```text
llmUsage.client.surface
llmUsage.summary.provider
llmUsage.summary.model
llmUsage.summary.totalTokens
llmUsage.summary.inputTokens
llmUsage.summary.outputTokens
llmUsage.summary.creditsConsumed
plan.selectedHarness.harnessId
plan.selectedHarness.version
plan.selectedHarness.catalogId
plan.selectedHarness.catalogDigest
plan.selectedHarness.entryDigest
plan.selectedHarness.registryPath
plan.selectedHarness.registryDigest
plan.selectedHarness.registryCatalogPriority
llmUsage.process.responses[]
llmUsage.server.steps[]
```

`llmUsage.summary` is the command-level total. `llmUsage.process.responses[]` is the CLI-observed HTTP chain with `requestId` values. `llmUsage.server.steps[]` is the server-side Loop executor step list.

## Maturity Ladder

EvoPilot governed goals use Alpha -> Beta -> RC -> GA. `target plan` returns the generated phase plan, `nextAction=plan-target` when onboarding is ready to plan, and `PENDING_PLAN_APPROVAL` until a project owner or authorized operator approves the plan.

```bash
evopilot target plan --project my-agent --objective "Enable the requested business capability" --llm-profile my-agent-llm --json
evopilot target plan export <goal-id> --format json > /tmp/evopilot-phase-plan.json
evopilot target plan diff <goal-id> --file /tmp/evopilot-phase-plan.json --json
evopilot target plan apply <goal-id> --file /tmp/evopilot-phase-plan.json --json
evopilot target plan approve <goal-id> --confirmed-by "project-owner" --confirmation "Reviewed selectedHarness and Alpha/Beta/RC/GA phase plan" --json
```

AI agents must not fabricate `--confirmed-by` or `--confirmation` values.

## Custom LLM Profiles

One-time setup from a trusted shell:

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
```

Bind the project default:

```bash
evopilot project llm set my-agent --profile my-agent-llm --json
evopilot project llm inspect my-agent --json
evopilot project llm preflight my-agent --json
```

The server global default LLM is allowed for local/debug validation only. For enterprise GitHub/GitLab loops, bind a READY project LLM profile or pass a run-level `--llm-profile`.

## Completion Evidence

After execution:

```bash
evopilot goal target-package <goal-id> --target <target-id> --json
evopilot goal phase-package <goal-id> --phase ga --json
evopilot release decisions --project <project-id> --target <target-id> --json
evopilot audit list --limit 50 --json
```

Do not claim completion without GO evidence, selected Harness digest evidence, request IDs, and token usage.
