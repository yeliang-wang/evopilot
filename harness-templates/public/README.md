# Public Harness Templates

This directory contains human-readable HarnessTemplate knowledge packs for EvoPilot administrators and AI agents.

EvoPilot automatically matches one published template when a project is onboarded and a goal loop target is submitted. Normal project operators do not choose a template manually. The template pack directory is an administrator maintenance surface: edit the files, validate the pack, then publish a version into the EvoPilot control plane.

## Pack Shape

Each template pack uses the same minimal directory shape:

```text
<template-id>/
  README.md
  template.yaml
  CHANGELOG.md
  examples/
    default-project-profile.yaml
```

`README.md` is for humans and AI agents. `template.yaml` is the structured server-authoritative source used for validation, versioning, digesting, and publishing. `CHANGELOG.md` explains version movement in normal text. `examples/` gives LLMs and administrators a concrete ProjectHarnessProfile shape.

## Administrator Commands

```bash
evopilot harness template pack list harness-templates/public --json
evopilot harness template pack validate harness-templates/public/python-enterprise-harness --json
evopilot harness template pack publish harness-templates/public/python-enterprise-harness --json
```

Pack commands are intentionally small. Diff and review happen through Git and the readable files in this directory; EvoPilot Server remains authoritative for validation, version, digest, RBAC, persistence, and audit.
