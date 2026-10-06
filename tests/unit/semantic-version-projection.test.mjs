import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {EVOPILOT_PRODUCT_VERSION_FALLBACK, EVOPILOT_CLI_VERSION_FALLBACK, EVOPILOT_HARNESS_GUIDED_RUNTIME_BOUNDARY} from "../../packages/contracts/dist/index.js";
import {EVOPILOT_EVOLUTION_EXPERT_VERSION, EVOLUTION_EXPERT_CORE, createExpertAdapter, expertCompatibility} from "../../packages/evolution-expert/dist/index.js";
const root = path.resolve(import.meta.dirname, "../.."), read = p => JSON.parse(fs.readFileSync(path.join(root, p)));
test("SDK compatibility reports the exact checked version and rejects coercible, malformed and prerelease versions", () => {
  const adapter = createExpertAdapter("codex");
  for (const version of ["6.2.0", "6.3.0", "6.3.1", "6.3.2", "6.3.3"]) {
    const report = expertCompatibility(adapter, version, adapter.requiredCapabilities);
    assert.equal(report.engineVersion, version); assert.equal(report.conformanceStatus, "CONFORMANT");
  }
  for (const version of ["6.3.0-rc.1", "6.3.0+build", "6.3.0invalid", "06.3.0", "6.3", " 6.3.0", "6.9007199254740992.0", "7.0.0"])
    assert.equal(expertCompatibility(adapter, version, adapter.requiredCapabilities).conformanceStatus, "INCOMPATIBLE");
});
test("source package and lock projections bind the declared independent Runtime/Expert pair", () => {
  const roadmap = read("governance/roadmap.yaml"), lock = read("package-lock.json");
  assert.equal(roadmap.versionPolicy.currentWorkingVersion, "6.3.3");
  assert.equal(roadmap.directSemanticConvergenceDeliveryPolicy.expertVersion, "2.3.0");
  assert.equal(read("package.json").version, "6.3.3"); assert.equal(lock.version, "6.3.3");
  for (const name of fs.readdirSync(path.join(root, "packages"))) {
    if (!fs.existsSync(path.join(root, "packages", name, "package.json"))) continue;
    const p = read(`packages/${name}/package.json`), expected = name === "evolution-expert" ? "2.3.1" : "6.3.3";
    assert.equal(p.version, expected); assert.equal(lock.packages[`packages/${name}`].version, expected);
    for (const [dependency, version] of Object.entries(p.dependencies ?? {}))
      if (dependency.startsWith("@evopilot/") && dependency !== "@evopilot/harness") assert.equal(version, name === "evolution-expert" ? "6.3.0" : "6.3.3");
  }
  assert.equal(EVOPILOT_PRODUCT_VERSION_FALLBACK, "6.3.3"); assert.equal(EVOPILOT_CLI_VERSION_FALLBACK, "6.3.3");
  assert.equal(EVOPILOT_HARNESS_GUIDED_RUNTIME_BOUNDARY.runtimeVersion, "6.3.3");
  assert.equal(EVOPILOT_EVOLUTION_EXPERT_VERSION, "2.3.1"); assert.equal(EVOLUTION_EXPERT_CORE.schema, "evopilot-evolution-expert-core/v3");
});
test("distribution declarations target 6.3.3 without publishing it or changing Dashboard", () => {
  const manifest = read("installers/manifest.json"); assert.equal(manifest.version, "6.3.3");
  for (const p of Object.values(manifest.packages)) {assert.equal(p.version, "6.3.3"); assert.equal(p.registryStatus, "not_published");}
  assert.equal(manifest.containers["evopilot-dashboard"], "ghcr.io/yeliang-wang/evopilot-dashboard:3.1.0");
  for (const name of ["install.sh", "install.ps1"])
    assert.equal(manifest.installers[name].sha256, createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex"));
});
