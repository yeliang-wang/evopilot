# Documentation

Current v0.5.0 Preview: [native workflow](native-workflow.md), [native toolchain](native-toolchain.md), [project standard](../specifications/project/v1/README.md), and [Expert scenarios](expert-scenarios.md). Historical v0.2 examples cannot create new work under corrected-v1 semantics.

Start with [installation](installation.md) and the [first journey](first-journey.md). The portable bundle is the user path; source builds are for contributors.

| Need | Guide or reference |
| --- | --- |
| Install, verify checksums, register or remove | [Installation](installation.md) |
| Forward design, reverse modeling, quality, execution | [First journey](first-journey.md) |
| Initialize or maintain your private Workspace | [Workspace](../workspace/README.md), [migration](migration.md), [recovery](recovery.md) |
| All supported Expert scenarios and acceptance branches | [Expert scenario catalogue](expert-scenarios.md), [testing](testing.md) |
| Concepts and limits | [Capabilities](capabilities.md), [product boundaries](architecture/0001-three-product-boundary.md), [composition](product-composition.md) |
| Codex activation and tools | [Codex integration](codex.md) |
| Ontology specifications and schemas | [v1 definitions](https://github.com/yeliang-wang/evopilot-ontology/blob/main/specifications/v1/README.md), [schemas](https://github.com/yeliang-wang/evopilot-ontology/tree/main/schemas), [examples](https://github.com/yeliang-wang/evopilot-ontology/tree/main/examples) |
| Harness specifications and examples | [v1 definitions](https://github.com/yeliang-wang/evopilot-harness/blob/main/specifications/v1/README.md), [examples](https://github.com/yeliang-wang/evopilot-harness/tree/main/examples) |
| APIs | [Runtime](https://github.com/yeliang-wang/evopilot-runtime/blob/main/docs/service.md), [Harness](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/service.md), [Ontology](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/service.md), [parent local service](local-service.md) |
| Develop and verify | [Development](development.md), [testing](testing.md), [contributing](../CONTRIBUTING.md) |
| Troubleshoot or migrate | [Recovery](recovery.md), [migration](migration.md), [support](../SUPPORT.md) |
| Release and roadmap | [Release procedure](github-release.md), [current roadmap](roadmap.md), [changelog](../CHANGELOG.md) |

Architecture also covers [process topology](architecture/0002-local-process-topology.md) and [local authoring](architecture/0003-local-authoring.md). Product links use GitHub; within-parent links stay relative. Installed bundles map shipped child documentation to local paths for offline reading.

The [frozen roadmap](roadmap/ROADMAP.md) preserves the v0.1.0 baseline and the [repair scope](../governance/delivery-repair-v011.json) preserves v0.1.1. The [v0.2 target](../governance/workspace-v02.json) records independent Workspace workflows; the [v0.3 standards correction](../governance/standards-v03.json), [v0.4 feedback](../governance/feedback-v04.json) and [v0.5 online Harness](../governance/online-harness-v05.json) define the subsequent release scopes. [v1.0 readiness criteria](../governance/readiness-v1.json) stay generic; real project progress and evidence remain private. These documents define scope, not acceptance results.

## Registered execution feedback

Start with [the v0.4 feedback guide](feedback.md) for exact operation inputs, owner review and recovery; [the Expert catalogue](expert-scenarios.md) lists V04-U01–U03. The [fixed Target](../governance/feedback-v04.json) separates implementation from acceptance.

## Online Harness

Use [online setup, inspection and recovery](online-harness.md), the [worker design](architecture/0005-online-harness.md), and the fixed [v0.5 Target](../governance/online-harness-v05.json). Expert journeys V05-U01–U05 have linked executable tests. Actual Host and controlled telemetry acceptance remain separate evidence.
