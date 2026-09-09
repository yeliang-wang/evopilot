# EvoPilot Evolution Expert v1.0.0

EvoPilot Evolution Expert v1.0.0 is the first independently versioned,
Agent-neutral guided interaction package for EvoPilot Runtime 5.x.

## What is included

- A portable Skill that guides installation, tutorials, project registration,
  Harness-guided Goal Target Loops, recovery, evidence, acceptance, and release
  boundaries.
- Generated Codex, WorkBuddy, generic Agent, and generic MCP adapters that bind
  one exact Expert Core digest and add no Host-specific product semantics.
- Version-aware compatibility checks for the Runtime protocol and required Host
  capabilities.
- Side-effect-free help and tutorial flows for first-time users.

## Authority and state boundary

The Expert presents Runtime-owned objects and invokes declared Runtime
transports. It does not own canonical Project, Harness, Lifecycle, Goal, Target,
Loop, evidence, recovery, approval, credential, or release state. Conversation
does not grant authority, and the Expert cannot select or mutate Harness assets.

## Compatibility

- Expert: `@evopilot/evolution-expert@1.0.0`
- Runtime contract dependency: `@evopilot/contracts@5.0.0`
- Supported Runtime range: `>=5.0.0 <6.0.0`
- Codex, WorkBuddy, generic Agent, and generic MCP adapters share the same Core
  and protocol semantics.

Runtime CLI, API, MCP, and CI operation remains complete when the Expert is
absent or incompatible.

## Accepted release bytes

This Release promotes the exact accepted Candidate from GitHub Actions run
`34200832083`, source commit
`f157bc385acbb523f8b74a3a183f306f06cc834b`, without rebuilding or repacking.
The Candidate handoff digest is
`sha256:8afdf580a6a26596956994a9e8ffae1e7b26944e35b10b2b6ec07872297898cf`.
The joint Runtime and Expert acceptance aggregate is
`sha256:b5c2a54eae3e30971f3146454beb8bfc9ac8b1b70a4a325fb963d914e8f4e80e`.

Acceptance completed all 34 Expert requirements: 18 current criteria, 8
inherited criteria, and 8 end-to-end journeys. The joint campaign also completed
the 5400-second isolated active soak with 90 checks and zero failures.

## Installation and verification

```bash
npm install --save-dev @evopilot/evolution-expert@1.0.0
npx evopilot-expert manifest
npx evopilot-expert adapter codex
npx evopilot-expert compatibility codex 5.0.0
```

The public package verification checks npm integrity, provenance, Registry
signatures, a fresh empty-project installation, CLI identity, portable Skill
presence, Codex adapter binding, Expert Core digest, and Runtime 5.0.0
compatibility.

## Upgrade, rollback, and uninstall

Expert upgrades and rollback are independent of Runtime releases but must remain
inside the declared Runtime compatibility range. Roll back by installing a
previous verified Expert version without changing Runtime state. Uninstalling
the Expert removes only the guidance package; Runtime-owned state and headless
operation remain intact.

Legacy EvoPilot and DataRig Codex Suite cutover is not part of this Release. Any
disablement, archival, default switch, uninstall, or retirement requires a
separate post-v5 Cutover Target and explicit authorization.
