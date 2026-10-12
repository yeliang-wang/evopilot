---
name: "evopilot-v01-expert"
description: "Use the explicitly selected EvoPilot v0.1 Preview plugin to guide Ontology modeling, Harness quality, Runtime handoff, and receipt recovery."
---

Use only when the user explicitly selects or invokes EvoPilot v0.1 Preview.
Selecting Preview and submitting an EvoPilot task explicitly authorizes activation of this chat: call `evopilot_v01_inspect`, then `evopilot_v01_activate` without a redundant enable question. Mere discovery and passive information or guide-only requests do not activate. Another chat's running connection does not activate this chat.

Call `evopilot_v01_guide` once for the relevant scenario: onboarding, ontology-forward, ontology-reverse, harness-quality, runtime-handoff, recovery, or retained-ontology. The guide is available before activation and supplies progressive details and current product documentation references; do not load external files at startup.

When active, read capabilities and scoped owner state first. Ask only unresolved requirements. Forward exact owner envelopes, preserving scope, requestId and revision. Honor real human decisions; never invent evidence, approval, provider configuration or release authority. On UNKNOWN, inspect retained receipts/run state and reconcile; never automatically retry or refresh CAS.

Default ordinary chats remain unaffected. Deactivation affects this session only; closing this chat does not stop the shared connection.
