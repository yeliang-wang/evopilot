# ADR 0004: Executable v5 Completion Recovery

Status: Accepted for implementation

## Context

Runtime 5.0.0 and Expert 1.0.0 were published before every item in the
original v5 scheme had criterion-specific evidence. Several capabilities also
existed as types or helpers without governing the actual Lifecycle execution
path. Version presence and aggregate acceptance therefore could not establish
scheme completion.

## Decision

Runtime 5.0.1 makes `HarnessExecutionBinding` an executed invariant for every
Goal Target Loop start, resume, retry, and iteration. The binding closes over
the immutable Project Definition, GoalTarget, Registry/Catalog,
Profile/Bundle/Components, Lifecycle, Policy, Provider, Environment, Host,
Runtime, authority, and evidence identities. Drift fails before execution.

Lifecycle owns orchestration state; Governed Evolution verifies the binding
and classifies recovery. Safe deterministic failures may repair, retry,
reconcile a receipt, restart, or resume within explicit bounds. Unknown safe
classes produce a complete Automation Rule proposal; one exact human decision
activates a scoped versioned rule. Repeated learned-rule failure suspends the
rule. Authority-required, irreversible, and uncertain mutations remain human
boundaries.

Project variation remains declarative through one DDD aggregate and
project-owned resources. No repository name creates an Engine branch.
Evolution Expert remains separately versioned and stateless. Host adapters are
generated projections of one Core and require no Engine modification.

A digest-bound completion contract maps every original requirement to current
criteria, deliverables, independent validators, evidence, and terminal E2E.
Completion requires zero failed, pending, stale, warning, generic, or unmapped
criteria for one exact Candidate pair plus impact closure and NO_REGRESSION.

## Consequences

- Public 5.0.0/1.0.0 artifacts remain historical facts, not completion proof.
- Local implementation validation cannot close Candidate or Host criteria.
- Existing EvoPilot and DataRig Codex Suites remain active and independently
  evolving; Cutover stays a post-release, separately authorized operation.
- `evopilot-harness` remains the independent Harness producer and is not
  modified by this decision.
