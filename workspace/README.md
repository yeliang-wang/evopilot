# Your private Workspace

This source directory ships templates only. Select EvoPilot and ask the Expert to initialize your Workspace. You do not need an EvoPilot-owned private GitHub repository.

| Location | Purpose | Version control |
| --- | --- | --- |
| Installed program | Verified code, Expert and templates | Immutable managed installation |
| Project root; default `~/evopilot-workspace` | Your README, examples, editable assets, project baselines and private Goal/Target/Loop evidence | Optional user-managed private Git |
| State root; default `~/.local/share/evopilot/workspaces/<id>` | Owner databases, immutable assets, decisions and receipts | Outside Git |
| Adjacent state sidecars | Connection state, coordination lease and maintenance journals | Outside Git; preserve for recovery |
| Local relocation keys | Verification of historical location lineage | Outside Git; retain for same-host restore |

Setup copies the bundled [project template](templates/project/README.md), initializes the owning services and binds the installation. Initialization does not activate the chat. Repeating setup preserves user edits; occupied paths, conflicting identities and unsafe locations are rejected. Project and state roots remain separate from installed and source program trees.

`templates/workspace.json` illustrates the exact product marker fields with placeholders. Never copy it into a real workspace or preinitialize an example marker. Only product initialization creates and verifies the actual `evopilot-workspace/v1` marker with canonical root and OS uid.

Runtime owns state/runtime and execution/receipts, Harness owns state/harness and quality assets, and Ontology owns state/ontology and semantic assets. The parent owns no fourth business store. Public and private assets share specifications/v1; extensions cannot override required contracts. Public visibility does not authorize upload. Synthetic examples are learning material, never real project acceptance evidence.

Ordinary project onboarding does not edit product Roadmaps or source. Follow the [first journey](../docs/first-journey.md), [Expert catalogue](../docs/expert-scenarios.md), [migration](../docs/migration.md) and [recovery](../docs/recovery.md).
