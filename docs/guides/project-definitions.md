# Project Definitions

`evopilot-evolution-project-definition/v1` is the DDD aggregate for project variation. It declares source provider, ecosystem, delivery model, environments, policy/Lifecycle references, SecretRefs, preferred Hosts and runtimes, and evidence sources.

Definitions are immutable by `(id, version)`. Adjustment creates a new version. YAML is the human editing form; Runtime normalizes it and computes a canonical digest at registration. Credentials must be references such as `secret://github/project`, never values.

Start with [the generic template](../../examples/projects/new-project.yaml) or inspect the three reference instances in the same directory. None receives special Runtime behavior.
