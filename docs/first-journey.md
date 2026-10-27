# First use

English | [简体中文](zh-CN/first-journey.md)

Start with the [current v2 content workflow](asset-readiness-v081-workflow.md) for modeling purpose, scope, level and content grading. Use the [native package workflow](native-workflow.md) for exact native envelopes and expected files; content grading does not require a business Run or reconstruction. Historical JSON authoring commands remain retired; old records retain their original meaning.

[Install EvoPilot](installation.md), select the EvoPilot plugin in Codex and say:

> Start using EvoPilot. Create my personal Workspace, then show me the forward and reverse examples.

No GitHub login or separate Workspace repository is required. The Expert checks for a binding. If none exists, it explains the default user project location (`~/evopilot-workspace`) and separate protected service state (`~/.local/share/evopilot/workspaces/<workspace-id>`), initializes them, then activates this chat. You can specify your own locations. Existing occupied directories are not overwritten. Merely asking what EvoPilot does stays passive.

The project contains README, documentation, synthetic examples, public reusable assets and private project materials. `public` means reusable scope, not permission to upload. Keep databases, raw runtime evidence, control state and credentials out of Git; use a complete Workspace backup for restoration. The installation binds one Workspace; use the explicit attach/migration workflow for existing data rather than editing identity files or moving live databases.

For a planning discussion, ask “Discuss the next version, preserve assumptions and open questions, and show the review table before execution.” The [planning guide](planning.md) explains forward ideation, reverse onboarding, revisions, cross-chat resumption and execution handoff. [Readable reports](readable-assets.md) show native definitions and validation evidence without changing standards. Use the [installation guide](installation.md) for the exact verified current Preview release artifacts. Existing users follow the [current migration route](migration.md#current-upgrade-route) and the [v2 state migration guide](migration-v080-v081.md); selecting a new source checkout does not update a running installation.

## Try a synthetic example

Say “Run the forward example and show its expected artifacts” or “Run the reverse example without changing its source.” Follow the installed example README. The Expert labels synthetic inputs, scopes and decisions; they do not authorize actions on your real project. Compare actual draft, delivery and evaluation artifacts with the documented outputs.

## Start from requirements

> Model a library with Book and Loan. Show the draft and unresolved questions before publication.

Expect a native Ontology v1 draft with concepts, relations, constraints and proposed source mappings. Required unknown business rules remain PENDING. Review the exact draft and give your decision before separate publication. See [Ontology v1](https://github.com/yeliang-wang/evopilot-ontology/blob/main/specifications/v1/README.md).

## Connect an existing project

> Read only this project revision and these files. Extract its Ontology and Harness, distinguish direct evidence from inference, and list questions for review.

The Host reads only authorized sources; the Expert records real locator, revision and digest. The source stays unchanged. Code alone does not confirm business meaning. Review and publish through the same v1 lifecycle as forward modeling. Structured JSON/YAML import is a separate bridge, not an arbitrary Java/repository parser.

## Evaluate and hand off

> Evaluate this Harness against the supplied reports. Show missing evidence. Prepare a Runtime goal using the exact delivered Ontology and Harness versions.

Missing evidence remains incomplete and blocks dependent completion. Evaluation does not automatically change versions or launch an action. A prepared native Run pins the exact source, immutable asset references, standard/lock digests, requirements and real collection evidence. After your actual decision, authorized dispatch validates instances and quality evidence. Runtime execution, quality and business validity remain distinct. Runtime does not arbitrarily edit code or deploy software.

## Continue in another chat

> Continue my project's Target from the last Loop. Check whether the source baseline changed and show the remaining evidence.

Select the plugin in that chat first. The Expert activates that session, reads private progress and real receipts, compares the recorded baseline and proposes impact/reuse or a new reviewed asset version. Previous Runs keep their original pins. Asset alignment occurs at explicit checkpoints, not continuously in the background. Private Target/Loop documents do not change the EvoPilot product Roadmap or invent a native Goal-completion API.

For a lost response, retain the original requestId and say “Inspect this receipt and reconcile without redispatch.” Use product maintenance for backup, migration and upgrade; never copy a live database or edit historical identities to repair a move.

## More workflows and capabilities

The [complete Expert catalogue](expert-scenarios.md) distinguishes current native, feedback, online and response journeys from retained historical scenarios. The default daemon does not inherit the Host model or credentials. A provider-prerequisite diagnostic is not a successful execution. See [capabilities](capabilities.md), [Codex integration](codex.md) and [composition](product-composition.md).

For a service already connected to online Harness, ask: “Inspect the retained finding, explain applicable published guidance, and prepare the bounded response for review.” The Expert must show the exact project, deployment, source, prerequisites and proposed action. An alert does not approve it. After execution, request independent recovery evidence and both owners' asset feedback. See [response linkage](response.md); installing the plugin does not itself connect a production service or enable its worker.

Guides return `installedReferences` relative to verified `installationRoot` (already `managedRoot/app`). Child references resolve under `node_modules/@evopilot-next/{runtime,harness,ontology}/`; do not append another `app`. Read owner schemas for exact payloads. Public visibility does not authorize upload; model output never grants approval or release authority.
