import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createExpertAdapter, expertCompatibility, expertDoctor } from "../../packages/evolution-expert/dist/index.js";

const cli = new URL("../../packages/evolution-expert/dist/cli.js", import.meta.url);
const run = (...args) => spawnSync(process.execPath, [cli.pathname, ...args], { encoding: "utf8" });
for (const host of ["codex", "claude-code", "workbuddy", "generic-agent", "generic-mcp"]) {
  for (const command of ["compatibility", "doctor"]) {
    test(`${command} ${host}: explicit and default Runtime use all generated capabilities`, () => {
      for (const runtime of [[], ["6.2.0"]]) {
        const result = run(command, host, ...runtime);
        assert.equal(result.status, 0, result.stderr);
        const value = JSON.parse(result.stdout);
        const adapter = createExpertAdapter(host);
        const expected = command === "doctor" ? expertDoctor(host, "6.2.0", adapter.requiredCapabilities) : expertCompatibility(adapter, "6.2.0", adapter.requiredCapabilities);
        assert.deepEqual(value, expected);
        assert.equal((value.compatibility ?? value).conformanceStatus, "CONFORMANT");
        assert.ok(adapter.requiredCapabilities.includes("host-native-secure-secret-input"));
      }
    });
    test(`${command} ${host}: unsupported and malformed Runtime versions fail closed`, () => {
      for (const version of ["5.0.0", "6.1.0", "7.0.0", "6.2.0invalid", "6.2", "06.2.0", "6.2.0-rc.1", ""]) {
        const result = run(command, host, version);
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.stdout, /"(?:status|conformanceStatus)": "(?:READY|CONFORMANT)"/);
      }
    });
  }
  test(`${host}: genuinely missing observed capability remains incompatible`, () => {
    const adapter = createExpertAdapter(host);
    for (const missing of adapter.requiredCapabilities) {
      const caps = adapter.requiredCapabilities.filter(x => x !== missing);
      assert.equal(expertCompatibility(adapter, "6.2.0", caps).conformanceStatus, "INCOMPATIBLE");
      assert.equal(expertDoctor(host, "6.2.0", caps).status, "INCOMPATIBLE");
    }
  });
}
test("CLI defaults to packaged generic-agent and rejects unknown Host without qualifying it", () => {
  for (const command of ["compatibility", "doctor"]) {
    assert.equal(run(command).status, 0);
    const result = run(command, "unknown-host", "6.2.0");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /UNKNOWN_PACKAGED_HOST/);
  }
  // SDK extension remains available; this patch limits only declared package CLI self-checks.
  assert.equal(createExpertAdapter("independent-host").host, "independent-host");
});
