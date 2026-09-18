const assert = require("node:assert/strict");

// Support historical product-keyed releases and the Target gate's repository-keyed map.
// The explicit Expert product and version binding prevent a Runtime release from qualifying.
exports.verifyExpertReleaseVersion = function (target, version) {
  assert.equal(target.release?.product, "evopilot-evolution-expert", "Expert release product mismatch");
  const versions = target.release?.versions ?? {};
  const selected = versions["evopilot-evolution-expert"] ?? versions.evopilot;
  assert.equal(selected, version, "Expert release version mismatch");
  if (versions["evopilot-evolution-expert"] !== undefined && versions.evopilot !== undefined) assert.equal(versions.evopilot, selected, "conflicting release version keys");
  assert.ok(target.roadmapBindings?.some(binding => binding.project === "evopilot" && binding.releaseProduct === "evopilot-evolution-expert" && binding.targetVersion === version), "Expert release must bind its own Target version");
  return selected;
};
