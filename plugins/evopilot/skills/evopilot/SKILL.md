---
name: evopilot
description: Use EvoPilot only when the user explicitly selects this plugin and submits an instruction, or invokes $evopilot.
---

Apply this workflow only to the current conversation after that explicit invocation. Selection without submitting a message does not activate it. Do not route ordinary chat through EvoPilot.

1. Call this plugin's `evopilot_workflow_start`, then inspect `evopilot_workflow_status` and report its actual process/readiness state. Initialize and tool listing do not start Runtime. Do not fall back to a global EvoPilot MCP server or CLI.
2. When `READY`, discover the official definitions with `evopilot_workflow_tools`; invoke them only through `evopilot_workflow_call` with `{name, arguments}`. Follow the published [Expert 2.3.1 guidance](../../node_modules/@evopilot/evolution-expert/generated/codex/SKILL.md) for business work. Runtime and the relevant owners retain approval, state and credential authority.
3. When setup is required, respect the returned `nextAction` and use only the permitted setup tools. Never request or expose raw secrets in chat. For unavailable/invalid registration, stop dependent work and report the returned recovery action. For an unknown mutation outcome, inspect owner state and retained receipts without replaying the mutation.

The existing configured macOS Runtime 6.3.3 is a shared service that persists and is reused across chats; workflow activation is conversation-scoped. This is opt-in routing, not tamper-proof Host enforcement. The independently versioned plugin is 0.1.0. Harness authoring, fresh whole-series installation/upgrades and private executor/collector distribution are deferred. This first release does not establish full original R3 completion; Desktop acceptance awaits operator verification.
