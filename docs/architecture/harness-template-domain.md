# Harness Template Boundary

This document is retained as a compatibility pointer for pre-v3 architecture readers.

In EvoPilot v3, Harness template authoring and evolution are not an EvoPilot server domain. `evopilot-harness` owns the lifecycle and publishes a Catalog directory. EvoPilot keeps only the read-only consumer side:

- parse configured `CATALOG.md` files
- load published Harness entries
- expose read-only Catalog projections
- select a published Harness during goal planning
- record `selectedHarness` digests in plan evidence

See [Published Harness Catalog](published-harness-catalog.md).
