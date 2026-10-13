# Contributing

Runtime owns execution and state; Harness owns quality, evidence and delivery standards; Ontology owns semantic modeling; the parent owns composition, unified Expert integration and distribution.

Use the recursive checkout in [development](docs/development.md) for parent integration. A standalone child builds from its own source, lock and frozen vendor material without a parent checkout. Change the owning repository first, review and commit there, then update the parent gitlink to that exact commit.

The v0.2.0 target is strict TypeScript with real `dist` compilation and declarations. Run `npm ci --ignore-scripts`, `npm run build`, `npm run check` (strict typecheck), and `npm test`; parent integration also requires all three built package bindings. Tests/tools remain `.mjs`. Compatibility synchronization is a separate integrity task; preserve v1 specifications and byte pins.

Do not commit `dist`, `node_modules`, credentials, private workspaces or audit reports. Use your real authorized Git identity or your own GitHub-provided noreply address. Do not invent contributors, fabricate commits or rewrite published history.

Describe the problem, resulting behavior and exact validation. Report missing dependencies, skipped checks and failures honestly. Synthetic fixtures do not establish production acceptance, Host verification or release authority. See [testing](docs/testing.md), [security](SECURITY.md) and [release procedure](docs/github-release.md).
