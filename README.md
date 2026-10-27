# EvoPilot · v0.8.3 Preview

English | [简体中文](README_CN.md)

Build domain models, assess their quality, and prepare controlled execution through one Expert in Codex. EvoPilot combines Ontology for semantic assets, Harness for quality and evidence, and Runtime for projects, execution and audit.

[Install](docs/installation.md) · [First journey](docs/first-journey.md) · [Documentation](docs/README.md) · [Downloads](https://github.com/yeliang-wang/evopilot/releases/tag/v0.8.3) · [Contribute](CONTRIBUTING.md)

## What can I do?

| Need | Workflow | Result |
|---|---|---|
| Understand an existing project | Reverse modeling of authorized, fixed source | Concepts, behavior, provenance and unresolved questions |
| Design from requirements or documents | Forward modeling | Reviewed domain definitions and implementation specifications |
| Reuse existing assets | Composition of pinned asset versions | Explicit dependencies, resolved conflicts and combined behavior |
| Assess asset completeness | [Content readiness v2](docs/asset-readiness-v081-workflow.md) | Target level, qualified level, gaps and freshness |
| Discuss a version or inspect evidence | [Planning](docs/planning.md) and [readable reports](docs/readable-assets.md) | Reviewable decisions and evidence linked to exact versions |
| Execute a reviewed goal | [Native workflow](docs/native-workflow.md) | Pinned inputs, actual receipts and recovery state |
| Assess a selected service or respond to a finding | [Online Harness](docs/online-harness.md) and [response linkage](docs/response.md) | Measured windows, reviewed actions and independent recovery evidence |

Modeling intent fixes purpose, scope, sources and target level before formal work. Source facts, design declarations, inference and user decisions remain distinct. Missing or stale required evidence blocks completion.

## Three products, one entry

| Repository | Responsibility |
|---|---|
| [EvoPilot](https://github.com/yeliang-wang/evopilot/blob/main/README.md) | Public-package composition, unified Expert, Workspace and distribution |
| [Runtime](https://github.com/yeliang-wang/evopilot-runtime/blob/main/README.md) | Projects, goals, execution claims, state, decisions, receipts and audit |
| [Harness](https://github.com/yeliang-wang/evopilot-harness/blob/main/README.md) | Quality policies, evidence evaluation and immutable quality deliveries |
| [Ontology](https://github.com/yeliang-wang/evopilot-ontology/blob/main/README.md) | Domain concepts, relationships, constraints and immutable semantic deliveries |

The Codex plugin connects to a shared local daemon containing all three services. It is not a fourth product. An explicitly enabled online worker runs independently under macOS launchd; stop it before maintenance. See [architecture](docs/architecture/0002-local-process-topology.md).

## Install a published bundle

Use **Node 24.14.0**. Download `evopilot-0.8.3-preview.tar.gz` and `SHA256SUMS` from the [v0.8.3 release](https://github.com/yeliang-wang/evopilot/releases/tag/v0.8.3). Complete [checksum verification and extraction](docs/installation.md) first. The compiled bundle needs no source build or npm install. Native validation currently supports **macOS arm64** and requires explicit preparation of the pinned toolchain.

Choose new canonical absolute paths outside Git, with existing parent directories:

```sh
preview_bundle="/absolute/path/to/extracted-bundle"
preview_root="/absolute/path/to/new-preview-program"
node "$preview_bundle/app/scripts/manage-preview.mjs" install --bundle "$preview_bundle" --root "$preview_root" --installation-id preview-install
node "$preview_bundle/app/scripts/manage-preview.mjs" doctor --root "$preview_root"
codex plugin marketplace add "$preview_root" --json
codex plugin add evopilot-v01-preview@evopilot-v01-preview-local --json
```

Restart the desktop app after updating the local plugin. Select **EvoPilot v0.8.3 Preview** and ask: “Inspect the installation, initialize my private Workspace, then activate this chat and show the examples.” Verify the actual version, installation root and digest. Installation, Workspace initialization and per-chat activation are separate steps.

Editable projects default to `~/evopilot-workspace`; protected state defaults to `~/.local/share/evopilot/workspaces/<id>`. You can choose other locations. No private GitHub repository is required. Keep service databases, credentials and private evidence outside source and distribution. Inspection and guides stay passive; ordinary chats do not require EvoPilot.

Existing users start at the [current upgrade route](docs/migration.md#current-upgrade-route), including [v2 migration](docs/migration-v080-v081.md). Preserve the previous installation and a verified stopped backup; validate isolated recovery before switching daily use.

## Content levels and boundaries

Current grading explicitly uses `standardVersion: "v2"`:

| Level | Content claim |
|---|---|
| L1 | Domain understanding: concepts, relationships, rules and provenance |
| L2 | L1 plus implementation behavior, interfaces, state, errors and dependencies |
| L3 | L2 plus complete reconstruction specifications for the fixed scope |

**L3 does not require software reconstruction or access to the original environment.** `assetAssessment` and `reconstructionVerification` are separate; `L3 / NOT_REQUESTED` is valid. A content grade does not establish generated functional equivalence, identical code, production readiness or release authority. Historical usability v1 records retain their original meaning.

Native semantic assets use RDF/Turtle and SHACL; quality rules use Rego, OPA and Conftest. Successful validation alone does not approve domain meaning. Standalone Runtime supplies no execution providers; configured trusted adapters and reviewed inputs are required for execution. Arbitrary coding, deployment and autonomous release are not provided. Preview is not GA.

## Documentation and contribution

- [Documentation index](docs/README.md), [capabilities](docs/capabilities.md), [native workflow](docs/native-workflow.md) and [decision evidence](docs/native-decisions.md).
- [Source development](docs/development.md), [language policy](docs/language-policy.md), [contribution guide](CONTRIBUTING.md) and [bilingual maintenance](docs/documentation-languages.md).
- [Changelog](CHANGELOG.md) and [Roadmap](docs/roadmap.md) for version history and planned work.
- [Support](SUPPORT.md), [security](SECURITY.md), [Apache-2.0 license](LICENSE) and [attribution](NOTICE).

These source pages include documentation improvements after v0.8.3. Existing tagged archives retain their original documentation; future releases package the updated pages.
