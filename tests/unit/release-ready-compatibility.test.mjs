import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { expertPublicCompatibilityChecks } from "../../scripts/lib/expert-public-compatibility-contract.mjs";

const workflow = fs.readFileSync(new URL("../../.github/workflows/evolution-expert-release.yml", import.meta.url), "utf8");
const verifier = fs.readFileSync(new URL("../../scripts/verify-expert-public-install.mjs", import.meta.url), "utf8");
const version = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url))).version;
const failures = (w = workflow, v = verifier) => expertPublicCompatibilityChecks(w, v, version).filter(x => x.status === "FAIL").map(x => x.id);

test("release readiness follows the actual installed Expert compatibility matrix", () => {
  assert.deepEqual(failures(), []);
  assert.match(workflow, /evopilot-expert compatibility codex 6\.3\.2/);
});
test("a comment or incomplete verifier invocation cannot satisfy release readiness", () => {
  const command = 'node "$GITHUB_WORKSPACE/scripts/verify-expert-public-install.mjs" "$INSTALL_DIR" "$VERSION" "$TARBALL"';
  for (const replacement of [`# ${command}`, command.replace(' "$TARBALL"', '')])
    assert.ok(failures(workflow.replace(command, replacement)).includes("expert-compatibility:public-install-invocation"));
});
test("current Runtime must occur in the executed matrix, not an unrelated string", () => {
  const changed = verifier.replace(`["${version}"], `, "") + `\n// ["${version}"]\n`;
  assert.ok(failures(workflow, changed).includes("expert-compatibility:current-runtime-matrix"));
});
test("empty or incomplete command and Host loops cannot satisfy release readiness", () => {
  for (const replacement of ['[]', '["doctor"]', '["compatibility"]'])
    assert.ok(failures(workflow, verifier.replace('for (const command of ["compatibility", "doctor"]) {', `for (const command of ${replacement}) {`)).includes("expert-compatibility:nested-command-matrix"));
  assert.ok(failures(workflow, verifier.replace('for (const host of packagedHosts) {', 'for (const host of []) {')).includes("expert-compatibility:nested-command-matrix"));
  assert.ok(failures(workflow, verifier.replace('export const packagedHosts = ["codex", "claude-code", "workbuddy", "generic-agent", "generic-mcp"];', 'export const packagedHosts = [];')).includes("expert-compatibility:host-matrix"));
});
for (const [field, statement] of [
  ["installed-command-execution", "const result = json([command, host, ...runtime]);"],
  ["conformance-assertion", 'assert.equal(compatibility.conformanceStatus, "CONFORMANT");'],
  ["runtime-identity-assertion", 'assert.equal(compatibility.engineVersion, runtime[0] ?? "6.3.0");'],
  ["expert-identity-assertion", 'assert.equal(compatibility.expertVersion, version);'],
  ["core-identity-assertion", 'assert.equal(compatibility.coreDigest, core.digest);'],
  ["adapter-identity-assertion", 'assert.equal(compatibility.adapterDigest, adapter.digest);']
]) test(`release readiness rejects a missing ${field}`, () => {
  assert.ok(failures(workflow, verifier.replace(statement, `// ${statement}`)).includes(`expert-compatibility:${field}`));
});
