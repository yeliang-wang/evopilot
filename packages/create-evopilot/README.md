# create-evopilot

Bootstrap a self-hosted EvoPilot control plane without cloning the source repositories.

```bash
npx create-evopilot@latest self-host --dir evopilot-stack --init-env
cd evopilot-stack
# Review .env and replace unresolved LLM values before production use.
docker compose up -d
./verify.sh
```

For a single command from a release tag:

```bash
curl -fsSL https://raw.githubusercontent.com/yeliang-wang/evopilot/v1.1.0/install.sh | bash -s -- --dir evopilot-stack
```

Use `--start` only after `EVOPILOT_LLM_BASE_URL`, `EVOPILOT_LLM_MODEL_NAME`, and `EVOPILOT_LLM_API_KEY` are set or after `.env` has been edited. The installer refuses to start with unresolved production placeholders.

The generated stack starts EvoPilot API, loop worker, code-upgrader, Postgres, and EvoPilot Dashboard from published container images. It never asks for raw GitHub, GitLab, LLM, deploy, or password secrets on the command line; put production secrets in `.env` or your platform secret manager.
