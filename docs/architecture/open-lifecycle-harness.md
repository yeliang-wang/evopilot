# Open Lifecycle Harness

> This page describes the approved EvoPilot v4.0.0 implementation target. It is not a release announcement and grants no publication authority.

EvoPilot owns the lifecycle used to execute a project Goal Loop. `evopilot-harness` remains the independent producer of published immutable Harness assets. A run therefore binds two different things:

1. a `LifecycleRevision`, which says how project work progresses; and
2. a published `HarnessBundle`, which says which expert capabilities, constraints, validators, and evidence contract the project loop consumes.

The lifecycle graph is open and human-editable YAML. The execution vocabulary is closed: every `action.uses` value must resolve to a versioned entry in the Action and Capability Registry. YAML cannot contain shell, JavaScript, Python, arbitrary commands, or hidden executable prompts.

## Runtime resources

| Resource | Responsibility |
|---|---|
| `LifecycleDefinition` | Editable YAML source, imports, typed inputs, stages, dependencies, conditions, actions, and decision modes. |
| `LifecycleRevision` | Canonical imported graph and immutable digest. |
| `LifecycleCatalog` | Discovers definitions without adding project-specific Engine branches. |
| `LifecycleInputBinding` | Resolved values plus source provenance, unresolved questions, redacted review, and digest. |
| `LifecycleBinding` | Exact lifecycle, inputs, policy, Action Registry, runtime, project/Goal/Target, and published HarnessBundle digests. |
| `LifecycleRun` | Append-only attempts, receipts, evidence, external requests, and digest-bound decisions. |

Definition schemas are checked in under [`schemas/lifecycle`](../../schemas/lifecycle). Runtime state is stored separately under the configured EvoPilot data root in `lifecycle-runs/`.

## Decision economy

Input answers are configuration, never approval. Once inputs are complete, EvoPilot presents the full review and computes a `LifecycleBinding.digest`. One explicit plan decision can authorize every unchanged deterministic and reversible stage in that binding.

The runtime pauses again only when it reaches a genuine authority boundary:

- credentials or production access;
- irreversible or external effects;
- project release or publication;
- exception or unresolved risk;
- ambiguous or uncertain prior mutation.

`AUTO` and safe `POLICY` stages run to the next boundary. `HUMAN` records an exact digest-bound decision. `EXTERNAL_SIGNAL` emits an `evopilot-agent-execution-request/v1alpha1` and accepts only a receipt for that exact request. `DISABLED` is recorded as skipped.

## Agent-host boundary

MCP is the normal conversational transport, not a source of authority. The MCP adapter exposes the same HTTP-backed lifecycle operations as CLI and CI. WorkBuddy, Codex, or another conformant host receives a bounded execution request through `LifecycleExecutorAdapterV1`; it cannot change the lifecycle, expand capabilities, approve a gate, mutate Harness assets, or publish merely because a conversation continued.

`@evopilot/adapter-opencode` is the first first-class coding-Agent runtime
adapter. It binds an exact `AgentRuntimeProfile` containing the OpenCode runtime
version, Host, provider/model route, capabilities, workspace, timeout and output
limit. It invokes the external runtime without a shell or automatic permission
bypass, consumes structured JSON events, and returns only normalized
digest-bound receipts. Request/result conformance is public in
`@evopilot/contracts`, so an independent adapter must pass the same validation;
OpenCode is not an exclusive runtime dependency.

The `evopilot.goal-loop@1` registered action is the bridge to EvoPilot Goal Loop execution. Its request carries the exact `goalId`, `targetId`, `projectId`, capabilities, and binding digest. The resulting receipt returns to the surrounding `LifecycleRun` as evidence.

## Reference profiles

- [`datarig-enterprise-internal.yaml`](../../lifecycles/reference/datarig-enterprise-internal.yaml) demonstrates enterprise-internal build, verification, Goal Loop, readiness, and a separate internal-publication gate.
- [`evopilot-harness-oss.yaml`](../../lifecycles/reference/evopilot-harness-oss.yaml) demonstrates public OSS package readiness with publication kept separate.
- [`v3-alpha-beta-rc-ga.yaml`](../../lifecycles/compatibility/v3-alpha-beta-rc-ga.yaml) preserves the v3 ladder as compatibility data, not v4 Engine behavior.

Adding a materially different lifecycle requires a new YAML definition using registered capabilities; it does not require a project-named branch in Engine source.
