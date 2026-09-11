# Migrating To Runtime 6

Runtime 6 separates project Pipeline evolution from Runtime releases. A project becomes an `EvolutionProjectDefinition` plus independently versioned Lifecycle, policy, provider, environment, SecretRef, authority, and Agent Runtime resources.

For each project:

1. discover facts and unresolved inputs through Evolution Expert over MCP;
2. register a human-readable Lifecycle revision without activating it;
3. inspect semantic diff, dependencies, authority, and compatibility;
4. activate the exact revision for future planning;
5. match one published HarnessBundle and run an isolated Goal Target Loop;
6. verify rollback and restart recovery.

EvoPilot Codex Suite 3.2.1 and DataRig Codex Suite 2.1.5 remain frozen reference fixtures. Runtime does not load, invoke, or synchronize them. Their real installed copies remain active and untouched until Runtime 6 and Expert 2 pass public installation validation and a separate Cutover Target receives explicit authorization. This migration document does not authorize Cutover.
