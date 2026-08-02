# Open Source Readiness

This checklist defines EvoPilot's public-product readiness baseline. It is intentionally about open-source trust and distribution, not about adding new runtime features.

## Positioning

EvoPilot is an evidence-driven control plane for AI-agent product evolution. It focuses on harness governance, goal loops, evidence, human approval, and release decisions. It is not an agent runtime or prompt playground.

## Public Trust Assets

| Asset | Status | Evidence |
| --- | --- | --- |
| README first screen | Present | `README.md` |
| License | Present | `LICENSE`, Apache-2.0 |
| Notice | Present | `NOTICE` |
| Changelog | Present | `CHANGELOG.md` |
| Contribution guide | Present | `CONTRIBUTING.md` |
| Security policy | Present | `SECURITY.md` |
| Code of conduct | Present | `CODE_OF_CONDUCT.md` |
| CI workflow | Present | `.github/workflows/ci.yml` |
| Issue forms | Present | `.github/ISSUE_TEMPLATE/` |
| Pull request template | Present | `.github/pull_request_template.md` |
| AI Agent entrypoint | Present | `AGENTS.md`, `docs/cli/AGENTS.md` |
| API contract | Present | `docs/api/openapi.json` |
| Dashboard repository | External | `yeliang-wang/evopilot-dashboard` |

## Product Evidence Assets

| Capability | Evidence |
| --- | --- |
| Harness governance | `docs/reference/project-harness-profile-schema.md`, `harness-templates/public/` |
| Template lifecycle | `docs/guides/harness-template-evolution.md` |
| CLI automation | `docs/cli/AGENTS.md`, `docs/cli/quickstart.md`, `docs/cli/commands.md` |
| Goal loops | `docs/cli/workflows.md`, `docs/guides/ai-agent-runbook.md` |
| Release governance | `docs/reference/release-package.md`, `docs/reference/production-user-e2e.md` |
| Logging and troubleshooting | `AGENTS.md`, `docs/cli/automation.md` |

## Validation Commands

```bash
npm run cli:test
npm run check
git diff --check
```

## What This Does Not Prove

This checklist does not prove community adoption, ecosystem maturity, external user satisfaction, star/fork growth, issue activity, or long-term release cadence. Those require public releases, external users, and sustained maintenance.
