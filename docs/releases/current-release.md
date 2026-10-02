# Current published release: Runtime 6.3.0 and Evolution Expert 2.3.0

Verified publication date: **2026-10-02**. This page records the completed
release and approved acceptance scope. The [publication evidence](../../governance/releases/semantic-convergence-20261002-publication.json)
binds exact tags, immutable artifact digests, package integrity and acceptance.

## Public distribution

| Product | Public stable release | npm packages |
| --- | --- | --- |
| Runtime 6.3.0 | [v6.3.0](https://github.com/yeliang-wang/evopilot/releases/tag/v6.3.0) | `@evopilot/contracts`, `@evopilot/client`, `@evopilot/cli`, `@evopilot/adapter-mcp`, `@evopilot/adapter-opencode`, `create-evopilot`, all `6.3.0` |
| Evolution Expert 2.3.0 | [evolution-expert-v2.3.0](https://github.com/yeliang-wang/evopilot/releases/tag/evolution-expert-v2.3.0) | `@evopilot/evolution-expert@2.3.0` |

Runtime tag source is `896ba700fb232ccdc727beb287bdb4fa17be88ae`; Expert tag source
is `cf03ba312ef18ce9a2e7af96e2c5ca6f2f6307e1`. The sixteen frozen Runtime assets,
four frozen Expert assets and all seven npm packages were verified, including
fresh public installs and Registry signatures/provenance. Generated promotion
metadata is additional to the frozen asset set.

The public Runtime image is `ghcr.io/yeliang-wang/evopilot:6.3.0`, bound to
`sha256:f2f31c10d995bf7708ff5eaa31f19f145c052faca9954b7df58f13251fcba4a1`.
Anonymous image pull and the public manifest-based installer were verified.
Publication did not deploy a remote Runtime or switch an existing user's Suite.
The ordinary Agent connection remains local MCP stdio; the adapter calls
EvoPilot Runtime over HTTP, by default `http://127.0.0.1:19876`.

The series consumes [evopilot-harness 4.8.1](https://github.com/yeliang-wang/evopilot-harness/releases/tag/v4.8.1).
Dashboard is independently versioned and not a dependency of this acceptance.
Learning Interoperability in Runtime 6.4.0 remains outside this delivery.

## Acceptance and explicit limits

The approved acceptance scope is **1103/1103 PASS with NO_REGRESSION**:
Harness 303, Runtime 400, and Expert 400. The terminal series journey used real
Codex execution, independent business/Harness validation, Target completion and
exact receipt readback after Runtime restart. Its demonstration Goal was **one
of four Targets complete**, not whole-Goal completion.

Real Host acceptance is Codex-only. A new 90-minute soak and Runtime/Expert
native credential entry, submission and cancellation were explicitly excluded
and remain `SKIPPED_BY_USER_NOT_PASS`. Existing configuration was reused. Other
live Hosts, cross-Host equivalence and long-duration stability are not claimed.

## Documentation and immutable artifacts

Current installation and operating guidance lives on the repository's default
branch. This documentation correction follows publication; existing tags,
source archives, npm tarballs and their embedded README copies remain immutable.
It does not rebuild, republish or change product behavior. Historical release
and Candidate notes preserve their original evidence and are not current
installation instructions.
