# Current published release: Runtime 6.3.1 and Evolution Expert 2.3.0

Runtime **6.3.1** is published and verified. The [publication evidence](../../governance/releases/runtime-6.3.1-publication-20261004.json)
binds the actual public GitHub, npm and GHCR readbacks to accepted Candidate
`37133707977`, source `f0adee70ac45d5da5d691cfa583eba03ee014eb0`.
Evolution Expert **2.3.0** and evopilot-harness **4.8.1** retain their already
published versions; this Runtime patch does not republish them.

## Public distribution

| Product | Public stable release | npm packages |
| --- | --- | --- |
| Runtime 6.3.1 | [v6.3.1](https://github.com/yeliang-wang/evopilot/releases/tag/v6.3.1) | `@evopilot/contracts`, `@evopilot/client`, `@evopilot/cli`, `@evopilot/adapter-mcp`, `@evopilot/adapter-opencode`, `create-evopilot`, all `6.3.1` |
| Evolution Expert 2.3.0 | [evolution-expert-v2.3.0](https://github.com/yeliang-wang/evopilot/releases/tag/evolution-expert-v2.3.0) | `@evopilot/evolution-expert@2.3.0` |

Install all six public Runtime packages into a fresh Node project:

```bash
npm install --save-exact \
  @evopilot/contracts@6.3.1 \
  @evopilot/client@6.3.1 \
  @evopilot/cli@6.3.1 \
  @evopilot/adapter-mcp@6.3.1 \
  @evopilot/adapter-opencode@6.3.1 \
  create-evopilot@6.3.1
```

For the standalone CLI, use `npm install -g @evopilot/cli@6.3.1`. The public
self-host installer is
[`v6.3.1/install.sh`](https://raw.githubusercontent.com/yeliang-wang/evopilot/v6.3.1/install.sh).
The public image is `ghcr.io/yeliang-wang/evopilot:6.3.1`; obtain its immutable
digest and the verified installer/package evidence from the publication ledger.
The sixteen accepted Runtime assets retain their Candidate hashes; generated
promotion metadata is additional to that frozen set.

The series consumes [evopilot-harness 4.8.1](https://github.com/yeliang-wang/evopilot-harness/releases/tag/v4.8.1).
The ordinary Agent connection remains local MCP stdio. The adapter calls
EvoPilot Runtime over HTTP, by default `http://127.0.0.1:19876`.
Dashboard remains independently versioned. The independent local project
extensions **1.0.1** used in reference acceptance remain a private, separately
installed component, not a public Runtime asset.

## Current acceptance and explicit limits

Runtime 6.3.1 passed **409/409 applicable criteria, 9/9 real cases and 2,403
exact installed regression tests**. The actual Codex campaign completed all
12 required Targets across Alpha/Beta/RC/GA and verified the retained completion
receipts after restart. Default installation apply, rollback and reapply were
separately verified. See [6.3.1 acceptance and upgrade notes](6.3.1.md).

Real Host acceptance is **Codex-only**. Native credential entry, submission and
cancellation remain **unverified**; the new 90-minute / 5,400-second soak was
excluded and remains `SKIPPED_BY_USER_NOT_PASS`. Neither exclusion is counted
as a passed criterion. Other live Hosts, cross-Host equivalence and a new
long-duration stability result are not claimed. Existing private configuration
was reused; source scope and business collectors still need qualification for
each applicable project. Runtime usage is measured in tokens, without product
monetary limits.

Publication did not deploy a remote Runtime, install a user Host or delete a
user's Suites. The reference machine's separately authorized cleanup removed
**76 legacy Suite roots and 4,164 original files**, preserving necessary
non-Suite audit records, including two audit files from the failed-activation
cleanup. It is not an automatic Runtime removal feature. Credentials and
independent journals remain outside Suite deletion.

## Documentation and immutable artifacts

Current operating guidance lives on the default branch. This documentation
update follows verified publication; it does not rebuild, republish or replace
existing tags, source archives, npm tarballs or their embedded documentation.
The local acceptance record preserves its original pre-publication authority
fields. The later publication ledger supplies the actual public result.

## Historical 6.3.0 / Expert 2.3.0 baseline

The following original 2026-10-02 baseline remains historical evidence; its
400-criterion Runtime and Expert counts are not changed to the new 409-criterion
Runtime scope. The one-of-four Target demonstration below is also historical,
not the completed 6.3.1 twelve-Target Goal.

Verified publication date: **2026-10-02**. This page records the completed
release and approved acceptance scope. The [publication evidence](../../governance/releases/semantic-convergence-20261002-publication.json)
binds exact tags, immutable artifact digests, package integrity and acceptance.

### Public distribution

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

### Acceptance and explicit limits

The approved acceptance scope is **1103/1103 PASS with NO_REGRESSION**:
Harness 303, Runtime 400, and Expert 400. The terminal series journey used real
Codex execution, independent business/Harness validation, Target completion and
exact receipt readback after Runtime restart. Its demonstration Goal was **one
of four Targets complete**, not whole-Goal completion.

Real Host acceptance is Codex-only. A new 90-minute soak and Runtime/Expert
native credential entry, submission and cancellation were explicitly excluded
and remain `SKIPPED_BY_USER_NOT_PASS`. Existing configuration was reused. Other
live Hosts, cross-Host equivalence and long-duration stability are not claimed.

### Documentation and immutable artifacts

Current installation and operating guidance lives on the repository's default
branch. This documentation correction follows publication; existing tags,
source archives, npm tarballs and their embedded README copies remain immutable.
It does not rebuild, republish or change product behavior. Historical release
and Candidate notes preserve their original evidence and are not current
installation instructions.
