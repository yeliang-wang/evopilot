# Enterprise Management Software Harness

Domain-first HarnessTemplate for CRM, ERP, workflow, and enterprise management products.

Use this pack when EvoPilot is onboarding a business management product where business objects, RBAC, workflow, audit, reporting, integration, import/export, and operator diagnostics are the primary harness boundary.

## Layers

- Domain: `enterprise-management-software`
- Compatibility: `crm`, `erp`, `workflow`
- Architecture: `modular-monolith`, `saas-control-plane`, `evented-workflow`
- Runtime: `java`, `node`, `python`, `go`, `generic`

## Administrator Flow

```bash
evopilot harness template pack validate harness-templates/public/enterprise-management-software-harness --json
evopilot harness template pack publish harness-templates/public/enterprise-management-software-harness --json
```
