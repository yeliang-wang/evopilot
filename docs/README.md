# EvoPilot documentation

Choose the path matching your task:

The portable app includes this index and the public documentation. Product links open source checkouts here and packed `node_modules/@evopilot-next/` documentation after assembly. Development and test commands, including source paths shown in API verification sections, require a populated source checkout; source tests and assembly tools are not shipped. Installation, recovery, report verification and the roadmap checker document the commands available in the portable app.

| Audience | Start here | Next reference |
| --- | --- | --- |
| New Preview user | [Installation](installation.md), then [first journey](first-journey.md) | [Capabilities and limits](capabilities.md) |
| Project onboarding and model authoring | [First journey](first-journey.md) | [Ontology v1 definitions](../projects/evopilot-ontology/specifications/v1/README.md), [schemas](../projects/evopilot-ontology/schemas/), [examples and templates](../projects/evopilot-ontology/examples/) |
| Quality author | [Harness v1 definitions](../projects/evopilot-harness/specifications/v1/README.md) | [Harness examples](../projects/evopilot-harness/examples/), [service API](../projects/evopilot-harness/docs/service.md) |
| Developer | [Development](development.md), [testing](testing.md) | [Composition](product-composition.md), [Runtime API](../projects/evopilot-runtime/docs/service.md), [Ontology API](../projects/evopilot-ontology/docs/service.md) |
| Operator | [Local service](local-service.md), [recovery](recovery.md) | [Migration](migration.md), [current roadmap](roadmap.md) |

Architecture covers [product boundaries](architecture/0001-three-product-boundary.md), [process topology](architecture/0002-local-process-topology.md), and [native authoring](architecture/0003-local-authoring.md). The [authoritative roadmap](roadmap/ROADMAP.md) remains separate from the current implementation summary.

Local services and the explicit Preview entry are implemented. Technical tests, package assembly and passive installation do not establish final Host acceptance or production readiness.

M5 source publication, remote CI and release preparation are authorized; source publishing is in progress. See [GitHub source and release preparation](github-release.md) for the four public repositories and candidate CI artifacts. Final versioned Release publication is not yet authorized; local acceptance remains in a separately verified candidate report.
