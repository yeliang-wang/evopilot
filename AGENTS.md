# EvoPilot Agent Instructions

This file is for AI coding agents and operating agents that read this repository.

If your task is to operate EvoPilot through the CLI, start with [docs/cli/AGENTS.md](docs/cli/AGENTS.md). That file is the shortest agent-safe entry point for WorkBuddy, Codex, Claude Code, CI jobs, and other command-line automation.

## Operating Rules

- Treat EvoPilot as the system of record. Do not infer release readiness from local output, local tests, or CI alone.
- Use `evopilot ... --json` whenever JSON is available. Do not parse human-readable CLI output for automation.
- Do not pass raw GitHub, GitLab, LLM, API, deploy, or password secrets in daily `target run`, `goal run`, or `loop run` commands.
- Store raw project and LLM secrets server-side, then reference them through `tokenRef`, `apiKeyRef`, or an LLM profile id.
- Do not approve an Alpha/Beta/RC/GA phase plan until it has been shown to the user or project owner.
- Stop on `nextAction`, blockers, `NO-GO`, `BLOCKED`, `FAILED`, policy review, credential repair, LLM repair, human approval, timeout, or max-step boundaries.
- Report LLM provider, model, token totals, `requestId` values, `TargetEvidencePackage`, `PhasePackage`, and release decision fields in final automation summaries.

## Coding Rules

- Keep EvoPilot CLI behavior server-governed. The CLI is an HTTP adapter and must not bypass RBAC, tenant/workspace scope, approval gates, source-closure gates, DevOps preflight, release policy, or audit.
- Before changing behavior, inspect the current implementation and tests instead of relying on old documentation.
- Keep README and docs synchronized with CLI behavior, especially phase-plan approval, Alpha/Beta/RC/GA standards, LLM profile selection, token usage visibility, and GitHub/GitLab DevOps prerequisites.
- Run targeted validation after edits. For CLI and docs-affecting changes, prefer:

```bash
npm run cli:test
git diff --check
```

Use `npm run check` for broader release-impacting changes.

## Documentation Map

- [docs/cli/AGENTS.md](docs/cli/AGENTS.md) - AI Agent entry point for CLI operation.
- [docs/cli/quickstart.md](docs/cli/quickstart.md) - shortest WorkBuddy-safe command flow.
- [docs/cli/automation.md](docs/cli/automation.md) - JSON parsing and stop rules.
- [docs/cli/workflows.md](docs/cli/workflows.md) - scenario workflows.
- [docs/cli/commands.md](docs/cli/commands.md) - command reference.
- [docs/guides/ai-agent-runbook.md](docs/guides/ai-agent-runbook.md) - production end-to-end runbook.
