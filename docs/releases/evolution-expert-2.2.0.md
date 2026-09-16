# Evolution Expert 2.2.0 — First-Run LLM Setup

Status: implementation under an approved Target; Candidate, acceptance, Host installation, Secret operation, publication, and Release remain unauthorized.

Expert 2.2.0 adds the MCP-first setup, status, degradation, repair, and upgrade-guidance protocol for Runtime 6.2.0. It distinguishes the Host LLM, Runtime governed LLM Profile, and external Agent Model; refuses raw credentials in conversation; requires Host-native secure input; and blocks ordinary project workflows until Runtime reports `READY`.

The Expert remains a guide and presenter. Runtime owns durable state and authorization; the Host owns secure input; the model provider owns the selected Runtime model; and no conversational text becomes approval.
