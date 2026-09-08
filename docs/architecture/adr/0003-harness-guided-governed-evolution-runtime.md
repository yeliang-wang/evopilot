# ADR 0003: Harness-Guided Governed Evolution Runtime

Status: Accepted for EvoPilot v5.0.0 implementation; not released.

## Decision

EvoPilot v5 makes `ProjectDefinition + GoalTarget -> published HarnessProfile -> immutable HarnessBundle -> open Lifecycle -> Goal Target Loop` the mandatory runtime path. Harness obligations are a lower bound: a Lifecycle may add evidence, validators, and constraints, but cannot remove or weaken Harness requirements or request capability/permission outside the Bundle.

Project variability is represented by immutable declarative Project Definitions. Runtime code must not branch on DataRig, EvoPilot, evopilot-harness, Codex, or WorkBuddy names. The three projects are reference instances, not special domains.

The execution binding pins Project, GoalTarget, Catalog, Profile, Bundle and components, Lifecycle composition, policy, provider, environment, Agent Host, execution runtime, authority, and evidence digests. Start, resume, retry, and every Loop iteration revalidate that closure.

Recovery is deterministic and bounded. Reversible mechanics and safe identical-input retries continue automatically. Unknown but potentially reusable safe behavior creates a complete Automation Rule proposal; one exact human decision may activate it for future occurrences. Irreversible authority, ambiguous business choices, and uncertain external mutation outcomes remain human boundaries.

The Evolution Expert is an independently versioned, optional package. One Core generates Codex, WorkBuddy, generic Agent, and generic MCP adapters. It presents Runtime state and collects schema inputs; it never owns state, selects or mutates Harness assets, infers approval, stores raw secrets, or publishes.

## Consequences

- EvoPilot remains a read-only Harness consumer; `evopilot-harness` remains the producer.
- Headless CLI/API/CI operation remains complete without the Expert.
- Agent Host and execution runtime are separate bound objects.
- v4 Alpha/Beta/RC/GA remains only an explicit compatibility Lifecycle.
- Legacy EvoPilot and DataRig Codex Suites have no Runtime fallback in v5. Before release they remain active, independently owned, and independently evolving; exact read-only snapshots provide comparison evidence, while isolated Candidate environments prove Runtime independence with both Suites absent. Any real Cutover occurs only after public v5 installation verification under a separate Target and explicit human authorization.
