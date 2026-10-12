# EvoPilot 0.1.0 — under construction

EvoPilot is being built as three independently versioned products: Runtime owns execution and workspace services, Harness owns declarative evaluation and lifecycle, and Ontology owns semantic models and their lifecycle. Ordinary users will use a unified Expert/plugin; administrators use machine scripts. That integrated experience is still under construction.

Current source provides exact immutable reference checks, native v1 Harness and Ontology pure APIs, explicitly scoped historical compatibility libraries and preserved public source catalogs. Persistent services, workspace operations, CLI/MCP, operational migration and Expert/plugin integration remain pending. This is not stable 1.0, production readiness or full acceptance.

Source is licensed under [Apache-2.0](LICENSE); see [NOTICE](NOTICE) for retained attribution.

Start with [documentation](docs/README.md), [current capabilities](docs/capabilities.md) and [developer commands](docs/development.md). Product entries describe ownership and public APIs:

- [Runtime](projects/evopilot-runtime/README.md)
- [Harness](projects/evopilot-harness/README.md)
- [Ontology](projects/evopilot-ontology/README.md)

Use Node 24.14.0. Harness and Ontology use their own committed locks with `npm ci --ignore-scripts --no-audit --no-fund`; parent and Runtime need no install. Then child `npm run build`, `npm run check` and `npm test` work independently. The populated parent runs the same commands for canonical vendor generation and full integration validation. [Offline artifact rehearsal](docs/development.md) validates packed packages outside source; it is not a release.

The [three-product architecture](docs/architecture/0001-three-product-boundary.md), [process topology](docs/architecture/0002-local-process-topology.md), [native authoring boundary](docs/architecture/0003-local-authoring.md) and [compatibility policy](integration/compatibility/v1/README.md) define source ownership. Local repositories/gitlinks are assembled separately; final remote URLs remain pending authorization.

The [implementation lock](governance/implementation-lock.json) binds the [roadmap](governance/roadmap.json) and retained [local implementation decision](governance/decisions/local-implementation.json). [M0 technical evidence](governance/m0.json) and [acceptance records](governance/acceptance.json) remain distinct. No new approval or acceptance follows from these source changes. All E01–E19 acceptance criteria remain pending; M1 completion is not claimed.

`npm run roadmap:check` validates retained governance. The existing local intent grammar is `local-v0.1[/: ]M[0-4]:` followed by a nonempty description. The gate expresses local alignment only, not permission to execute arbitrary prose. M5/GitHub, publication and release require the retained acceptance prerequisites and fresh authorization. The checked-in future CI configurations do not establish that CI ran. Existing daily installations, credentials and data remain outside this source work.
