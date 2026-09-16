# Self-Hosting

> Run EvoPilot API, loop worker, code-upgrader runtime, Postgres, and the standalone Dashboard with a reproducible Docker Compose shape.

## Audience

Use this guide when you want an external operator, administrator, or AI Agent to bring up a complete EvoPilot control plane without relying on local developer state.

## 15 Minute Path

For the shortest generated stack, use the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v6.1.0/install.sh | bash -s -- --dir evopilot-stack
cd evopilot-stack
# Review the generated authentication and database values.
docker compose up -d
./verify.sh
```

The tagged installer resolves `create-evopilot` from the release manifest. Runtime 6.2 changes the generated stack to start in setup-only mode: no provider, model, Host configuration, or developer profile is imported. Complete the governed LLM setup through Evolution Expert before normal operations.

After public npm registry publication and `npm run verify:npm-registry` pass for the exact version, operators may use npm-only bootstrap:

```bash
npx create-evopilot@6.1.0 self-host --dir evopilot-stack --init-env
```

Use the manual path below when you need to work from source checkouts.

Prerequisites:

- Docker with Compose v2.
- Git.
- A user-selected supported LLM endpoint and a secure credential destination, required before normal Runtime operations but not before setup-only startup.
- A host that can persist Docker volumes.

Clone both repositories side by side:

```bash
mkdir -p /opt/evopilot-stack
cd /opt/evopilot-stack
git clone https://github.com/yeliang-wang/evopilot.git
git clone https://github.com/yeliang-wang/evopilot-dashboard.git
```

Create the EvoPilot environment from the sample:

```bash
cd /opt/evopilot-stack/evopilot
cp .env.example .env
```

Edit `.env` before starting production services:

```text
EVOPILOT_RUN_MODE=prod
EVOPILOT_PORT=19876
EVOPILOT_DATA_ROOT=/var/lib/evopilot
EVOPILOT_TOKENS=admin:<change-me-admin-token>:admin,operator:<change-me-operator-token>:operator,viewer:<change-me-viewer-token>:viewer
EVOPILOT_REQUIRE_LLM=true
EVOPILOT_HARNESS_REGISTRY_CONFIG=/opt/evopilot-harness/harness-registry.yaml
```

Do not add a default LLM to this file. After startup, install Evolution Expert 2.2 in a supported Agent Host and ask it to inspect Runtime readiness. The Expert delegates raw credential entry to a reviewed Host-native secure input, while Runtime persists only a `SecretRef`, a governed Profile, live preflight evidence, and an explicit workspace-default binding. See [First-Run LLM Readiness](../guides/first-run-llm-readiness.md).

Start the control plane:

```bash
docker compose up -d --build
```

Start the standalone Dashboard on the same Docker network:

```bash
cd /opt/evopilot-stack/evopilot-dashboard
EVOPILOT_DOCKER_NETWORK=evopilot_default \
EVOPILOT_API_BASE_URL=http://evopilot-server:19876 \
EVOPILOT_DASHBOARD_PORT=8080 \
docker compose -f compose.production.yaml up -d --build
```

Verify:

```bash
curl -fsS http://127.0.0.1:19876/health
curl -fsS http://127.0.0.1:19876/ready
curl -fsS http://127.0.0.1:8080/health
curl -i http://127.0.0.1:8080/api/v1/summary
docker compose -f /opt/evopilot-stack/evopilot/docker-compose.yml ps
docker compose -f /opt/evopilot-stack/evopilot-dashboard/compose.production.yaml ps
```

Expected:

- EvoPilot `/health` returns `UP`.
- EvoPilot `/health` remains `UP` during setup. `/ready` reports `runtimeReadiness=SETUP_REQUIRED` and `normalOperationsReady=false` until the governed LLM binding is complete, then reports `runtimeReadiness=READY` and `normalOperationsReady=true`.
- Dashboard `/health` returns `ok`.
- Dashboard `/api/v1/summary` reaches EvoPilot and returns either an authenticated JSON response or `401` if no session is supplied.

## First Admin Steps

1. Open `http://<host>:8080/`.
2. Log in with the configured EvoPilot user or platform bootstrap account.
3. Change default bootstrap credentials immediately if they are present.
4. Create tenant, workspace, and tenant admin users.
5. Use Evolution Expert 2.2 over MCP to choose the Runtime provider/model, create a secure `SecretRef`, live-preflight the Profile, and explicitly bind its exact digest as the workspace default.
6. Confirm `evopilot runtime readiness --json` returns `READY`; a working Host LLM or Agent Model does not satisfy this gate.
7. Store GitHub, GitLab, and deploy secrets server-side through EvoPilot secret APIs or CLI.
8. Configure a published Harness Catalog directory, register a disposable project, generate a target plan, review `selectedHarness` plus the phase plan, approve it, then run a small goal loop.

## Data, Backup, And Restore

Production state is split by boundary:

| State | Location |
| --- | --- |
| EvoPilot business and loop state | `EVOPILOT_DATA_ROOT` and Postgres-backed stores |
| LLM metrics | `EVOPILOT_DATA_ROOT/llm-metrics.jsonl` unless overridden |
| Docker volumes | Docker-managed Postgres and runtime volumes |
| Dashboard static assets | Dashboard image and container filesystem only |

Back up Postgres business records:

```bash
cd /opt/evopilot-stack/evopilot
EVOPILOT_LOOP_STORE_DSN=postgres://evopilot:<password>@127.0.0.1:5432/evopilot \
  npm run store:postgres:backup -- --out backups/evopilot-postgres-business.jsonl
```

Restore only during a planned maintenance window:

```bash
cd /opt/evopilot-stack/evopilot
EVOPILOT_LOOP_STORE_DSN=postgres://evopilot:<password>@127.0.0.1:5432/evopilot \
  npm run store:postgres:restore -- --in backups/evopilot-postgres-business.jsonl
```

## Upgrade Path

1. Read `CHANGELOG.md` in both repositories.
2. Back up Postgres and `EVOPILOT_DATA_ROOT`.
3. Pull both repositories with `git pull --ff-only origin main`.
4. Rebuild EvoPilot services first.
5. Confirm `/health` and `/ready`.
6. Rebuild Dashboard.
7. Run Dashboard smoke against the deployed API.

If the stack was generated with `create-evopilot`, update `.env` image tags or immutable digest references, then run:

```bash
docker compose pull
docker compose up -d
./verify.sh
```

```bash
cd /opt/evopilot-stack/evopilot
git pull --ff-only origin main
docker compose up -d --build
curl -fsS http://127.0.0.1:19876/ready

cd /opt/evopilot-stack/evopilot-dashboard
git pull --ff-only origin main
EVOPILOT_DOCKER_NETWORK=evopilot_default \
EVOPILOT_API_BASE_URL=http://evopilot-server:19876 \
EVOPILOT_DASHBOARD_PORT=8080 \
docker compose -f compose.production.yaml up -d --build
curl -fsS http://127.0.0.1:8080/health
```

## Acceptance Checklist

- `evopilot-server`, `evopilot-loop-worker`, `evopilot-code-upgrader`, and Postgres are running.
- Dashboard is a separate service and reaches EvoPilot through HTTP.
- Production mode has real authentication and an explicit Runtime LLM Profile whose active `SecretRef`, live preflight, and workspace binding make `RuntimeReadiness=READY`.
- No raw GitHub, GitLab, LLM, deploy, or password secrets are committed.
- `evopilot status --json` works from an operator machine.
- Dashboard docs and CLI docs describe the same project onboarding and goal loop behavior.

## Troubleshooting

| Symptom | Likely Cause | Action |
| --- | --- | --- |
| `/ready` shows `SETUP_REQUIRED` or `PREFLIGHT_REQUIRED` | The governed Runtime LLM Profile is absent, not live-preflighted, or not explicitly bound | Ask Evolution Expert to continue first-run setup, or inspect `evopilot runtime readiness --json`. |
| `/ready` shows `LLM_BLOCKED` | Profile drift, revoked SecretRef, disabled Profile, or stale/failed preflight | Use Evolution Expert's finite repair journey; never switch silently to another model. |
| Loop remains claimable | Worker is not running or cannot reach API | Check `evopilot-loop-worker` logs and `EVOPILOT_BASE_URL`. |
| Code upgrade fails | Code-upgrader cannot reach LLM or shared data root | Check `evopilot-code-upgrader` logs and `EVOPILOT_DATA_ROOT/llm.env`. |
| Dashboard loads but API fails | Wrong network or proxy route | Verify `EVOPILOT_API_BASE_URL` and `/api/*` routing. |
| Release verdict missing | No product-native release evidence yet | Run the goal loop to release evidence, then inspect `GET /api/v1/release/decisions`. |
