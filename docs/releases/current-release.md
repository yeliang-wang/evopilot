# Current published release: Runtime 6.3.3 and Evolution Expert 2.3.1

Runtime **6.3.3** and Evolution Expert **2.3.1** are published and independently verified. The [Runtime publication record](../../governance/releases/runtime-6.3.3-publication-20261006.json) binds GitHub, npm and GHCR to Candidate `37407237313`; the [Expert publication record](../../governance/releases/evolution-expert-2.3.1-publication-20261006.json) binds its GitHub and npm publication to Candidate `37407240219`. Both use source `4c7c09b8be221d2feedef8fa5f12b00883ee33fc`. The independently published Harness is **4.8.2**.

## Public distribution

| Product | Stable release | Packages |
| --- | --- | --- |
| Runtime 6.3.3 | [v6.3.3](https://github.com/yeliang-wang/evopilot/releases/tag/v6.3.3) | Six Runtime npm packages, all `6.3.3` |
| Evolution Expert 2.3.1 | [evolution-expert-v2.3.1](https://github.com/yeliang-wang/evopilot/releases/tag/evolution-expert-v2.3.1) | `@evopilot/evolution-expert@2.3.1` |
| Harness 4.8.2 | [v4.8.2](https://github.com/yeliang-wang/evopilot-harness/releases/tag/v4.8.2) | `@evopilot/harness@4.8.2`, independently published |

```bash
npm install --save-exact \
  @evopilot/contracts@6.3.3 \
  @evopilot/client@6.3.3 \
  @evopilot/cli@6.3.3 \
  @evopilot/adapter-mcp@6.3.3 \
  @evopilot/adapter-opencode@6.3.3 \
  create-evopilot@6.3.3
```

The standalone CLI installs with `npm install -g @evopilot/cli@6.3.3`. The [tagged self-host installer](https://raw.githubusercontent.com/yeliang-wang/evopilot/v6.3.3/install.sh) and `ghcr.io/yeliang-wang/evopilot:6.3.3` are public. The Runtime ledger records its immutable image digest and sixteen accepted Candidate assets, plus the separate promotion record. Expert has four accepted Candidate assets and its own promotion record. See [Agent Host installation](../guides/agent-host-installation.md) to install and activate the whole combination; installing npm packages alone does not configure or qualify a Host.

Host connections remain MCP stdio. The Runtime MCP adapter calls EvoPilot Runtime over HTTP, by default `http://127.0.0.1:19876`; Harness remains an independent stdio server and Expert is loaded in the Host. Expert retains its own `@evopilot/contracts@6.3.0` dependency while declaring compatibility with Runtime 6.3.3. Dashboard is independently versioned. Private independent project extensions **1.0.1** remain unchanged.

## Current acceptance and explicit limits

| Release unit | New criteria | Inherited definitions reviewed for current impact | Current cases |
| --- | --- | --- | --- |
| Runtime 6.3.3 | 6 passed | 419 individually reviewed | 3 passed within the approved patch scope |
| Expert 2.3.1 | 6 passed | 400 individually reviewed | 3 passed within the approved patch scope |

The [Runtime acceptance](../../governance/releases/runtime-6.3.3-acceptance-20261006.json) and [Expert acceptance](../../governance/releases/evolution-expert-2.3.1-acceptance-20261006.json) preserve each item's definition and current evidence mode. The exact installed Candidate regression run passed **2,505 tests, with no failures or skips**. Impact review combines current changed-path evidence and justified unchanged-input equivalence; it does not transfer old PASS statuses or claim that every historical journey ran again.

Actual Codex observations are limited to the current packaged Expert Skill, bounded read-only Runtime MCP and HTTP state checks, and readback after process restart. The campaign made **zero model calls and used zero model tokens**. Generated Host compatibility and `doctor` declarations are separate from live Host qualification. Other live Hosts, native credential input/submission/cancellation and a new 90-minute soak were not executed and are not counted as passed. Harness 4.8.2 has its own [published acceptance record](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/releases/current-release.md); separate component observations do not establish a new three-product business journey.

Existing private configuration and daily data were preserved. **This publication campaign did not cut over the daily local installation**, deploy a remote Runtime or delete any Suites. Previous cleanup, migration and installation records remain completed historical transactions, not new work or restoration sources. The independent project extensions stay at 1.0.1.

## Documentation and immutable artifacts

Current operating guidance lives on the default branch. Public observations are recorded after publication and do not rebuild accepted tags, source archives, images or npm tarballs. Candidate release notes and pre-publication acceptance retain their original meaning. Use the [release index](README.md) for current and historical records.

## Historical Runtime 6.3.2 campaign

The following section records the completed 6.3.2 campaign and its then-current companion versions and installation guidance. Its counts, model/rollback observations and publication identities are historical and do not describe new 6.3.3 work.

Runtime **6.3.2** is published and verified. The [publication evidence](../../governance/releases/runtime-6.3.2-publication-20261004.json) binds public GitHub, npm and GHCR readbacks to Candidate `37177531263`, source `05da3339b32468f3682eea8a1c2b31880a6c38a1`. Evolution Expert **2.3.0** and evopilot-harness **4.8.1** retain their existing published versions.

### Public distribution

| Product | Stable release | Packages |
| --- | --- | --- |
| Runtime 6.3.2 | [v6.3.2](https://github.com/yeliang-wang/evopilot/releases/tag/v6.3.2) | Six Runtime npm packages, all `6.3.2` |
| Evolution Expert 2.3.0 | [evolution-expert-v2.3.0](https://github.com/yeliang-wang/evopilot/releases/tag/evolution-expert-v2.3.0) | `@evopilot/evolution-expert@2.3.0` |
| Harness 4.8.1 | [v4.8.1](https://github.com/yeliang-wang/evopilot-harness/releases/tag/v4.8.1) | Independently published Harness product |

```bash
npm install --save-exact \
  @evopilot/contracts@6.3.2 \
  @evopilot/client@6.3.2 \
  @evopilot/cli@6.3.2 \
  @evopilot/adapter-mcp@6.3.2 \
  @evopilot/adapter-opencode@6.3.2 \
  create-evopilot@6.3.2
```

The standalone CLI installs with `npm install -g @evopilot/cli@6.3.2`. The [tagged self-host installer](https://raw.githubusercontent.com/yeliang-wang/evopilot/v6.3.2/install.sh) and `ghcr.io/yeliang-wang/evopilot:6.3.2` are public; the ledger contains the immutable image digest and all sixteen accepted artifact hashes. Promotion metadata is additional to those frozen files.

The Agent connection remains local MCP stdio. The MCP adapter calls EvoPilot Runtime over HTTP, by default `http://127.0.0.1:19876`. Dashboard remains independently versioned. Independent local project extensions **1.0.1** remain private and separately installed.

### Current acceptance and explicit limits

The patch passed **10 new criteria, four current cases and 2,414 exact installed regression tests**, with item-specific current impact review of all **409 inherited criteria**. Actual checks include an already aged unchanged Profile, fresh Codex MCP reads, one governed GLM call with token receipts, restart, product rollback/reapply, and isolated controlled provider-failure refusal and explicit repair. See [6.3.2 acceptance and upgrade notes](6.3.2.md).

The earlier [6.3.1 campaign](6.3.1.md) remains historical: its 409 criteria, nine cases, 2,403 tests and twelve-Target Goal are not presented as newly executed 6.3.2 work. Historical one-time migration and deletion transactions were not repeated. Unchanged companion input reuse is justified per inherited item, rather than transferring previous PASS statuses.

Real Host acceptance remains **Codex-only**. Native credential input, submission and cancellation are **unverified**; the new 90-minute / 5,400-second soak is `SKIPPED_BY_USER_NOT_PASS`. Neither is counted as passed. Other live Hosts and a new long-duration stability result are not claimed. Existing private configuration is reused; source scopes and providers still require qualification for each applicable project. Usage is measured in tokens, without a product currency limit.

Publication does not deploy a remote Runtime, install a user's Host or delete their Suites. The reference machine's separately authorized historical cleanup removed 76 legacy Suite roots and 4,164 original files; retained audit and independent resources remain outside deletion. The current-machine update is a separate product-only installation transaction.

### Documentation and immutable artifacts

Current operating guidance lives on the default branch. These pointers follow verified publication and do not rebuild or replace accepted tags, source archives, images or npm tarballs. Original pre-publication records remain immutable; the publication ledger supplies subsequent public observations.

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
