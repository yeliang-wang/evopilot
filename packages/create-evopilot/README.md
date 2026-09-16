# create-evopilot

Bootstrap a self-hosted EvoPilot control plane without cloning the source repositories.

The generated production stack intentionally contains no default LLM provider,
model, or credential. It starts in setup-only `SETUP_REQUIRED`; use Evolution
Expert over MCP and Host-native secure input to create, live-preflight, and
explicitly bind a governed workspace Profile before normal work. See
[First-Run LLM Readiness](../../docs/guides/first-run-llm-readiness.md).

```bash
curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v3.1.0/install.sh | bash -s -- --dir evopilot-stack
cd evopilot-stack
# Start the setup-only control plane, then complete LLM setup through Expert.
docker compose up -d
./verify.sh
```

The tagged installer verifies the release manifest and resolves this package from the GitHub Release tarball while public npm registry packages are not published.

After public npm publication, npm-only bootstrap is:

```bash
npx create-evopilot@3.1.0 self-host --dir evopilot-stack --init-env
```

`--start` may safely start the production control plane without an LLM Profile,
but only health, authentication, and governed setup surfaces are available until
Runtime reports `READY`. No environment LLM values or developer defaults are
silently imported.

The generated stack starts EvoPilot API, loop worker, code-upgrader, Postgres, and EvoPilot Dashboard from published container images. It never asks for raw GitHub, GitLab, LLM, deploy, or password secrets on the command line; put production secrets in `.env` or your platform secret manager.
