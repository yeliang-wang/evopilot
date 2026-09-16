import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("README embeds a reviewed architecture asset with independent model and authority boundaries", () => {
  const readme = fs.readFileSync(new URL("README.md", root), "utf8");
  const svg = fs.readFileSync(new URL("docs/assets/architecture/evopilot-agent-native-architecture.svg", root), "utf8");
  const png = fs.readFileSync(new URL("docs/assets/architecture/evopilot-agent-native-architecture.png", root));
  assert.match(readme, /!\[EvoPilot Agent-Native Lifecycle Control Plane architecture\]\(docs\/assets\/architecture\/evopilot-agent-native-architecture\.svg\)/);
  for (const term of ["Third-party AI Agent Host", "Evolution Expert", "MCP Client", "EvoPilot Runtime", "RuntimeReadiness", "Governed LLM Profiles", "Runtime LLM", "Qualified External Agent Runtime", "Agent Model", "Project Systems", "HarnessBundle"]) {
    assert.match(svg, new RegExp(term));
  }
  assert.match(svg, /No bundled LLM/);
  assert.match(svg, /read-only supply/);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
