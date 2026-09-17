# Evolution Expert 2.2.0 — First-Run LLM Setup

Status: accepted release scope. Public release evidence is recorded in the governed Evolution Expert 2.2.0 Target after publication and independent public readback.

Expert 2.2.0 adds the MCP-first setup, status, degradation, repair, and upgrade-guidance protocol for Runtime 6.2.0. It distinguishes the Host LLM, Runtime governed LLM Profile, and external Agent Model; refuses raw credentials in conversation; requires Host-native secure input; and blocks ordinary project workflows until Runtime reports `READY`.

The Expert remains a guide and presenter. Runtime owns durable state and authorization; the Host owns secure input; the model provider owns the selected Runtime model; no conversational text becomes approval; and no Host LLM or Agent Model becomes an implicit Runtime LLM profile.
