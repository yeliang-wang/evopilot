# Example: Node API Service Goal Loop

## Purpose

Validate EvoPilot with a small service that can produce build, smoke, functional, CI, and release evidence without risking a production repository.

## Project

Use the included sample service:

```text
examples/github-demo-projects/node-api/
```

If you mirror this sample to GitHub, register it as an owned or disposable repository. If you only inspect the local folder, do not claim GitHub CI/CD or source release closure.

## Goal Loop Target

```text
Make the Node API service production-releasable by enforcing health/readiness checks, latency evidence, CI validation, and release-decision evidence.
```

## CLI Flow

```bash
evopilot project onboard github \
  --id node-api-service \
  --repository-owner <owner> \
  --repository <repo> \
  --execution-mode owned-repository \
  --token-ref GITHUB_TOKEN_NODE_API \
  --json

evopilot harness profile generate \
  --project node-api-service \
  --goal-loop-target "Make the Node API service production-releasable by enforcing health/readiness checks, latency evidence, CI validation, and release-decision evidence." \
  --json
```

Stop and show the generated profile draft to the owner. After approved:

```bash
evopilot harness profile activate default --project node-api-service --version <profile-version> --json

evopilot target plan \
  --project node-api-service \
  --objective "Make the Node API service production-releasable by enforcing health/readiness checks, latency evidence, CI validation, and release-decision evidence." \
  --json
```

Stop again and show the Alpha/Beta/RC/GA plan. After approved:

```bash
evopilot target plan approve <goal-id> \
  --confirmed-by "project-owner" \
  --confirmation "Approved the Node API service Alpha/Beta/RC/GA phase plan." \
  --json

evopilot target run \
  --project node-api-service \
  --objective "Make the Node API service production-releasable by enforcing health/readiness checks, latency evidence, CI validation, and release-decision evidence." \
  --max-steps 20 \
  --json
```

## Expected Evidence

- Active `ProjectHarnessProfile` bound to the selected template digest.
- Phase plan with Alpha, Beta, RC, and GA targets.
- Build, test, smoke, latency, CI, and release evidence.
- Product-native release decision from `evopilot release decisions --project node-api-service --target <target-id> --json`.

## Do Not Claim

- Do not claim upstream release completion unless source credentials, CI/CD, source closure, deploy connector, and release decision all show `READY` or `GO`.
- Do not treat local sample tests as a production release decision.
