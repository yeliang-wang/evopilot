# EvoPilot ProofOps Target Loop Mode

## Status

Proposed for implementation.

## Context

EvoPilot owns the runtime-state-driven DevOps lifecycle control plane: project registration, runtime evidence, LLM-driven evolution, code upgrade execution, CI/CD, release decisions, approval, audit, and deployment lifecycle.

ProofOps should not become a second AMP control plane with duplicate API, worker, LLM, approval, audit, and release execution surfaces. Its durable value is the target-driven loop contract for release and maturity goals: target plan, evidence matrix, decision chain, non-mock evidence rules, and final report shape.

## Decision

EvoPilot absorbs the ProofOps AMP direction as an internal target-loop mode. ProofOps remains a Core contract library and lightweight distribution surface.

The product boundary is:

- EvoPilot is the platform.
- ProofOps Core is the release/maturity target-loop contract.
- EvoPilot ProofOps Mode is the platform capability that executes that contract.

## Runtime Flow

```text
Codex / IM / API
  -> EvoPilot Conversation Command API or Target Loop API
  -> ProofOps-compatible target plan
  -> target plan approval
  -> EvoPilot release evidence generation
  -> ProofOps-compatible evidence matrix and decision chain
  -> blocker route to EvoPilot remediation when needed
  -> final report
  -> approved and executed release action
  -> audit
```

## API Surface

```http
POST /api/v1/target-loops
POST /api/v1/target-loops/{loopId}/approve-plan
POST /api/v1/target-loops/{loopId}/resume
GET  /api/v1/target-loops/{loopId}/final-report
POST /api/v1/target-loops/{loopId}/route-remediation
POST /api/v1/target-loops/{loopId}/release-actions/{action}/approve
POST /api/v1/target-loops/{loopId}/release-actions/{action}/execute
POST /api/v1/conversations/commands
```

## Ownership Rules

- EvoPilot owns execution, state, LLM gateway, conversation gateway, code upgrade, CI/CD, approval, audit, and release actions.
- ProofOps Core owns target presets, evidence-matrix vocabulary, release-decision vocabulary, non-production evidence rejection rules, and final-report compatibility.
- Release actions are part of the target loop, but require approval after a `GO` decision and explicit execution after approval.
- Codex, Feishu, WeCom, and future IM adapters should forward parsed user commands to `/api/v1/conversations/commands`.

## Validation

`npm run proofops-mode:check` verifies the minimal product slice:

- create target loop
- block execution before target-plan approval
- approve target plan
- execute target loop
- generate `proofops-final-release-report/v1`
- route blockers to EvoPilot remediation
- reject release action execution before approval
- approve and execute release actions after `GO`
- create target loops through the conversation command API
