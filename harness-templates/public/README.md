# Public Harness Templates

This directory contains human-readable HarnessTemplate knowledge packs for EvoPilot administrators and AI agents.

EvoPilot automatically matches one published template when a project is onboarded and a goal loop target is submitted. Normal project operators do not choose a template manually. The template pack directory is an administrator maintenance surface: edit the files, validate the pack, then publish a version into the EvoPilot control plane.

## v2 Template Model

EvoPilot v2 adds domain-first templates alongside the existing runtime/language templates. A domain template defines the product harness first, then records compatibility, architecture, and implementation runtime profiles.

Current domain templates:

- `database-product-harness@2.0.0` for self-developed database products. PostgreSQL, MySQL, and similar systems are compatibility references or differential oracles, not the default evolution target.
- `api-gateway-harness@2.0.0` for gateway, ingress, traffic proxy, and service-mesh gateway products.
- `enterprise-management-software-harness@2.0.0` for CRM, ERP, workflow, and enterprise management products.

The existing Python, Java, Node, Go, observability, and generic management templates remain useful runtime or broad software-type baselines. Automatic matching gives strong domain signals priority and uses language/runtime signals as a secondary layer.

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

## Source-Driven Evolution

When a template should be upgraded from reviewable source material rather than direct file editing, use the server-governed evolution lifecycle:

```bash
evopilot harness template evolution create \
  --base-template python-enterprise-harness \
  --target-version 1.1.1 \
  --intent "Add stronger exception tracking, observability, and AI troubleshooting metadata." \
  --source github=fastapi/fastapi#master \
  --source url=https://opentelemetry.io/docs/languages/python/ \
  --source runtime-evidence=release-evidence-2026-08-python \
  --file ./workspace-observability-notes.md \
  --note "Require requestId/traceId/errorCode/nextAction in error logs." \
  --json
evopilot harness template evolution advance <evolution-id> --json
evopilot harness template evolution advance <evolution-id> --json
evopilot harness template evolution advance <evolution-id> --llm-profile platform-harness-llm --json
```

Stop at `REVIEW_REQUIRED`, inspect the generated draft pack, validation, diff, and source coverage, then publish only after explicit administrator approval:

```bash
evopilot harness template evolution approve <evolution-id> --confirmed-by <admin> --confirmation <text> --json
evopilot harness template evolution publish <evolution-id> --json
evopilot harness template evolution impact <evolution-id> --refresh --json
```

The lifecycle stores evidence under `<dataRoot>/harness-template-evolutions/<evolutionId>/` and publishes a normal versioned `HarnessTemplate`. Existing active project profiles are not silently rewritten.
