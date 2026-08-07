# Project Harness Profile Schema

This reference documents the YAML/JSON source profile accepted by the CLI and API. The server compiles it with a `HarnessTemplate` and any active tenant/workspace `TenantHarnessPolicy` records into an active project control-plane profile.

## HarnessTemplate Source

EvoPilot ships multiple built-in template harness types. Fresh installs expose runtime templates such as `python-enterprise-harness`, `java-ddd-service-harness`, `node-saas-control-plane-harness`, `go-middleware-harness`, and `observability-apm-harness`, plus v2 domain templates `database-product-harness` and `api-gateway-harness`. During profile generation, EvoPilot automatically matches a published template from project context and the goal loop target when the source profile or request omits `template.templateId`.

The v2 domain model keeps product domain, compatibility, architecture, and implementation runtime separate. For example, `database-product-harness@2.1.0` is for the owner's self-developed database product; PostgreSQL and MySQL are compatibility references or differential oracles, not the default evolution target.

Administrators normally maintain public templates as readable packs under `harness-templates/public/<template-id>/`. Each pack contains `README.md`, `template.yaml`, `CHANGELOG.md`, and `examples/default-project-profile.yaml`. Use `evopilot harness template pack validate <path> --json` for local pack-shape checks plus server-side template validation, and `evopilot harness template pack publish <path> --json` to store the version in the control plane. The first-stage pack CLI intentionally exposes only `list`, `validate`, and `publish`; use Git for file diffs and reviews.

Administrators can also publish direct YAML or JSON through `evopilot harness template upgrade --file <template.yaml> --changelog <text> --json` or the equivalent `apply/update` aliases. The file is a full template definition; different languages, architecture styles, or software types should use distinct template ids or versions. Markdown documents the pack for humans and AI agents, but `template.yaml`/JSON is authoritative because the server must parse, validate, merge, version, and digest structured data.

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
  - name: OpenTelemetry FastAPI instrumentation
    url: https://github.com/open-telemetry/opentelemetry-python-contrib/tree/main/instrumentation/opentelemetry-instrumentation-fastapi
    category: github
    rationale: FastAPI HTTP request instrumentation for traces, metrics, and log correlation.
  - name: Sentry
    url: https://github.com/getsentry/sentry
    category: github
    rationale: Error tracking, issue grouping, stack traces, breadcrumbs, release health, and performance diagnostics.
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
    - incident-or-failure-report
  correlationFields:
    - requestId
    - traceId
    - spanId
    - tenantId
    - workspaceId
failureTaxonomy:
  categories:
    - dependency
    - test
  exceptionTracking:
    requiredAttributes:
      - exception.type
      - exception.message
      - exception.stacktrace
      - errorCode
      - requestId
      - traceId
    mustLinkToTrace: true
diagnosticsBaseline:
  requiredSignals:
    - failing-command
    - trace-id
  runbookRequirements:
    criticalAlertsRequireRunbook: true
observabilityBaseline:
  requiredSignals:
    - health
    - logs
    - metrics
    - traces
    - alerts
    - slo
  structuredLogs:
    requiredFields:
      - timestamp
      - level
      - service
      - requestId
      - traceId
      - spanId
      - errorCode
  alerts:
    required:
      - high_error_rate
      - latency_slo_breach
  slo:
    errorBudgetStatusRequiredForRcAndGa: true
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
    summary: Add enterprise observability, exception tracking, SLO, and runbook defaults.
    changes:
      - Add structured log fields, exception attributes, trace correlation, alert rules, SLO rules, and operational runbook requirements.
```

`id` and `version` are required. The server computes `digest`; callers should not hand-edit it. A changelog entry for the current version is required, either in the file or through CLI `--changelog`. Reusing the same `id@version` requires `--force`; normal updates should publish a new version.

## TenantHarnessPolicy Source

`TenantHarnessPolicy` is the private tenant/workspace constraint layer. Administrators apply and activate policy versions with `evopilot harness policy apply --file <policy.yaml> --changelog <text> --json` and `evopilot harness policy activate <policy-id> --version <n> --json`. Project onboarding does not choose a policy manually; active matching policies are inherited automatically.

```yaml
schema: evopilot-tenant-harness-policy/v1
policyId: default
name: Workspace Private Harness Policy
description: Tenant/workspace controls that every matching project profile must satisfy.
appliesTo:
  languageFamilies:
    - python
requiredCapabilities:
  - id: tenant-audit-boundary
    name: Tenant audit boundary
    boundary: Every project profile preserves tenant audit and repair evidence.
    requiredEvidence:
      - tenant-audit-proof
evidence:
  requiredEvidence:
    - tenant-audit-proof
  correlationFields:
    - tenantId
    - workspaceId
    - projectId
    - requestId
    - traceId
failureHandling:
  requiredFields:
    - errorCode
    - requestId
    - traceId
  exceptionTracking:
    requiredAttributes:
      - tenantId
      - workspaceId
      - exception.type
diagnostics:
  requiredSignals:
    - tenant-audit-event
observability:
  structuredLogs:
    requiredFields:
      - tenantId
      - workspaceId
      - projectId
      - requestId
      - traceId
      - errorCode
governance:
  tenantPolicyRequired: true
  cannotWeaken:
    - tenantPolicyRequired
enforcement:
  requiredGovernanceTrue:
    - tenantPolicyRequired
changelog:
  - version: "1"
    summary: Initial workspace private policy.
    changes:
      - Initial workspace private policy.
```

Policy versions are stored under `<dataRoot>/tenant-harness-policies/<tenantId>/<workspaceId>/<policyId>/versions/v<version>.json`. The server records changelog entries supplied in the file or through CLI `--changelog`, plus source and compiled digests. When active, a policy is merged between the template and project source. The project source may strengthen controls, but validation fails if it weakens policy-required governance or omits required policy evidence, diagnostic, observability, or correlation fields.

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
  version: 1.1.0
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
| `template.templateId` | no | If omitted during generation, EvoPilot automatically matches a published template from project context and the goal loop target; if omitted in an imported source profile, the server applies the same control-plane matching logic. |
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
      "version": "1.1.0",
      "digest": "sha256:..."
    },
  "policyRefs": [
    {
      "policyId": "default",
      "version": 1,
      "digest": "sha256:...",
      "scope": "tenant-workspace"
    }
  ],
  "validation": {},
  "generatedBy": {
    "mode": "user",
    "actor": "admin",
    "evidence": []
  }
}
```

`compiledContent` is what EvoPilot modules consume. It merges template defaults, active tenant/workspace policy constraints, and project overrides. It records `inheritedSections`, `overrideSections`, and `policyRefs`.

## Validation Checks

The server returns `evopilot-project-harness-profile-validation/v1` with these checks:

| Check | Purpose |
|---|---|
| `project-scope` | Source profile matches route project, tenant, and workspace. |
| `template-binding` | Template exists and digest is known. |
| `tenant-harness-policy-binding` | Compiled profile binds active tenant/workspace policy versions and digests. |
| `capability-boundaries` | Capabilities have boundaries and required evidence. |
| `runtime-validation` | Runtime or validation commands are declared. |
| `evidence-contract` | Required artifacts exist. |
| `mandatory-governance` | Project profile did not weaken mandatory template gates. |
| `failure-diagnostics` | Failure taxonomy and diagnostics are present. |
| `observability` | Observability section is present. |
| `phase-mapping` | Alpha/Beta/RC/GA phase mapping is non-empty. |
| `llm-draft-policy` | LLM drafts require review and cannot mutate active profiles silently. |
| `tenant-harness-policy-compliance` | Compiled profile satisfies policy-required capabilities, evidence, failure fields, diagnostics, observability, structured logs, governance booleans, and phase mappings. |

## Status Values

| Status | Meaning |
|---|---|
| `DRAFT` | Generated or imported for review; not active. |
| `VALIDATED` | Stored candidate version that passed validation. |
| `ACTIVE` | Version currently used by goal planning. |
| `SUPERSEDED` | Former active version replaced by another activation. |
| `REJECTED` | Reserved for versions rejected by governance. |
