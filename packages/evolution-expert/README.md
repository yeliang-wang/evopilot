# EvoPilot Evolution Expert

`@evopilot/evolution-expert` 2.3.0 is the independently versioned,
Agent-neutral interactive guide with published EvoPilot Runtime 6.3.2 compatibility. It helps an ordinary
user discover and declare a project, understand Runtime-produced Harness
matching and Lifecycle composition, operate a Goal Target Loop, follow
automatic recovery, inspect evidence and readiness, and understand resource
versions, capability migration, controlled Pipeline observations and successors,
Champion/Challenger evidence, policy-bounded activation, monitoring, deterministic
rollback, generic-primitive gaps, shadow validation, and Cutover readiness.

The Expert is not the Runtime and is not a Harness producer. It owns no
canonical state, credentials, approval identity, Harness choice, recovery
policy, acceptance verdict, publication, or Release authority. Ordinary-human
operation is Expert-over-MCP only. If it is absent or incompatible,
administrators and machines can diagnose or recover Runtime through MCP, CLI,
API, and CI without creating a silent ordinary-human fallback.

### Released 2.3 semantic guidance

The source Core now routes project semantic discovery, compatibility, exact review,
explicit approval and binding inspection through the corresponding Runtime MCP tools.
It negotiates current project-scoped semantic capability, preserves exact human
decision binding, and explains unavailable execution/completion rather than silently
calling legacy Goal operations. Migration, activation and rollback requests first
read Runtime activation state after capability negotiation. Exact typed transition
previews preserve action, head and destination; a separate human decision must bind
the exact transition review digest. Existing runs retain pins. An uncertain response
is reconciled from activation history, never automatically replayed, and historical
receipts do not establish the current head. Gap requests do not invent assets.

Runtime's read-only `gap` operation now projects verified compatibility findings
into ontology-material, Harness-declaration, cross-contract or unresolved evidence/
reasoning review destinations. These are not defect ownership claims. Producer
publication stays external; successors require explicit published selection and the
existing exact migration review/decision workflow. No old execution pins change.

Semantic onboarding uses Runtime's read-only guide for an already registered
project and selected Catalog. Compatible choices recommend reviewed dual binding,
but even a unique pair is not automatically selected or approved. Existing bindings
are preserved; missing matches and indeterminate evidence stay unresolved. Business
field/product type are not inferred. Legacy registration and credential/readiness
flows remain separate; there is no hidden Catalog search or legacy execution fallback.

Dual-bound execution has a separate capability-negotiated MCP guide. Generic run
intent is read-only; explicitly selected finite operations carry strict nested
`{projectId, payload}` inputs from Runtime-owned plans. Missing nested fields are
reported individually. Business-outcome review approval needs its own exact digest
and human evidence, not project-binding approval. No operation chains to another
effect or retries an uncertain mutation. Receipt reads and current Runtime state
guide recovery; a plan read cannot prove whether dispatch or approval succeeded.
Business and Harness validation remain separate, and `DUAL_VALIDATED_NOT_COMPLETED`
never becomes Goal completion. Verified completion progress preserves phase blockers
even at 100% Target progress. Release authority and publication remain false.

Before preparing a plan, `planning` exposes exact verified authoring choices and
`draft` compiles explicit finite rules against that basis into a server-pinned
declaration. Neither persists a plan nor approves business meaning or dispatches.
The returned declaration still needs separate preparation, binding and review.

The read-only execution `mapping` guide presents already bound criteria, concepts,
business rules and Harness obligations, with empty coverage inputs. It never guesses
criterion-to-rule mapping or business field/product type. Supplied explicit coverage
still needs a separate outcome review and exact human approval.

Expert 2.3.0 is published for Runtime 6.3.0 after all 400 applicable acceptance
criteria passed. The later Runtime 6.3.1 maintenance release was separately accepted
with these unchanged Expert 2.3.0 bytes; the historical 400-criterion Expert result
is not replaced by Runtime's 409-criterion result. See [current publication and limits](../../docs/releases/current-release.md).
Real Host acceptance is Codex-only, using existing configuration; native credential
entry, submission and cancellation remain explicitly unverified for this release.
There is no separate 2.2.1 release.
Five Host adapters are generated from the same Core; no installed adapters or
Host configuration are modified by source generation.

### Runtime-owned Lifecycle guidance

For adapter authors using the source SDK, `planExpertTurn` takes flat Lifecycle
inputs. `executeExpertTurn` projects only declared fields into the public MCP
envelope: identifiers and read-query fields stay at the top level; mutation and
resolution bodies go under `payload`. Unknown fields are rejected. Runtime actor,
role and tenant scope come from the authenticated connection, never these inputs.

`compare lifecycle versions` uses explicit `lifecycleId`, `fromVersion` and
`toVersion`; `resolve lifecycle` and `resolve lifecycle inputs` use an explicit
`lifecycleId` and optional `lifecycleVersion`. Resolution reads the active Runtime
revision; it does not activate a revision, execute a run or grant authority.
Activation, deactivation, archive, restore and rollback retain exact decision
requirements. `authorizationDigest` is checked by the Expert, not forwarded as
Runtime authority. Initial activation may supply `expectedActiveDigest: null` only
when no active pointer exists; later changes need the observed revision digest.

Source integration tests exercise the Expert through actual stdio MCP and a local
Runtime process, including successor diff, permission denial, compare-and-set,
archive/restore, rollback, uncertain-response read-back and process restart.
Preservation of an existing run is checked against an explicitly seeded synthetic
binding; public run creation, published Harness qualification, installed Candidate
acceptance and real third-party Host execution are not established by this test.
An uncertain write is surfaced without automatic replay. Explicit repeated
requests are reconciled by Runtime; restore does not implicitly activate.

The [versioned convergence corpus](../../tests/e2e/versions/README.md) retains
Expert 2.3.0's independent five RC families, ten machine variants and all 388
inherited obligation bindings. Source tests cannot close installed/Host criteria;
those are separately recorded in the completed approved 2.3.0 acceptance.

## Install and verify

Version 2.3.0 is available on public npm and [GitHub Release](https://github.com/yeliang-wang/evopilot/releases/tag/evolution-expert-v2.3.0).
Exact-version public installation, package integrity, Registry signatures/provenance
and Runtime 6.3.0 compatibility were verified separately from Candidate acceptance.

```bash
npm install --global @evopilot/evolution-expert@2.3.0
evopilot-expert version
evopilot-expert doctor codex 6.3.2
evopilot-expert tutorial
evopilot-expert versions
evopilot-expert migration
```

For Claude Code or WorkBuddy, replace `codex` with `claude-code` or
`workbuddy`; `generic-agent` and `generic-mcp` are also packaged adapters.
`doctor` and `compatibility` check the declared package/adapter contract, using
Runtime `6.3.0` when its version is omitted; the response reports that exact
`engineVersion`. Explicit `6.2.0` retains legacy non-semantic support, while semantic
operations require current Runtime capability negotiation. `READY` / `CONFORMANT` means only
that declaration is compatible: neither command observes Host capabilities,
connects to Runtime, proves Runtime LLM readiness, or grants authority.
Actual Host qualification requires independently observed capabilities and
the real-Host acceptance gate. Unsupported Runtime versions, malformed stable
versions and unknown packaged Hosts return a nonzero exit status.

## Use

```bash
evopilot-expert plan "help me register an unknown project"
evopilot-expert plan "explain the selected Harness and Lifecycle plan"
evopilot-expert plan "why did recovery stop?"
evopilot-expert plan "record this Pipeline observation and show the immutable successor"
evopilot-expert plan "compare champion and challenger without mixing mismatched evidence"
evopilot-expert plan "can the active policy safely activate this successor?"
evopilot-expert render runtime-interaction.json
```

Project onboarding begins with Runtime discovery through MCP. The Expert
renders only the unresolved typed questions returned by Runtime.
Secret values are never entered; declarations contain `secret://`, `env://`,
or `vault://` references. Registration, adjustment, semantic diff, activation,
and rollback remain Runtime operations.

On first run, ask the Expert to inspect Runtime LLM readiness. Runtime stays
setup-only until a user-selected workspace Profile has an active SecretRef, a
fresh live preflight, and an explicit digest-bound workspace-default binding.
The Expert refuses raw credentials in conversation and delegates credential
entry to a Host-native secure-input capability.

## Upgrade, rollback, and remove

```bash
npm install --global @evopilot/evolution-expert@2.3.0
evopilot-expert doctor codex 6.3.2

npm install --global @evopilot/evolution-expert@2.2.0
evopilot-expert doctor codex 6.2.0

npm uninstall --global @evopilot/evolution-expert
evopilot --version
```

Upgrading, rolling back, or removing the Expert must not change Runtime bytes
or durable Runtime state. After a Host transfer or restart, inspect the run in
Runtime and render that current object; never restore state from Expert prose.
A clean reinstall repeats install plus `doctor` and then resumes from Runtime.

## Host adapters

The portable Skill is in `skill/SKILL.md`. Codex, Claude Code, WorkBuddy,
generic Agent, and generic MCP projections are generated under `generated/`
from the same Core and include a `bundle.json` lifecycle contract. A new Host
uses `createExpertAdapter(host)`, declares the five required Host
capabilities, and passes `assertExpertAdapterConformance`; it does not require
an Engine or Expert Core source branch.

See the repository guides for the [Expert workflow](../../docs/guides/evolution-expert.md),
[project definitions](../../docs/guides/project-definitions.md), and
[Harness-guided architecture](../../docs/architecture/harness-guided-governed-evolution-runtime.md).

<a id="project-definition-guidance-230-source-development"></a>

## Project definition guidance (2.3.0)

Use “discover project” with `projectFacts` to obtain Runtime-owned questions,
then “register project” with `projectDiscovery` and `projectDefinition`. Expert
projects the declaration into the public MCP `payload`; discovery context is
not authorization. “List project definitions”, “inspect project definition”
and “compare project versions” read persisted definitions and impact. Inspection
accepts `projectDefinitionId` and an optional exact `version`; comparison takes
`fromVersion` and `toVersion`.

“Adjust project” registers a separate immutable revision. “Activate project
definition” and “rollback project definition” select a retained revision for
future planning. Both require `projectDefinitionId`, `version`,
`definitionDigest`, `expectedActiveDigest`, `authorizationDigest` and
`evidenceRef`, plus an explicit matching decision. The decision digest must be
the reviewed destination definition digest; decision evidence must match.
Runtime rejects changed destination or current-definition bindings. Read back
Runtime state after uncertainty without replaying a write.

Initial definition registration selects its first revision under the existing
Runtime contract; later registration does not select a successor. Definitions
remain distinct from operational project registration, reviewed semantic
binding and execution readiness. Source-process tests do not establish an
installed Candidate or qualified Host acceptance result.

### Connecting the project to Runtime

A declaration is separate from a connected Runtime project. Use “plan project
connection” with explicit `projectRegistration` inputs to read the existing
source/DevOps/LLM checklist; stop on unresolved blockers. “Connect project”
passes an explicitly requested registration through the Runtime checks. The
registration body supports `id`, `name`, `profileId`, `repository`,
`llmProfileId`, `devops`, `runtime`, `objective`, `requireLlmReady` and
`githubAppInstallationId`. Scope comes from the current Runtime principal;
Expert refuses scope overrides and nested raw credentials. Use `tokenRef` and
LLM profile ids instead of values. Repository preflight can read the selected
source, so do not infer source-access authority from a declaration.

“List connected projects”, “inspect connected project” and “project readiness”
read the persisted state. Preserve every Runtime warning, blocker and
`nextAction`; a local project checklist can have `llm: WARN`, even when its
status is `READY_TO_RUN`. Registration and that label do not authorize a Goal.
Semantic onboarding still needs an explicit Catalog choice, verified supply
and separate binding/transition decisions. Read back after an uncertain
registration response without replaying the write.

Governed SDK guidance projects only declared input fields into the public MCP
`payload` envelope. Runtime owns candidate selection, authenticated scope and
binding validation; conversational `serverUrl`, actor and scope overrides are
rejected. Recovery needs explicit attempt/budget and effect facts. Rendering
help or supplied acceptance, Cutover and release context produces `authority:
NONE`; it neither verifies that context nor grants execution or publication.

Runtime **6.3.2** independently verifies LLM readiness continuity with this unchanged public Expert 2.3.0 package. Its patch-specific acceptance preserves the earlier Expert and Runtime 6.3.1 evidence; it does not rerun or relabel their original campaigns. See [current publication and limits](../../docs/releases/current-release.md).
