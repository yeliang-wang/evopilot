# Source development — v0.1.1 Preview

Use Node 24.14.0, TypeScript 5.9.3 and @types/node 24.19.2 from committed locks. The parent owns composition, connection, Expert, plugin and canonical compatibility bytes. Each child owns its strict TypeScript core, public declarations, production dependencies and independent checks.

The four repositories are [EvoPilot](https://github.com/yeliang-wang/evopilot), [Runtime](https://github.com/yeliang-wang/evopilot-runtime), [Harness](https://github.com/yeliang-wang/evopilot-harness) and [Ontology](https://github.com/yeliang-wang/evopilot-ontology). Clone the parent recursively. Gitlinks must match the exact reviewed child commits; local package bindings never replace gitlink pinning.

From a populated parent checkout:

~~~sh
npm ci --ignore-scripts --no-audit --no-fund
npm install --ignore-scripts --no-save --package-lock=false --no-audit --no-fund ./projects/evopilot-runtime ./projects/evopilot-harness ./projects/evopilot-ontology
for product in runtime harness ontology; do
  npm --prefix "projects/evopilot-$product" ci --ignore-scripts --no-audit --no-fund
  npm --prefix "projects/evopilot-$product" run build
done
npm run build
npm run check
npm test
npm run roadmap:check
~~~

Local package binding can update child transitive dependencies. Bind before the final child npm ci, which restores each complete child lock; never bind again after that install.

Child builds emit JavaScript, declarations and source maps before the parent resolves their public imports. Parent build emits dist/integration, dist/expert and dist/plugins, and copies the frozen compatibility reference assets. It checks existing canonical vendor bindings without refreshing pins. Each child can also run build, check and test independently with its own locked tools. Do not regenerate locks during verification. In restricted environments set OPENSSL_CONF=/dev/null.

Compiled entry points include dist/integration/composition.js, dist/integration/connection/*.js, dist/expert/core/guide.js and dist/plugins/codex/server.js. Child CLI bins use dist/cli.js; public package exports select declarations through types and JavaScript through import. Ontology retains its explicitly declared compatibility MJS export.

Runtime production dependencies are empty. Harness requires yaml 2.9.0; Ontology requires ajv 8.20.0 and yaml 2.9.0. Source locks also contain the exact development compiler tree. Artifact verification binds the full source lock bytes by SHA256, checks root development metadata and all dependency edges, then derives the installed inventory only from production dependencies. A production dependency marked dev is rejected.

~~~sh
npm run artifacts:verify -- --out /absolute/operator-selected/new-artifacts
node scripts/assemble-preview.mjs --artifacts /absolute/operator-selected/new-artifacts --out /absolute/operator-selected/new-bundle
~~~

Choose new output directories outside source with existing parents. Verification packs offline with scripts disabled, checks actual source inventory, generated exports and declarations, frozen vendor SHA, and tar path/link/size/integrity guards before extraction. Harness and Ontology retain the exact source lock beside their tgz and install with npm ci --omit=dev --offline --ignore-scripts --no-audit --no-fund. Installed version/resolved/integrity inventory and unchanged source lock bytes are checked. Runtime ships no dependency lock. Missing cache fails explicitly.

Assembly includes compiled parent code, corresponding owned TypeScript sources, declarations, source maps, public documentation and legal/support files, workspace templates, verified governance and the informational repair projection. Child packages come from verified tgz inventories with production dependencies only. Tests, development node_modules and private state are excluded. Markdown link destinations to packaged product documents become installation-local; prose and code examples remain unchanged.

After authorized integration, npm run components:lock records exact clean component commits and rejects mismatched index gitlinks. It never stages or commits. The immutable v0.1.0 and M0/M1 records remain historical evidence. Follow [testing](testing.md), [release delivery](github-release.md) and [authoring boundaries](architecture/0003-local-authoring.md); no new result is inferred from these instructions.
