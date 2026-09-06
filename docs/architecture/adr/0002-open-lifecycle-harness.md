# ADR: Open Lifecycle Harness

## Status

Accepted

## Date

2026-09-05

## Context

EvoPilot currently models project evolution through a fixed Alpha, Beta, RC,
and GA maturity ladder. That ladder is useful for one delivery style, but it is
not a universal software lifecycle. A database product, internal enterprise
tool, public open-source library, documentation-only change, security hotfix,
and exploratory Agent task do not share the same stages, inputs, evidence,
approval points, or release channels.

DataRig and `evopilot-harness` also encode many project-specific values and
human gates in repository instructions and Codex Skills. Those sources are
valuable evidence and real-case examples, but copying their constants or every
historical approval into EvoPilot would create a closed project-name-driven
workflow rather than a reusable product.

The existing boundary in ADR 0001 remains valid: `evopilot-harness` owns the
Harness Asset supply chain; EvoPilot owns project Goal/Target execution and
project release decisions. This ADR introduces a *Lifecycle Harness* only for
the latter meaning.

## Decision

### 1. Lifecycle is a versioned project-execution asset

EvoPilot owns these new concepts:

| Concept | Responsibility |
|---|---|
| `LifecycleDefinition` | Editable human-authored YAML specification. |
| `LifecycleRevision` | Canonical immutable resolution of one definition and its imports. |
| `LifecycleCatalog` | Discoverable definitions and compatibility metadata. |
| `LifecycleResolver` | Selects a compatible definition from project, goal, risk, environment, and release context. |
| `LifecycleInputBinding` | Immutable values and provenance resolved for one revision. |
| `LifecycleBinding` | Binds revision, inputs, policy, actions, Bundle, runtime, project, and Goal/Target digests. |
| `LifecycleRun` | Append-only execution status, attempts, receipts, evidence, decisions, and terminal result. |

One run resolves and binds exactly one revision before mutation begins. A later
definition, input, policy, action, Bundle, runtime, project, or Goal/Target
change creates a new binding or fails the affected continuation closed; it never
silently changes the active run.

### 2. Open graph, closed execution capabilities

A definition uses a Kubernetes-like resource envelope:

```yaml
apiVersion: lifecycle.evopilot.dev/v1alpha1
kind: LifecycleDefinition
metadata:
  name: oss-release
spec:
  inputs: []
  stages: []
```

The schema permits typed inputs, stage dependencies, imports, bounded
conditions, evidence requirements, retries, recovery, decisions, rollback, and
completion rules. It does not permit arbitrary embedded shell, JavaScript,
Python, prompts with hidden authority, or host-specific executable fragments.
Stages reference versioned `actionRef` and `capabilityRef` entries from an
allowlisted registry. Conditions use a bounded, deterministic expression model.
Specification and runtime status are separate.

This makes the lifecycle model extensible without making configuration an
unreviewed remote-code-execution surface.

### 3. Parameters and decisions are different protocols

`spec.inputs` declares the information a lifecycle needs. Each field may define
its type, human prompt, description, required/default behavior, choices,
validation, conditional visibility, source precedence, derivation, sensitivity,
review behavior, and whether it accepts a `SecretRef`.

Input values may come from:

1. static project discovery;
2. Organization or lifecycle defaults;
3. runtime and adapter capability discovery;
4. deterministic derivation;
5. an interactive user answer; or
6. an external secret reference.

EvoPilot resolves non-interactive sources first. A conformant conversational
host then asks only unresolved relevant questions, one at a time, with detected
or default values visible, and presents a final review. The same schema drives
WorkBuddy, Codex, other Agent hosts, UI, MCP, CLI, API, and CI. Headless callers
may submit an explicit YAML or JSON parameter document, but do not receive a
second set of semantics.

Input capture never grants operational authority. Raw secrets are never asked
for or written into lifecycle documents; a connector or credential workflow
returns a reference. The completed binding records value provenance, redaction,
schema revision, and digest.

### 4. Deterministic and reversible work is automatic by default

Every decision point declares one mode:

| Mode | Meaning |
|---|---|
| `AUTO` | EvoPilot continues when deterministic predicates pass. |
| `POLICY` | A versioned Organization policy decides without ad hoc conversation. |
| `HUMAN` | An authorized person makes a digest-bound decision. |
| `EXTERNAL_SIGNAL` | EvoPilot waits for a separately authenticated system fact, such as an environment becoming ready. |
| `DISABLED` | The transition is unavailable in this resolved revision. |

Schema validation, readiness and compatibility checks, build, unit/integration
tests, smoke, evaluation, evidence capture, deterministic aggregation, and safe
resume are automatic when they are reversible and remain inside the already
authorized scope. Identical-input retry may be automatic only when receipts
prove there is no uncertain external mutation.

A `HUMAN` decision is justified only for:

- scope or plan authority not already provided by the exact user request;
- irreversible or externally visible effects;
- production access, credentials, or an expansion of authority;
- project release or publication;
- policy exceptions, material ambiguity, unresolved risk; or
- an uncertain prior mutation whose effect cannot be established safely.

One digest-bound authorization may cover a bounded unchanged plan and all of
its declared automatic stages. An implementation must not ask for approval at
each stage merely because historical source workflows did so. Only drift in a
binding relevant to the decision invalidates it.

Readiness, input collection, validation success, an Agent recommendation, an
acknowledgement, and generic conversation such as “continue” are not approval.

### 5. DataRig and evopilot-harness are reference profiles

EvoPilot v4 ships or tests at least two data-driven examples:

- an enterprise-internal delivery lifecycle derived from DataRig; and
- a public open-source release lifecycle derived from `evopilot-harness`.

They are versioned reference definitions and conformance cases, not privileged
Engine branches. Repository locations, build commands, database/environment
requirements, package coordinates, release channels, approval roles, and other
constants become declared or discovered inputs. Each reference preserves the
authority boundaries that genuinely apply to that case while eliminating
ceremonial gates from the generic default.

Alpha/Beta/RC/GA is retained as a third compatibility definition. Existing
plans and evidence remain readable and migrate through an explicit adapter;
they are not silently reinterpreted.

### 6. Agent hosts use MCP as transport, not authority

The normal third-party Agent integration is a local or otherwise policy-bound
MCP surface over EvoPilot APIs. An Agent host may discover lifecycle options,
render questions, submit typed answers, show review and decision frames,
request declared actions, and resume jobs. It cannot define Engine truth,
rewrite a decision frame, infer approval, bypass an action allowlist, or own run
state. Direct API/SDK and CLI adapters remain supported for automation and do
not need to route through MCP.

### 7. Harness Asset ownership does not move

An EvoPilot `LifecycleBinding` may reference one or more published candidates
during planning, but execution binds an exact immutable published
`HarnessBundle` closure under ADR 0001. EvoPilot does not author, approve,
publish, or mutate Harness assets. `evopilot-harness` does not execute the
project Goal Loop. Cross-project feedback remains redacted, immutable,
explicitly approved evidence.

## Compatibility and versioning

This decision requires EvoPilot v4.0.0. It changes the externally visible
execution lifecycle, configuration contract, and extension model rather than
adding one more phase to the v3 ladder. EvoPilot v3.2.0 Bundle Consumer Closure
remains the current completion target and is not expanded by this ADR.

The previously planned Agent-runtime foundation is incorporated into v4.0.0
because external action execution is part of the Lifecycle Harness boundary.
Controlled experiments move to v4.1.0 and learning interoperability to v4.2.0.
`evopilot-harness` versions remain independent and require no synchronized
major change.

## Consequences

- Teams can add or revise lifecycle behavior as reviewed data without changing
  the EvoPilot Engine for every software type.
- Ordinary users receive guided questions instead of needing to know repository
  constants or edit a large parameter file unaided.
- Automation no longer stops at gates that do not protect authority or risk.
- More validation is required: schema/canonicalization, graph safety, capability
  compatibility, decision justification, secret handling, drift, resume,
  idempotency, migration, and cross-host semantic conformance.
- Lifecycle definitions become governed project-execution assets, but remain
  distinct from Harness assets produced by `evopilot-harness`.

## Evidence basis

The design adapts established patterns rather than copying another project's
boundary:

- Backstage Software Templates use YAML parameter schemas, generated forms,
  review, and registered actions.
- GitHub Actions supports typed manually supplied workflow inputs and separates
  protected-environment approval from ordinary jobs.
- GitLab separates manual jobs and protected-environment deployment authority.
- Argo Workflows supports reusable workflow templates and explicit suspension.
- Tekton separates declarative pipeline runs, retry, and final tasks.
- Kubernetes custom resources separate declarative spec from observed status and
  use schema validation.

These systems are evidence for declarative inputs, reusable stages, and narrow
human gates. EvoPilot's digest-bound authority and immutable HarnessBundle
rules remain project-specific decisions.
