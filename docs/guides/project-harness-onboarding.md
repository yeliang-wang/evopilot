# Project Harness Onboarding

This page is retained as a compatibility pointer for readers of older EvoPilot guides.

In EvoPilot v3, project onboarding does not create Harness lifecycle records inside EvoPilot. Harness lifecycle management moved to `evopilot-harness`. EvoPilot consumes published Harness Catalog directories and records the selected published Harness in each goal plan.

Use the current flow:

1. Publish or update a usable Harness in `evopilot-harness`.
2. Configure the EvoPilot server with `EVOPILOT_HARNESS_CATALOG_DIR` or `EVOPILOT_HARNESS_CATALOG_DIRS`.
3. Run project onboarding and readiness preflights.
4. Run `evopilot target plan --json`.
5. Review `plan.selectedHarness` and the Alpha/Beta/RC/GA phase plan with the project owner.
6. Approve the plan, then run the target.

See [Published Harness Catalog](../architecture/published-harness-catalog.md), [Selected Harness Binding](../reference/selected-harness-binding.md), and [AI Agent Runbook](ai-agent-runbook.md).
