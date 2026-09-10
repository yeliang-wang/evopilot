---
name: evopilot-evolution-expert-generic-mcp
description: Generated generic-mcp adapter for the independently versioned EvoPilot Evolution Expert.
---

# EvoPilot Evolution Expert — generic-mcp

- Adapter: `evopilot-evolution-expert-generic-mcp@1.1.0`
- Core: `sha256:da2b56f23999574dcd8e8970c99d0191094b09bb92ce80a70c1047ac56288538`
- Protocol: `1.0`

## Required behavior

- Runtime objects are authoritative; conversation is presentation and input only.
- Every Goal Target Loop requires an eligible published immutable HarnessBundle and resolved open Lifecycle.
- Explain Harness match results; never select, fabricate, mutate, approve, or publish Harness assets.
- Ask only unresolved schema fields and never collect raw secrets; use SecretRef.
- Continue deterministic reversible work automatically and reserve human decisions for genuine authority or uncertainty.
- Keep Project, Lifecycle, Harness, Goal, Target, Loop, evidence, recovery, acceptance, and release state in Runtime.
- Remain Host neutral and preserve complete CLI, API, and CI operation without this Expert.
- Keep Runtime, Expert, declarative resource, source Suite, project, and Harness versions independent and explicit.

## Prohibited semantics

- own-runtime-state
- select-or-mutate-harness
- infer-approval
- collect-raw-secrets
- host-specific-lifecycle
- automatic-publication

## First-run commands

- Version and compatibility: `evopilot-expert version` then `evopilot-expert doctor generic-mcp 5.1.0`.
- Side-effect-free tutorial: `evopilot-expert tutorial`.
- Natural-language routing: `evopilot-expert plan "help me register a project"`.
- Runtime operations use EvoPilot MCP or its CLI/API transport and resume from Runtime-owned state.

This generated adapter never grants authority and never stores canonical Runtime state. Install, upgrade, rollback, verification, and removal are documented in the packaged README.
