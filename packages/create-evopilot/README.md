# create-evopilot

Bootstrap a self-hosted EvoPilot control plane without cloning the source repositories.

```bash
curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v3.0.0/install.sh | bash -s -- --dir evopilot-stack
cd evopilot-stack
# Review .env and replace unresolved LLM values before production use.
docker compose up -d
./verify.sh
```

The tagged installer verifies the release manifest and resolves this package from the GitHub Release tarball while public npm registry packages are not published.

After public npm publication, npm-only bootstrap is:

```bash
npx create-evopilot@3.0.0 self-host --dir evopilot-stack --init-env
```

Use `--start` only after `EVOPILOT_LLM_BASE_URL`, `EVOPILOT_LLM_MODEL_NAME`, and `EVOPILOT_LLM_API_KEY` are set or after `.env` has been edited. The installer refuses to start with unresolved production placeholders.

The generated stack starts EvoPilot API, loop worker, code-upgrader, Postgres, and EvoPilot Dashboard from published container images. It never asks for raw GitHub, GitLab, LLM, deploy, or password secrets on the command line; put production secrets in `.env` or your platform secret manager.
