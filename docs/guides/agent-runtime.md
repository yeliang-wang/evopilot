# External Agent Runtime

EvoPilot Runtime does not embed a general-purpose coding Agent. Source work is delegated to a separately qualified external Agent Runtime such as Codex or OpenCode.

## Qualification

An `AgentRuntimeProfile` declares adapter identity, runtime version, provider, model, capabilities, workspace boundary, timeout, output limit, and `HOST_MANAGED_DENY_UNDECLARED` permission mode. Qualification compares required capabilities and produces a digest-bound result with evidence references. An unqualified profile cannot execute.

Agent Host and Agent Runtime are different roles. Codex or Claude Code may host the Expert conversation; the exact execution runtime selected for a stage is independently bound and qualified.

## Pending execution

At an external stage, Runtime emits one immutable request binding:

- tenant, workspace, project, goal, target, run, stage, action, and idempotency key;
- Lifecycle revision and published HarnessBundle plus HarnessExecutionBinding;
- policy, provider, environment, authority, Runtime, and evidence digests;
- Agent Runtime profile and qualification digests;
- sandbox, allowed effects, capabilities, and SecretRefs;
- a digest over the complete request.

The adapter rejects request or profile drift. It returns a normalized result with the same request, binding, and idempotency identities, plus status, immutable receipt, actual effects, evidence, cost/usage, and artifact digests. Runtime validates identity, effects, and evidence before changing Loop state. Exact replays are suppressed; conflicting replays and uncertain mutations fail closed or enter bounded reconciliation.
