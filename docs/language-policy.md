# Implementation languages

EvoPilot's maintained product core is strict TypeScript. Language choice follows the responsibility of a component; GitHub's language percentage is not an acceptance measure.

| Responsibility | Source language | Boundary |
|---|---|---|
| Runtime, Harness and Ontology public services, state, decisions, claims and receipts | TypeScript (`.ts`) | Runtime input validation remains required despite compile-time types. |
| Expert, Codex MCP, connections, collection and online coordination | TypeScript (`.ts`) | No duplicate business implementation in shell, Python or handwritten JavaScript. |
| New shared compatibility contracts | TypeScript (`.mts`) | The parent compiles JavaScript/declarations and verifies identical owner vendor bytes. |
| Build, installation bootstrap, packaging and test drivers | JavaScript (`.mjs`) | These scripts invoke owned product APIs; they cannot invent business decisions. |
| RDFLib/pySHACL execution | Python | The pinned native validation adapter consumes inputs and produces reports; TypeScript owns lifecycle and acceptance. |
| Harness policy, ontology and constraints | Rego, Turtle/SHACL, JSON/YAML | These are interoperable assets in their native formats, not another product implementation language. |

The current OpenHands [repository boundaries](https://github.com/OpenHands/OpenHands#repository-boundaries) distinguish the Canvas/client and the Python Agent SDK. Its [package manifest](https://github.com/OpenHands/OpenHands/blob/main/package.json) also uses JavaScript launch/build scripts. EvoPilot follows the same principle of explicit responsibility, while keeping its own services in TypeScript.

## Generated and historical JavaScript

Installed Node processes run compiled JavaScript. A `.js` or `.mjs` runtime file therefore does not imply that its maintained source is JavaScript. Builds emit declarations, and parent contract generators compare emitted bytes with distributed copies.

The frozen v1 legacy reference module and Ontology's retained compatibility readers remain hash-pinned historical exceptions. They are not a place for new product behavior. The existing Python native adapter is also explicitly pinned. Their exact paths and hashes are recorded in [the language policy](../governance/language-policy.json); changing an exception requires a separately reviewed compatibility change.

## Verification

`node scripts/check-languages.mjs` rejects unlisted JavaScript in maintained core roots, unlisted Python, changed frozen exceptions, disabled TypeScript checking and missing TypeScript sources for generated modules. Owning builds use strict type checking and emit public declarations. The allowlist names each generated module, its TypeScript source and its generator. `npm run check` runs all four canonical generators in comparison mode to verify the actual emitted JavaScript and declarations against distributed bytes.

GitHub Linguist attributes identify only actual generated/vendor files. Product source and tests are not hidden to increase a percentage. Each independent repository reports its own languages; the parent does not count submodule source as its own.
