# Harness Evolution Boundary

Harness evolution is no longer an EvoPilot control-plane lifecycle.

Use `evopilot-harness` for:

- source-project, attachment, corpus, log, and history ingestion
- automatic match against existing Harness definitions
- new Harness creation when no match exists
- draft pack generation
- review, approval, validation, version bump, and publication
- `CATALOG.md` maintenance

EvoPilot consumes the result only after publication. It reads the configured Catalog directory dynamically and records the selected Harness as `plan.selectedHarness` during goal planning.

See [Published Harness Catalog](../architecture/published-harness-catalog.md) and [AI Agent Runbook](ai-agent-runbook.md).
