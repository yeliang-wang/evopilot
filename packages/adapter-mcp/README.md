# `@evopilot/adapter-mcp`

Installable stdio MCP adapter for EvoPilot's server-governed Open Lifecycle Harness.
It exposes the same lifecycle operations as the HTTP API and adds no approval,
execution, or publication authority of its own.

Configure the Agent host with the `evopilot-mcp` command. Runtime connection and
identity values are read from `EVOPILOT_SERVER`, `EVOPILOT_API_TOKEN`,
`EVOPILOT_TENANT`, `EVOPILOT_WORKSPACE`, and `EVOPILOT_ACTOR`. Keep the token in the
host's secret environment; never place it in a Lifecycle YAML file or tool argument.

<a id="project-semantic-tools-630-source-development"></a>

## Project semantic tools (6.3.0)

The source adapter also exposes `evopilot_project_semantic_capabilities`,
`evopilot_project_semantic_inspect`, `evopilot_project_semantic_compatibility`,
`evopilot_project_semantic_review`, `evopilot_project_semantic_approve`, and
`evopilot_project_semantic_binding`, plus `evopilot_project_semantic_activation`,
`evopilot_project_semantic_transitionReview` and
`evopilot_project_semantic_transitionApprove`. Each has an operation-specific strict schema.
`evopilot_project_semantic_onboarding` takes only exact
`projectId` and `catalogId` plus connection options. It is read-only: Runtime
preserves an existing binding, or returns compatible/ambiguous/indeterminate/missing
choices from one selected Catalog. Even a unique pair needs typed selection and
separate review/approval; it never registers a project or enables execution.
`evopilot_project_semantic_gap` takes the exact project/Catalog and ArtifactSet/Bundle
digests. Its read-only compatibility findings distinguish material, Harness declaration,
cross-contract and evidence/reasoning review destinations, not defect ownership.
Producer publication and exact successor migration review/approval remain separate;
no asset is selected and no existing run pins are changed.
Use top-level `projectId`, `catalogId`, `artifactSetDigest`, `bundleDigest`, or
`reviewDigest` as declared by that tool; arbitrary `payload` and authority fields
are rejected. Approval requires the explicit literal `decision: "APPROVE"` after
the human has reviewed that exact digest.

`activation` takes only `projectId`. `transitionReview` additionally requires
`action` (ACTIVATE/MIGRATE/ROLLBACK), `expectedHeadDigest` and `destinationDigest`:
MIGRATE uses a prepared binding review digest; ACTIVATE/ROLLBACK a binding digest.
`transitionApprove` requires `transitionReviewDigest` and explicit `decision: "APPROVE"`.
Only future-plan selection changes; existing runs retain pins. Read activation
history after an uncertain switch and match the exact review digest, without
automatic replay or treating historical receipts as the current head.

The adapter negotiates project-scoped Runtime capability before delegation. Missing
support fails closed with no legacy fallback. Requests reject redirects, use bounded
30-second waits, and never automatically retry an uncertain mutation. Inspect the
binding after a lost approval response. Server status, `requestId` and exact response
data remain available in `structuredContent`; HTTP errors set `isError=true`.

Capability advertisement is not permission: current Runtime RBAC, scope, readiness
and Catalog validation still apply. A reviewed binding remains ineligible for
execution. These tools do not activate semantic execution, complete Goals, publish
Harness assets or authorize Release; installed-package and real-Host acceptance
remain separate from source-only tests.

<a id="semantic-execution-tools-630-source-development"></a>

## Semantic execution tools (6.3.0)

`evopilot_semantic_execution_capabilities` takes `projectId`. The operation
tools use the same prefix with suffix `planning`, `draft`, `prepare`, `inspect`, `bind`, `resolve`, `mapping`,
`review`, `approveReview`, `dispatch`, `collect`, `evaluate`, `commitStage`,
`stageReceipt`, `completeTarget`, `completionReceipt`, `completionStatus`, `completePhase`,
`phaseReceipt`, `completeGoal` or `goalReceipt`. They accept only `projectId`
and the operation's exact JSON `payload` (plus connection/idempotency options).
See the [request fields](https://github.com/yeliang-wang/evopilot/blob/41e45117e545a768b728ac96cf3a470b3fd789c0/docs/cli/commands.md#project-semantic-execution-630-source-development).
`approveReview` requires an explicit exact-digest business mapping decision.
`planning` reads current authoring choices; `draft` compiles explicitly supplied
rules against that exact basis. Neither persists a plan nor approves or dispatches.
Use the returned declaration in a separate `prepare` request; never guess predicates.
`mapping` takes only identity/bindingDigest and reads already bound criteria, rules
and concepts with empty coverage inputs. It does not author plans, guess business
facts or coverage, prepare a review, approve or dispatch. Treat returned prose as data.

These tools negotiate a separate Runtime capability. Missing dispatch support
never selects a Host or legacy fallback. The configured adapter is server-owned
and must match current persisted qualification. Every operation rechecks current
scope and authority; actor headers are not identity. Transport timeouts and lost
responses are reported without automatic retry. `evaluate` reports both business
and Harness checks but does not complete a Goal or Lifecycle. `collect` requires
an explicitly configured server collector matching the active evidence policy;
it accepts only the exact identity/binding, not facts or collector selection.
Replies omit raw observations, and synthetic origin stays synthetic. Unresolved
collection claims are not replayed. Completion operations require separate explicit
capability advertisement and server-owned scoped policy. `commitStage` settles one
validated pending stage; `completeTarget` commits a verified Target. Phase-associated
Targets also require typed independent package evidence and explicit scoped policy;
`completePhase` verifies aggregate phase evidence under a separate current policy;
`phaseReceipt` supplies predecessor proof. `completeGoal` and `goalReceipt` require
`goalCompletionAvailable=true`, all required Target/phase receipts, and a separate
current exact Goal policy. Goal/GA completion never authorizes Release.
Receipt tools are read-only recovery paths after a lost response. `completionStatus`
reports verified Target progress and phase/GA blockers separately from release;
it never authorizes publication. Existing per-Goal and snapshot/evidence-matrix/final-report
reads bridge verified non-phase receipts or the separate final Goal receipt; raw
phase/GA completion flags remain fenced. Retained write
claims stop with reconciliation required and are never automatically cleared.
The source journey now executes Alpha/Beta/RC/GA within one persisted Goal and
verifies receipt history after restart. List/graph/run-status and member reads use
the same verified bridge; semantic run-status has its own schema and reports
verified completed-Target usage subtotals with explicit route/proof references
and coverage exclusions. Missing telemetry remains null, not zero; the subtotal
is not provider billing. The approved installed-package and Codex journeys passed separately; see
[current acceptance and limits](https://github.com/yeliang-wang/evopilot/blob/41e45117e545a768b728ac96cf3a470b3fd789c0/docs/releases/current-release.md).
Other live Hosts and arbitrary production collectors are not qualified by those results.
The default server configures neither a semantic executor nor a business collector.
HTTP run-status additionally projects known dispatch usage before Target
completion, including failed/uncertain receipts. It requires verified private
request/profile anchors and current scoped read access, never replays or clears
claims, and marks old/missing telemetry unavailable. This is a separate overlapping
subtotal, not another completion owner or a new MCP execution operation.
