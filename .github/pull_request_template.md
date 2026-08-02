# Summary

Describe the user, operator, administrator, or AI Agent workflow affected by this change.

## Scope

- [ ] CLI/API behavior
- [ ] HarnessTemplate or ProjectHarnessProfile behavior
- [ ] Goal loop or release governance behavior
- [ ] Documentation or open-source productization
- [ ] Tests or validation only

## Governance Checklist

- [ ] Preserves RBAC and tenant/workspace scope.
- [ ] Preserves human approval gates for generated ProjectHarnessProfile, HarnessTemplateEvolution, phase plans, source closure, and release decisions.
- [ ] Does not introduce raw secret handling in daily target, goal, or loop commands.
- [ ] Updates README/docs/OpenAPI/CLI references when behavior changes.

## Validation

Paste commands and results:

```bash
npm run cli:test
git diff --check
```

Use `npm run check` for broader release-impacting changes.
