# External Agent Runtime

EvoPilot Runtime does not embed a general-purpose coding Agent. Source work is delegated to a separately qualified external Agent Runtime such as Codex or OpenCode.

## Qualification

An `AgentRuntimeProfile` declares adapter identity, runtime version, provider, model, capabilities, workspace boundary, timeout, output limit, and `HOST_MANAGED_DENY_UNDECLARED` permission mode. Qualification compares required capabilities and produces a digest-bound result with evidence references. An unqualified profile cannot execute.

Agent Host and Agent Runtime are different roles. Codex or Claude Code may host the Expert conversation; the exact execution runtime selected for a stage is independently bound and qualified.

## From Installation To Project Execution

The [first task](first-task.md) verifies the Host connection and existing Runtime
readiness. It does not provision an executor or a business evidence collector.
Before a project can perform bounded source work, its operator must supply:

| Requirement | Evidence to inspect |
| --- | --- |
| Project and published assets | Exact project definition, Registry/Catalog selection, immutable Bundle and semantic bindings required by the chosen path |
| External execution implementation | Actual runtime binary/version, adapter, provider/model route and digest-bound qualification |
| Finite scope | Canonical workspace, current source digest, explicit writable files, allowed effects, timeout and token limits |
| Independent validation | Project-owned validator/collector configuration and evidence policy; process success alone is not a business result |
| Governed request | Runtime's current pending request, matching authority, idempotency identity and retained receipt location |

The stock server configures neither `semanticExecutorAdapter` nor
`semanticEvidenceCollector`. Deployments can supply these through the existing
server integration contract; see the [MCP execution contract](../../packages/adapter-mcp/README.md#semantic-execution-tools-630-source-development)
and [Action Providers](../reference/action-providers.md). Independent local project
extensions are deployment-specific integrations, not a universally installed npm
dependency or a default project implementation.

Inspect project-scoped capabilities before preparing a request. If execution or
collection is unavailable, report the missing implementation and stop before
dispatch. Do not use a successful package install, tool listing or another
project's acceptance receipt as qualification for this project.

For semantic execution, create the governed plan with explicit active
`semanticGovernedSources` references and the qualified executor binding. Runtime
derives its own implementation and governance pins, including the current scoped
principal grant. A request-authority digest from an ordinary plan cannot replace
that grant. The separate semantic preparation and decision flow still checks the
current observation, permissions, published materials and pending request.
Runtime LLM references may use the server-owned Secret IDs emitted by bootstrap;
they must match the persisted Goal/Profile owners and never resolve a credential
inside semantic metadata validation. Credential readiness remains a separate check.

## Pending execution

At an external stage, Runtime emits one immutable request binding:

- tenant, workspace, project, goal, target, run, stage, action, and idempotency key;
- Lifecycle revision and published HarnessBundle plus HarnessExecutionBinding;
- policy, provider, environment, authority, Runtime, and evidence digests;
- Agent Runtime profile and qualification digests;
- sandbox, allowed effects, capabilities, and SecretRefs;
- a digest over the complete request.

The adapter rejects request or profile drift. It returns a normalized result with the same request, binding, and idempotency identities, plus status, immutable receipt, actual effects, evidence, token usage, and artifact digests. Monetary fields are not required product usage measures. Runtime validates identity, effects, and evidence before changing Loop state. Exact replays are suppressed; conflicting replays and uncertain mutations fail closed or enter bounded reconciliation. Read the original request and receipt after an uncertain response; do not dispatch it again without resolved state and current authority.
