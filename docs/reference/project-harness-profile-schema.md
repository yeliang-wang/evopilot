# Project Harness Profile Schema

This reference documents the YAML/JSON source profile accepted by the CLI and API. The server compiles it with a `HarnessTemplate` into an active project control-plane profile.

## HarnessTemplate Source

EvoPilot ships multiple built-in template harness types. Fresh installs expose `python-enterprise-harness`, `java-ddd-service-harness`, `node-saas-control-plane-harness`, `go-middleware-harness`, `observability-apm-harness`, and `generic-management-software-harness` through `evopilot harness template list --json`.

Administrators publish template harness versions as YAML or JSON through `evopilot harness template apply --file <template.yaml> --changelog <text> --json`. The file is a full template definition; different languages, architecture styles, or software types should use distinct template ids or versions. Markdown can document a template, but Markdown is not the authoritative template format because the server must parse, validate, merge, version, and digest structured data.

```yaml
schema: evopilot-harness-template/v1
id: python-enterprise-harness
version: 1.1.0
name: Python Enterprise Harness
description: Python enterprise harness baseline.
scope: platform
languageFamily: python
sourceReferences:
  - name: FastAPI
    url: https://github.com/fastapi/fastapi
    category: github
    rationale: Python API service conventions and OpenAPI ergonomics.
  - name: Enterprise Python service practice
    category: engineering-practice
    rationale: Typed runtime commands, dependency locks, command evidence, and health/readiness controls.
capabilities:
  - id: python-runtime
    name: Python runtime harness
    boundary: Install, lint, typecheck, unit, smoke, and service readiness commands are declared.
    requiredEvidence:
      - install-output
      - unit-output
runtimePatterns:
  language: python
validationBaseline:
  requiredCommandGroups:
    - install
    - unit
evidenceContract:
  requiredArtifacts:
    - target-evidence-package
failureTaxonomy:
  categories:
    - dependency
    - test
diagnosticsBaseline:
  requiredSignals:
    - failing-command
observabilityBaseline:
  requiredSignals:
    - health
governanceRules:
  tenantWorkspaceScopeRequired: true
  profileActivationRequiresApproval: true
  cannotWeaken:
    - tenantWorkspaceScopeRequired
    - profileActivationRequiresApproval
phaseMapping:
  alpha:
    - python-runtime
  beta:
    - python-runtime
  rc:
    - python-runtime
  ga:
    - python-runtime
llmDraftPolicy:
  enabled: true
  generatedStatus: DRAFT
  requireUserReview: true
changelog:
  - version: 1.1.0
    summary: Add stricter runtime and observability defaults.
    changes:
      - Add stricter runtime and observability defaults.
```

`id` and `version` are required. The server computes `digest`; callers should not hand-edit it. A changelog entry for the current version is required, either in the file or through CLI `--changelog`. Reusing the same `id@version` requires `--force`; normal updates should publish a new version.

## Source Profile

```yaml
schema: evopilot-project-harness-profile/v1
profileId: default
projectId: my-agent
tenantId: tenant-production
workspaceId: workspace-agent-products
name: My Agent Python Harness
description: Project-level harness control-plane profile.
template:
  templateId: python-enterprise-harness
  version: 1.0.0
capabilities:
  - id: python-runtime
    name: Python runtime harness
    boundary: Install, lint, typecheck, unit, smoke, and service readiness commands are declared.
    requiredEvidence:
      - install-output
      - unit-output
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
  requireExitCode: true
  requireCommandOutput: true
evidence:
  format: json
  requiredArtifacts:
    - target-evidence-package
    - phase-package
    - goal-completion-report
  requiredEvidence:
    - command-output
    - exit-code
    - ci-status-or-local-proof
rules:
  noSilentActiveProfileMutation: true
failureHandling:
  categories:
    - dependency
    - test
    - deploy
    - observability
    - governance
  requiredFields:
    - failingCommand
    - exitCode
    - rootCauseHypothesis
    - owner
    - nextAction
diagnostics:
  requiredSignals:
    - failing-command
    - exit-code
    - stack-trace-or-log
    - changed-files
observability:
  requiredSignals:
    - health
    - readiness
    - logs
    - metrics
    - traces
    - alerts
  healthCheck: /health
governance:
  tenantWorkspaceScopeRequired: true
  targetPlanRequiresApproval: true
  profileActivationRequiresApproval: true
  promotionRequiresReleaseDecision: true
  sourceClosureRequired: true
  noSilentProfileMutation: true
phaseMapping:
  alpha:
    - source-boundary
    - python-runtime
  beta:
    - test-and-quality
    - observability
  rc:
    - observability
    - release-governance
  ga:
    - release-governance
llmDraftPolicy:
  requireUserReview: true
  allowedToSilentlyModifyActiveProfile: false
metadata:
  owner: team-agent-platform
```

## Required Fields

| Field | Required | Notes |
|---|---:|---|
| `schema` | yes | Must be `evopilot-project-harness-profile/v1`. |
| `profileId` | no | Defaults to `default`. |
| `projectId` | yes after normalization | Must match the API route project. |
| `tenantId` / `workspaceId` | no | Defaults to the persisted project scope; if supplied, must match. |
| `template.templateId` | no | Defaults to `python-enterprise-harness`. |
| `runtime` / `validation` | yes by validation | Must expose command evidence through runtime command arrays or validation command groups. |
| `evidence.requiredArtifacts` | yes by validation | Must include artifact expectations such as target and phase packages. |
| `governance` | yes by validation | Cannot weaken mandatory template gates. |

## Compiled Profile

The server stores each version as `evopilot-project-harness-profile-version/v1`:

```json
{
  "schema": "evopilot-project-harness-profile-version/v1",
  "tenantId": "tenant-production",
  "workspaceId": "workspace-agent-products",
  "projectId": "my-agent",
  "profileId": "default",
  "version": 1,
  "status": "ACTIVE",
  "sourceFormat": "yaml",
  "sourceContent": {},
  "sourceDigest": "sha256:...",
  "compiledContent": {},
  "compiledDigest": "sha256:...",
  "templateRef": {
    "templateId": "python-enterprise-harness",
    "version": "1.0.0",
    "digest": "sha256:..."
  },
  "validation": {},
  "generatedBy": {
    "mode": "user",
    "actor": "admin",
    "evidence": []
  }
}
```

`compiledContent` is what EvoPilot modules consume. It merges template defaults with project overrides and records `inheritedSections` and `overrideSections`.

## Validation Checks

The server returns `evopilot-project-harness-profile-validation/v1` with these checks:

| Check | Purpose |
|---|---|
| `project-scope` | Source profile matches route project, tenant, and workspace. |
| `template-binding` | Template exists and digest is known. |
| `capability-boundaries` | Capabilities have boundaries and required evidence. |
| `runtime-validation` | Runtime or validation commands are declared. |
| `evidence-contract` | Required artifacts exist. |
| `mandatory-governance` | Project profile did not weaken mandatory template gates. |
| `failure-diagnostics` | Failure taxonomy and diagnostics are present. |
| `observability` | Observability section is present. |
| `phase-mapping` | Alpha/Beta/RC/GA phase mapping is non-empty. |
| `llm-draft-policy` | LLM drafts require review and cannot mutate active profiles silently. |

## Status Values

| Status | Meaning |
|---|---|
| `DRAFT` | Generated or imported for review; not active. |
| `VALIDATED` | Stored candidate version that passed validation. |
| `ACTIVE` | Version currently used by goal planning. |
| `SUPERSEDED` | Former active version replaced by another activation. |
| `REJECTED` | Reserved for versions rejected by governance. |
