# Read project evidence in v0.7

These APIs are included in v0.7. Upgrading an existing installation requires the separate backup and cutover procedure. Native `specifications/v1` remain the source of asset format and validation rules.

## One owner snapshot, several views

Use `readable.list` with an explicit project scope, then `readable.snapshot` with an asset `id`/`version` (Ontology or Harness), or a native project `id` and optional `runId` (Runtime). Runtime defaults to its completed Run, if present; it does not silently choose an arbitrary recent candidate. The same snapshot can be queried and exported as JSON, Markdown or HTML. Its digest, source and asset pins, fixed requirement count, and fixed variant count accompany every view.

`readable.query` takes the same identity plus `query`: `limit` (default 50, maximum 200), `search`, `kind`, `verdict`, `expectedDigest`, and an opaque `cursor`. Keep the filter unchanged across pages. A changed snapshot or filter rejects an old cursor. `matching` is the filtered count; the original denominator remains unchanged.

`readable.export` requires the identity, `format` and `expectedDigest`. Exported content is escaped for its format; it cannot approve, execute or publish anything. It stays private unless the user explicitly chooses to share it. Missing or changed evidence yields a named error, not an inferred PASS.

## Interpret the result correctly

| Field | Meaning |
|---|---|
| Expected | The fixed case's expected acceptance or rejection. |
| Actual | The actual native validator output, or `null` when unavailable. |
| Verdict | Whether the exact case matched the expectation; not a general business readiness claim. |
| Origin | Synthetic case, source/design declaration, execution result or other explicitly retained origin. |
| References | Exact case, input, shape/rule, source and report references with available digests. |
| Stages | Asset conformance, review, execution and project completion are separate. Software release is never inferred. |

For example, a SHACL fixture that deliberately violates a required property should produce `expected.conforms=false`, `actual.conforms=false`, and case verdict `PASS`. Harness negative cases similarly preserve actual `FAIL` or `WARN`. This establishes a correctly tested constraint; it does not establish that a running business service passes that constraint.

Runtime lists every fixed requirement/variant even without a result. Such rows remain `MISSING`. Business E2E, Host, performance and scale obligations must be independently declared and evidenced; an asset report cannot invent or satisfy them.

## Compare two asset versions

`readable.compare` takes `id`, `beforeVersion` and `afterVersion` within one owner/project. It pins both snapshots and reports added, removed and changed projected identities. Missing versions or mismatched scope reject.

Comparisons are paginated through optional `query.limit` (default 10, maximum 50) and `query.cursor`. Every page retains both version/digest pins, `comparisonDigest`, fixed `beforeDenominator`/`afterDenominator`, `totalChanges`, `returnedChanges`, `offset` and `nextCursor`. Follow the returned cursor until `null`; a partial page is not a full comparison. A cursor from another snapshot pair rejects with `READABLE_SNAPSHOT_DRIFT`. Declaration/result changes appear before changes limited to evidence references; this order does not judge business impact.

To keep Codex responses readable, each comparison body is bounded to 12 KiB before the small owner/transport envelope. The service may return fewer rows than requested. It never truncates a row: exact before/after records remain in `changes`, while the table uses hashes for verbose raw details. A single oversized row returns `READABLE_LIMIT`; it must not be reported as an empty or complete comparison. Use digest-bound snapshot/export inspection for such a record. Table fields and original native records remain available without weakening validation or changing the fixed denominator.

Ontology uses the locked RDFLib canonical graph projection, separately for each manifested model, shape and instance graph. Formatting, prefix spelling and triple order can leave `rdfGraphEquivalentWithinProfile=true` while package digests differ. The comparison does not run OWL inference or assert business semantic equivalence. Graph paths, unsupported input, blank-node structure changes and missing evidence retain explicit limitations. Harness changes expose rule declarations, parameters and cases; no claim of general Rego program equivalence is made.

## Codex delivery boundary

v0.7 presents business-readable plans, Ontology assets, Harness rules, version differences and gate results directly in Codex. Human summaries and JSON/Markdown/HTML exports derive from the same verified owner snapshot. Always retain the original requirement denominator, exact versions and evidence links. No Dashboard pages, web server or browser acceptance are included. These public read APIs support service clients. The pre-v1.0 release scope excludes graphical frontend work.

## Table-first human reports

`readable.export` renders separate tables for concepts, properties, directed relationships, constraints, instances, Harness rules and case results. Each row has an evidence reference; the report includes original identifiers, digests, versions, stage states and the full fixed denominator. Missing labels use native identifiers. Missing definitions, severity or provenance remain visibly missing. Source text is literal, including text resembling markup or instructions.

Ontology labels come from `rdfs:label`; definitions come from `rdfs:comment`, `skos:definition` or `sh:description`. Native literal language/datatype and SHACL predicate names are retained. `minExclusive=12` is never rewritten as `minInclusive=12` or `13`. Complex SHACL paths retain their native nodes; this bounded reader does not simplify them into invented relationships. JSON retains the original triples.

Within each shape graph, constraint pages show explicitly targeted shapes first, then property paths and other declared constraints. RDF lists and auxiliary path nodes remain in `kind=structure` rows and the full JSON snapshot, with their graph evidence. They are not independent business constraints. This ordering changes neither the graph nor the fixed acceptance denominator.

Harness displays the catalog's `qualityDomain`, `inputRefs`, exact effective parameter values, `query` and `required` declaration. The native v1 catalog has no independent severity/title field: the view explicitly reports missing metadata instead of inventing P0/P1 or treating `required` as a severity. Actual Conftest results still determine failures/warnings; expected fixture outcomes still determine case verdicts. Rule declarations and case results are separate tables.

Result states distinguish `NOT_EXECUTED`, `MISSING`, `ERROR`, `UNKNOWN`, `FAIL`, and `PASS`. A correct expected rejection shows both the failing input result and the passing test. A source declaration or synthetic test cannot establish real business execution. Runtime retains every fixed variant even when evidence is missing. Version comparisons return a `table` and escaped `markdown` with exact before/after values and both snapshot identities; no change is automatically accepted.

These are read projections over the existing standards. RDF/OWL/SHACL, Rego/OPA/Conftest, native package layout, validators, authority and immutable records remain unchanged. This work does not add Dashboard pages or a web service.

Presentation references: [ROBOT export](https://robot.obolibrary.org/export), [ROBOT report](https://robot.obolibrary.org/report), [SHACL validation results](https://www.w3.org/TR/shacl/#results), [Conftest output options](https://www.conftest.dev/options/), and [Allure result states](https://allurereport.org/docs/test-statuses/). These inform presentation; they do not imply full feature parity or introduce a replacement native standard.
