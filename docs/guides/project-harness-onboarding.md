# Project Harness Onboarding

Use this flow after a project is registered and before governed goal execution.

## 1. Inspect Templates

```bash
evopilot harness template list --json
evopilot harness template inspect python-enterprise-harness --json
```

`python-enterprise-harness` is the built-in platform baseline for enterprise Python projects. It defines defaults for capabilities, runtime command groups, validation, evidence, failure handling, diagnostics, observability, governance, phase mapping, and LLM draft policy.

Administrators can publish additional template ids or versions for other languages, architecture styles, or software types. Template updates are versioned control-plane changes with changelog management:

```bash
evopilot harness template apply \
  --file python-enterprise-harness-1.1.0.yaml \
  --changelog "Add stricter runtime and observability defaults." \
  --json
```

Publishing the same `id@version` again is rejected unless `--force` is supplied. Existing active project profiles keep their previous `templateRef`; use `harness profile generate` or `harness profile upgrade` to draft a reviewed project-level revision from a newer template.

## 2. Generate A Draft

```bash
evopilot harness profile generate \
  --project my-agent \
  --from-template python-enterprise-harness \
  --goal-loop-target "Define the Python enterprise harness for this project" \
  --llm-profile my-agent-llm \
  --json
```

The generated version is `DRAFT`. It is not active and does not control goal planning yet.

For second onboarding or project evolution, EvoPilot reads the previous active profile and produces a diff-aware draft instead of creating an unrelated profile.

## 3. Review Or Edit YAML

You can export or write a YAML source profile and then validate/apply it:

```yaml
schema: evopilot-project-harness-profile/v1
profileId: default
projectId: my-agent
name: My Agent Python Harness
template:
  templateId: python-enterprise-harness
runtime:
  language: python
  installCommands:
    - pip install -e .
  lintCommands:
    - ruff check .
  typecheckCommands:
    - mypy .
  unitCommands:
    - pytest
  smokeCommands:
    - pytest -q tests
validation:
  commands:
    - installCommands
    - lintCommands
    - typecheckCommands
    - unitCommands
    - smokeCommands
evidence:
  requiredArtifacts:
    - target-evidence-package
    - phase-package
    - goal-completion-report
governance:
  tenantWorkspaceScopeRequired: true
  targetPlanRequiresApproval: true
  profileActivationRequiresApproval: true
  promotionRequiresReleaseDecision: true
  sourceClosureRequired: true
  noSilentProfileMutation: true
```

Repository files such as `.evopilot/project.harness.yaml` are optional import sources. The server-side control plane remains authoritative.

## 4. Validate, Diff, Apply

```bash
evopilot harness profile validate --project my-agent --file profile.yaml --json
evopilot harness profile diff --project my-agent --file profile.yaml --json
evopilot harness profile apply --project my-agent --file profile.yaml --json
```

`validate` does not write. `apply` writes a new `VALIDATED` version when checks pass.

## 5. Activate

```bash
evopilot harness profile activate default --project my-agent --version 1 --json
```

Activation requires admin permission. It makes exactly one version active for that project/profile and supersedes the previous active version.

## 6. Plan Goals

```bash
evopilot target plan \
  --project my-agent \
  --objective "Ship the first production-ready Python agent workflow" \
  --json
```

The generated plan includes `phasePlan.projectHarness` or `plan.projectHarness` with the active profile version and digest. Review that binding before approving the plan.

## 7. Evolve The Harness

When a goal reveals missing harness coverage, create a new draft or upgrade candidate:

```bash
evopilot harness profile generate \
  --project my-agent \
  --goal-loop-target "Add performance diagnostics and rollout monitoring to the project harness" \
  --json

evopilot harness profile upgrade default \
  --project my-agent \
  --from-template python-enterprise-harness \
  --from-template-version 1.0.0 \
  --json
```

Do not edit the active profile silently. Create a new version, validate, diff, and activate after review.
