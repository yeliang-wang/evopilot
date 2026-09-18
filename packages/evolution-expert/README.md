# EvoPilot Evolution Expert

`@evopilot/evolution-expert` 2.2.1 is the independently versioned,
Agent-neutral interactive guide for EvoPilot Runtime 6.2.x. It helps an ordinary
user discover and declare a project, understand Runtime-produced Harness
matching and Lifecycle composition, operate a Goal Target Loop, follow
automatic recovery, inspect evidence and readiness, and understand resource
versions, capability migration, controlled Pipeline observations and successors,
Champion/Challenger evidence, policy-bounded activation, monitoring, deterministic
rollback, generic-primitive gaps, shadow validation, and Cutover readiness.

The Expert is not the Runtime and is not a Harness producer. It owns no
canonical state, credentials, approval identity, Harness choice, recovery
policy, acceptance verdict, publication, or Release authority. Ordinary-human
operation is Expert-over-MCP only. If it is absent or incompatible,
administrators and machines can diagnose or recover Runtime through MCP, CLI,
API, and CI without creating a silent ordinary-human fallback.

## Install and verify

Version 2.2.1 is currently a development Target, not an available public release.
The following installation examples apply only after separate Release authorization
and verified npm publication. Pre-release acceptance installs the exact approved
Candidate tarball instead; a source checkout is not acceptance evidence.

```bash
npm install --global @evopilot/evolution-expert@2.2.1
evopilot-expert version
evopilot-expert doctor codex 6.2.0
evopilot-expert tutorial
evopilot-expert versions
evopilot-expert migration
```

For Claude Code or WorkBuddy, replace `codex` with `claude-code` or
`workbuddy`; `generic-agent` and `generic-mcp` are also packaged adapters.
`doctor` and `compatibility` check the declared package/adapter contract, using
Runtime `6.2.0` when its version is omitted. `READY` / `CONFORMANT` means only
that declaration is compatible: neither command observes Host capabilities,
connects to Runtime, proves Runtime LLM readiness, or grants authority.
Actual Host qualification requires independently observed capabilities and
the real-Host acceptance gate. Unsupported Runtime versions, malformed stable
versions and unknown packaged Hosts return a nonzero exit status.

## Use

```bash
evopilot-expert plan "help me register an unknown project"
evopilot-expert plan "explain the selected Harness and Lifecycle plan"
evopilot-expert plan "why did recovery stop?"
evopilot-expert plan "record this Pipeline observation and show the immutable successor"
evopilot-expert plan "compare champion and challenger without mixing mismatched evidence"
evopilot-expert plan "can the active policy safely activate this successor?"
evopilot-expert render runtime-interaction.json
```

Project onboarding begins with Runtime discovery through MCP. The Expert
renders only the unresolved typed questions returned by Runtime.
Secret values are never entered; declarations contain `secret://`, `env://`,
or `vault://` references. Registration, adjustment, semantic diff, activation,
and rollback remain Runtime operations.

On first run, ask the Expert to inspect Runtime LLM readiness. Runtime stays
setup-only until a user-selected workspace Profile has an active SecretRef, a
fresh live preflight, and an explicit digest-bound workspace-default binding.
The Expert refuses raw credentials in conversation and delegates credential
entry to a Host-native secure-input capability.

## Upgrade, rollback, and remove

```bash
npm install --global @evopilot/evolution-expert@2.2.1
evopilot-expert doctor codex 6.2.0

npm install --global @evopilot/evolution-expert@1.0.1
evopilot-expert doctor codex 5.0.1

npm uninstall --global @evopilot/evolution-expert
evopilot --version
```

Upgrading, rolling back, or removing the Expert must not change Runtime bytes
or durable Runtime state. After a Host transfer or restart, inspect the run in
Runtime and render that current object; never restore state from Expert prose.
A clean reinstall repeats install plus `doctor` and then resumes from Runtime.

## Host adapters

The portable Skill is in `skill/SKILL.md`. Codex, Claude Code, WorkBuddy,
generic Agent, and generic MCP projections are generated under `generated/`
from the same Core and include a `bundle.json` lifecycle contract. A new Host
uses `createExpertAdapter(host)`, declares the five required Host
capabilities, and passes `assertExpertAdapterConformance`; it does not require
an Engine or Expert Core source branch.

See the repository guides for the [Expert workflow](../../docs/guides/evolution-expert.md),
[project definitions](../../docs/guides/project-definitions.md), and
[Harness-guided architecture](../../docs/architecture/harness-guided-governed-evolution-runtime.md).
