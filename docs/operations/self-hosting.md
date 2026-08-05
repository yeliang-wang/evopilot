# Self-Hosting

> Run EvoPilot API, loop worker, code-upgrader runtime, Postgres, and the standalone Dashboard with a reproducible Docker Compose shape.

## Audience

Use this guide when you want an external operator, administrator, or AI Agent to bring up a complete EvoPilot control plane without relying on local developer state.

## 15 Minute Path

For the shortest generated stack, use the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v1.1.6/install.sh | bash -s -- --dir evopilot-stack
cd evopilot-stack
# Review .env and replace unresolved LLM values before production use.
docker compose up -d
./verify.sh
```

The tagged installer resolves `create-evopilot` from the release manifest. In v1.1.6, the default package spec is the GitHub Release tarball because public npm registry packages are not published yet.

After public npm registry publication and `npm run verify:npm-registry` pass for the exact version, operators may use npm-only bootstrap:

```bash
npx create-evopilot@1.1.6 self-host --dir evopilot-stack --init-env
```

Use the manual path below when you need to work from source checkouts.

Prerequisites:

- Docker with Compose v2.
- Git.
- A real OpenAI-compatible LLM endpoint and API key for production mode.
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
EVOPILOT_LLM_PROVIDER_NAME=openai-compatible
EVOPILOT_LLM_BASE_URL=https://llm.example.com/v1
EVOPILOT_LLM_MODEL_NAME=<model>
EVOPILOT_LLM_API_KEY=<server-side-secret>
EVOPILOT_REQUIRE_LLM=true
```

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
- EvoPilot `/ready` returns `READY`.
- Dashboard `/health` returns `ok`.
- Dashboard `/api/v1/summary` reaches EvoPilot and returns either an authenticated JSON response or `401` if no session is supplied.

## First Admin Steps

1. Open `http://<host>:8080/`.
2. Log in with the configured EvoPilot user or platform bootstrap account.
3. Change default bootstrap credentials immediately if they are present.
4. Create tenant, workspace, and tenant admin users.
5. Store LLM, GitHub, GitLab, and deploy secrets server-side through EvoPilot secret APIs or CLI.
6. Register a disposable project first, generate a `ProjectHarnessProfile` draft, review it, activate it, then run a small goal loop.

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
- Production mode has real authentication and real LLM configuration.
- No raw GitHub, GitLab, LLM, deploy, or password secrets are committed.
- `evopilot status --json` works from an operator machine.
- Dashboard docs and CLI docs describe the same project onboarding and goal loop behavior.

## Troubleshooting

| Symptom | Likely Cause | Action |
| --- | --- | --- |
| `/ready` is not `READY` | Missing auth, LLM, Postgres, or runtime dependency | Inspect `evopilot logging inspect --json` and server logs by `requestId`. |
| Loop remains claimable | Worker is not running or cannot reach API | Check `evopilot-loop-worker` logs and `EVOPILOT_BASE_URL`. |
| Code upgrade fails | Code-upgrader cannot reach LLM or shared data root | Check `evopilot-code-upgrader` logs and `EVOPILOT_DATA_ROOT/llm.env`. |
| Dashboard loads but API fails | Wrong network or proxy route | Verify `EVOPILOT_API_BASE_URL` and `/api/*` routing. |
| Release verdict missing | No product-native release evidence yet | Run the goal loop to release evidence, then inspect `GET /api/v1/release/decisions`. |
