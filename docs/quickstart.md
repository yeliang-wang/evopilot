# Developer Quickstart

Build EvoPilot from source and verify an isolated local API. This guide is for
contributors and administrators. To use published products in an AI Agent Host,
start with [Agent Host installation](guides/agent-host-installation.md) and
[your first task](guides/first-task.md).

## Prerequisites

- Node.js 22+, npm and Git.
- A checkout of this repository and an unused local port (the example uses 19877).
- A separate development data directory. Keep daily Runtime data and credentials
  in their existing installation; do not point this development server at them.

## Build And Run The API Server

From the repository root:

Use a development terminal without production `EVOPILOT_*` or provider variables
injected. The explicit empty env files below prevent the startup loader from
importing repository or LLM configuration files.

```bash
npm ci
npm run build

EVOPILOT_DATA_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/evopilot-dev.XXXXXX")" \
EVOPILOT_ENV_FILE=/dev/null \
EVOPILOT_LLM_ENV_FILE=/dev/null \
EVOPILOT_HOST=127.0.0.1 \
EVOPILOT_PORT=19877 \
EVOPILOT_RUN_MODE=debug \
npm run server
```

Keep that terminal open. In another terminal, check:

```bash
curl -fsS http://127.0.0.1:19877/health
curl -fsS http://127.0.0.1:19877/ready
```

Success means the built development server answers both health endpoints.
`debug` permits development compatibility behavior, including anonymous local
administration, sample data and mock integrations. It is not production LLM
readiness, project acceptance or a release result. Do not expose this server to
other machines. Stop it with Ctrl-C when finished.

## Use The CLI For Administration Or Automation

From the repository root, inspect this development server:

```bash
npm run cli -- status --server http://127.0.0.1:19877 --json
```

Read the returned API version, mode, status and diagnosis. If another Runtime is
already installed, use its configured CLI or MCP connection instead; installing
or updating a client does not require creating another account.

## Connect Evolution Expert For Ordinary Users

Follow [Host installation](guides/agent-host-installation.md) to load the generated
Expert adapter and configure the stdio MCP entry. The EvoPilot stdio adapter
connects to the separate Runtime HTTP service. Installing the Expert package
alone does not activate it in the Host.

Production Runtime starts in `SETUP_REQUIRED` until an explicitly selected LLM
Profile and SecretRef pass preflight and workspace binding. Reuse an existing
valid configuration; see [first-run readiness and repair](guides/first-run-llm-readiness.md).
The Host conversational model does not become Runtime's model automatically.

## Continue With A Project

Use [project definitions](guides/project-definitions.md) and the
[published Harness Catalog](architecture/published-harness-catalog.md) to prepare
the required project and asset bindings. Harness owns asset publication; Runtime
reads the Registry and its enabled Catalogs. A connected API does not create an
eligible Bundle, a qualified executor or an independent business collector.
See [external execution prerequisites](guides/agent-runtime.md).

Administrative project and Goal examples belong in [CLI workflows](cli/workflows.md)
and the [command reference](cli/commands.md). Follow the current plan, exact
approval and receipt requirements there. Do not turn a source-development smoke
check into a claim of business completion.

## Connect A Dashboard

Dashboard source lives in the separate
[evopilot-dashboard repository](https://github.com/yeliang-wang/evopilot-dashboard).
Read [Dashboard integration](guides/dashboard-integration.md) for the API, auth and
governance contract. Dashboard deployment is optional for the Expert-over-MCP path.
