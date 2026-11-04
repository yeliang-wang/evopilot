# EvoPilot

English | [简体中文](README_CN.md)

EvoPilot is the entry point for three independently evolving components: Runtime for software lifecycles, Ontology for semantic assets, and Harness for quality rules and evidence. Choose the component that owns your task.

| Component | Responsibilities | Documentation | Releases |
|---|---|---|---|
| [Runtime](https://github.com/yeliang-wang/evopilot-runtime) | Project Lifecycle YAML, publisher-owned Base rules, execution gates, receipts, audit and the lifecycle Dashboard | [Operator guide](https://github.com/yeliang-wang/evopilot-runtime/blob/main/docs/runtime-v090.md) | [Runtime downloads](https://github.com/yeliang-wang/evopilot-runtime/releases) |
| [Ontology](https://github.com/yeliang-wang/evopilot-ontology) | Domain concepts, relationships, constraints and versioned semantic assets | [Ontology documentation](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/README.md) | [Ontology downloads](https://github.com/yeliang-wang/evopilot-ontology/releases) |
| [Harness](https://github.com/yeliang-wang/evopilot-harness) | Quality rules, native validation, evidence and versioned Harness assets | [Harness documentation](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/README.md) | [Harness downloads](https://github.com/yeliang-wang/evopilot-harness/releases) |

Starting with Runtime 0.9, each component owns its version and release. This parent repository provides the homepage, index and navigation; it introduces no new parent product version. Ontology and Harness retain their existing published interfaces and installation entries until their own evolution releases change them.

Runtime's independent service stores configuration and enforces lifecycle rules. Codex supplies reasoning and coding through the Runtime Expert and HTTP MCP plugin. Asset authoring and publication stay with their owning component. Read the selected component's installation, compatibility and migration instructions before changing an existing installation.

## Existing installations and historical documentation

The [v0.8.3 bundle and release](https://github.com/yeliang-wang/evopilot/releases/tag/v0.8.3), [versioned README](https://github.com/yeliang-wang/evopilot/blob/v0.8.3/README.md), [installation guide](https://github.com/yeliang-wang/evopilot/blob/v0.8.3/docs/installation.md) and [historical documentation](https://github.com/yeliang-wang/evopilot/blob/v0.8.3/docs/README.md) remain available. They describe that historical combined installation. Keep existing data, credentials and audit evidence when following a component's supported migration route.

Historical composition source, the combined Expert/plugin and daemon, build scripts and shared-contract generation remain in this repository for existing versions. The repository therefore still contains executable historical material. Runtime 0.9's independent installation does not require the parent source or daemon; further Ontology/Harness separation belongs to their own future targets.

Release availability, package digests and acceptance belong to each component's actual release records. A navigation link does not certify installation or project acceptance.

[Documentation index](docs/README.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Apache-2.0 license](LICENSE)
