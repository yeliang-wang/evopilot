# EvoPilot Agent Instructions

This file is for AI coding agents and operating agents that read this repository.

If your task is to operate EvoPilot through the CLI, start with [docs/cli/AGENTS.md](docs/cli/AGENTS.md). That file is the shortest agent-safe entry point for WorkBuddy, Codex, Claude Code, CI jobs, and other command-line automation.

## Roadmap Gate

- For any EvoPilot-series evolution triggered by a user goal, issue, benchmark, article, paper, report, or proposed Roadmap change, start with `$evopilot-evolution-orchestrator`. It is the conversational entry; repository Roadmaps and deterministic gates remain authoritative.
- Benchmark, LLM, and Subagent output is evidence only. It cannot revise this Roadmap, approve an Evolution Target, authorize implementation, or authorize release.
- Treat [EvoPilot Roadmap](docs/roadmap/ROADMAP.md) and `governance/roadmap.yaml` as the accepted product-evolution plan.
- Before changing product behavior, architecture, contracts, APIs, CLI, versions, or release scope, run `npm run roadmap:gate -- --intent "<requested change>" --json` and report the result.
- Continue implementation only for `ALIGNED`. Stop on `UNPLANNED`, `DEVIATION`, `BOUNDARY_CHANGE`, or `UNKNOWN` and obtain explicit user review before editing.
- `BOUNDARY_CHANGE` always requires a replacement ADR, migration and compatibility impact, formal Roadmap revision, executable guard updates, and explicit user approval. A one-task exception is not sufficient.
- User approval of an unplanned one-task exception does not revise the Roadmap and cannot authorize a Release containing an undeclared product capability. Permanent changes must update the human and machine Roadmaps.
- Before product implementation, require an explicitly approved `evopilot-evolution-target/v1` bound to the current `roadmapDigest`, matched milestone or standing work, target version, scope, exclusions, and acceptance evidence. Roadmap digest drift returns the task to review.
- Implementation approval and successful acceptance do not authorize release. Release requires a separate user decision and a passing Evolution Target release gate.
- Before commit or Release, run `npm run roadmap:check`; before a versioned Release, also run `npm run roadmap:release -- <version>`.

## Operating Rules

- Treat EvoPilot as the system of record for projects, goals, loops, evidence, release decisions, users, tenant/workspace scope, credentials, LLM profiles, and audit.
- Treat `evopilot-harness` as the system of record for Harness authoring, lifecycle management, evolution, review, versioning, and publication.
- EvoPilot only consumes a published Harness Registry configured with `EVOPILOT_HARNESS_REGISTRY_CONFIG`; the Registry points at enabled published Catalog roots. `EVOPILOT_HARNESS_CATALOG_DIR` / `EVOPILOT_HARNESS_CATALOG_DIRS` remain legacy read-only fallbacks.
- Matching may read published `HarnessProfile` metadata, but v3 execution must bind a published, immutable `HarnessBundle` with pinned Profile/Component versions, digests, and execution plan. Legacy template consumption must not be represented as v3 Bundle compliance.
- Do not run or document `evopilot harness ...` lifecycle commands. Harness lifecycle CLI belongs in `evopilot-harness`.
- Harness signature verification is optional under the current cross-project contract. Do not introduce a mandatory signature gate without an explicitly approved, versioned trust-contract change.
- EvoPilot-series release operations are local-first. Do not include ECS or another remote production deployment in the default release contract.
- Use `evopilot ... --json` whenever JSON is available. Do not parse human-readable CLI output for automation.
- Do not pass raw GitHub, GitLab, LLM, API, deploy, or password secrets in daily `target run`, `goal run`, or `loop run` commands.
- Store raw project and LLM secrets server-side, then reference them through `tokenRef`, `apiKeyRef`, or an LLM profile id.
- Treat Alpha/Beta/RC/GA as a v3 compatibility lifecycle, not the universal model. For v4 Lifecycle Harnesses, collect typed parameters separately from decisions, automate deterministic reversible stages inside existing authority, and require human decisions only where the resolved lifecycle and policy identify a genuine authority or risk boundary.
- Treat OpenCode as the first first-class external coding-Agent adapter, not as an embedded or exclusive runtime. Bind its exact runtime version, Host, provider/model route, capabilities, workspace limits, request/result, cost, trajectory, artifacts, and resumable receipts; never use automatic permission bypass flags or infer EvoPilot authority from an Agent result.
- Use `evopilot logging inspect --json` and response `requestId` / `correlation.*` fields when troubleshooting; only administrators should temporarily raise logging to `debug`, then restore `info`.
- Stop on `nextAction`, blockers, `NO-GO`, `BLOCKED`, `FAILED`, credential repair, LLM repair, human approval, timeout, or max-step boundaries.
- Report LLM provider, model, token totals, `requestId` values, `selectedHarness` id/version/catalog/entry digest, `TargetEvidencePackage`, `PhasePackage`, and release decision fields in final automation summaries.

## Coding Rules

- Keep EvoPilot CLI behavior server-governed. The CLI is an HTTP adapter and must not bypass RBAC, tenant/workspace scope, approval gates, source-closure gates, DevOps preflight, release policy, or audit.
- Keep the Harness boundary strict: EvoPilot may dynamically read a published Registry/Catalog and select a `PUBLISHED` Harness for planning, but must not expose Harness template publishing, policy/profile activation, evolution, approval, impact, import, mount, or scan mutation APIs.
- Treat [ADR: EvoPilot / evopilot-harness Boundary](docs/architecture/adr/0001-evopilot-harness-boundary.md) as an accepted architecture constraint. A change that crosses it requires an explicit replacement ADR and user approval.
- Before changing behavior, inspect the current implementation and tests instead of relying on old documentation.
- Keep README and docs synchronized with CLI behavior, especially published Registry/Catalog consumption, `selectedHarness` plan evidence, phase-plan approval, Alpha/Beta/RC/GA standards, LLM profile selection, token usage visibility, logging controls, and GitHub/GitLab DevOps prerequisites.
- Run targeted validation after edits. For CLI and docs-affecting changes, prefer:

```bash
npm run cli:test
node --test tests/functional/harness-catalog-consumer.test.mjs
git diff --check
```

Use `npm run check` for broader release-impacting changes.

## Documentation Map

- [docs/roadmap/ROADMAP.md](docs/roadmap/ROADMAP.md) - accepted product direction, version milestones, and deviation process.
- [docs/cli/AGENTS.md](docs/cli/AGENTS.md) - AI Agent entry point for CLI operation.
- [docs/cli/quickstart.md](docs/cli/quickstart.md) - shortest WorkBuddy-safe command flow.
- [docs/cli/automation.md](docs/cli/automation.md) - JSON parsing and stop rules.
- [docs/cli/workflows.md](docs/cli/workflows.md) - scenario workflows.
- [docs/cli/commands.md](docs/cli/commands.md) - command reference.
- [docs/guides/ai-agent-runbook.md](docs/guides/ai-agent-runbook.md) - production end-to-end runbook.
- [docs/architecture/adr/0001-evopilot-harness-boundary.md](docs/architecture/adr/0001-evopilot-harness-boundary.md) - accepted producer/consumer and Bundle execution boundary.
- [docs/architecture/adr/0002-open-lifecycle-harness.md](docs/architecture/adr/0002-open-lifecycle-harness.md) - accepted open execution-lifecycle, interactive input, automation, and authority model.
