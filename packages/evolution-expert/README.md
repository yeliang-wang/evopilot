# EvoPilot Evolution Expert

`@evopilot/evolution-expert` is an independently versioned, Agent-neutral
interactive guide for EvoPilot Runtime. It helps ordinary users learn the
product, register projects, understand published Harness matching, operate
Lifecycle-driven Goal Target Loops, follow recovery, and inspect evidence.

The Expert is not EvoPilot Runtime and is not a Harness producer. It never owns
project state, Harness selection, approval identity, credentials, acceptance,
publication, or Release authority. CLI, API, and CI remain complete when the
Expert is absent.

```bash
npm install --global @evopilot/evolution-expert@1.0.0
evopilot-expert manifest
evopilot-expert adapter codex
evopilot-expert compatibility codex 5.0.0
```

The portable Skill is in `skill/SKILL.md`. Host-specific adapter manifests and
Skill projections are generated from one Core by the package build and are
written under `generated/`.
