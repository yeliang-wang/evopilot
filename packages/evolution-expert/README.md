# EvoPilot Evolution Expert

`@evopilot/evolution-expert` 1.0.1 is the independently versioned,
Agent-neutral interactive guide for EvoPilot Runtime 5.x. It helps an ordinary
user discover and declare a project, understand Runtime-produced Harness
matching and Lifecycle composition, operate a Goal Target Loop, follow
automatic recovery, and inspect evidence and readiness.

The Expert is not the Runtime and is not a Harness producer. It owns no
canonical state, credentials, approval identity, Harness choice, recovery
policy, acceptance verdict, publication, or Release authority. If it is absent
or incompatible, the complete Runtime remains available through CLI, API,
MCP, and CI.

## Install and verify

```bash
npm install --global @evopilot/evolution-expert@1.0.1
evopilot-expert version
evopilot-expert doctor codex 5.0.1
evopilot-expert tutorial
```

For WorkBuddy, replace `codex` with `workbuddy`. `doctor` verifies the package
version, one Core digest, protocol compatibility, Adapter digest, and required
Host capabilities without contacting a project or causing external effects.

## Use

```bash
evopilot-expert plan "help me register an unknown project"
evopilot-expert plan "explain the selected Harness and Lifecycle plan"
evopilot-expert plan "why did recovery stop?"
evopilot-expert render runtime-interaction.json
```

Project onboarding begins with Runtime discovery:

```bash
evopilot project-definition discover --file detected-facts.yaml
```

The Expert renders only the unresolved typed questions returned by Runtime.
Secret values are never entered; declarations contain `secret://`, `env://`,
or `vault://` references. Registration, adjustment, semantic diff, activation,
and rollback remain Runtime operations.

## Upgrade, rollback, and remove

```bash
npm install --global @evopilot/evolution-expert@1.0.1
evopilot-expert doctor codex 5.0.1

npm install --global @evopilot/evolution-expert@1.0.0
evopilot-expert doctor codex 5.0.1

npm uninstall --global @evopilot/evolution-expert
evopilot --version
```

Upgrading, rolling back, or removing the Expert must not change Runtime bytes
or durable Runtime state. After a Host transfer or restart, inspect the run in
Runtime and render that current object; never restore state from Expert prose.
A clean reinstall repeats install plus `doctor` and then resumes from Runtime.

## Host adapters

The portable Skill is in `skill/SKILL.md`. Codex, WorkBuddy, generic Agent, and
generic MCP projections are generated under `generated/` from the same Core.
A new Host uses `createExpertAdapter(host)`, declares the three required Host
capabilities, and passes `assertExpertAdapterConformance`; it does not require
an Engine or Expert Core source branch.

See the repository guides for the [Expert workflow](../../docs/guides/evolution-expert.md),
[project definitions](../../docs/guides/project-definitions.md), and
[Harness-guided architecture](../../docs/architecture/harness-guided-governed-evolution-runtime.md).
