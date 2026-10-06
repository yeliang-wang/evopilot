// Static release-pipeline wiring checks. Actual installed CLI assertions remain
// in verify-expert-public-install.mjs and do not gain acceptance authority here.
export function expertPublicCompatibilityChecks(workflow, verifier, version) {
  const lines = source => source.split(/\r?\n/).filter(line => !/^\s*(?:#|\/\/)/.test(line)).join("\n");
  const executableWorkflow = lines(workflow), executableVerifier = lines(verifier);
  const hosts = executableVerifier.match(/^export const packagedHosts = (\[[^\n]+\]);$/m);
  const loop = executableVerifier.match(/  for \(const host of packagedHosts\) \{\n(?:    [^\n]+\n)*    for \(const command of \["compatibility", "doctor"\]\) \{\n      for \(const runtime of (\[[^\n]+\])\) \{([\s\S]*?)\n      \}/);
  let hostNames = [];
  try { hostNames = JSON.parse(hosts?.[1] ?? "[]"); } catch { /* malformed wiring fails below */ }
  let versions = [];
  try { versions = JSON.parse(loop?.[1] ?? "[]"); } catch { /* malformed wiring fails below */ }
  const body = loop?.[2] ?? "";
  return [
    ["public-install-invocation", /^\s*node "\$GITHUB_WORKSPACE\/scripts\/verify-expert-public-install\.mjs" "\$INSTALL_DIR" "\$VERSION" "\$TARBALL"\s*$/m.test(executableWorkflow)],
    ["host-matrix", JSON.stringify(hostNames) === JSON.stringify(["codex", "claude-code", "workbuddy", "generic-agent", "generic-mcp"])],
    ["nested-command-matrix", Boolean(loop)],
    ["current-runtime-matrix", /^\d+\.\d+\.\d+$/.test(version) && versions.some(item => Array.isArray(item) && item.length === 1 && item[0] === version)],
    ["installed-command-execution", /^\s*const result = json\(\[command, host, \.\.\.runtime\]\);\s*$/m.test(body)],
    ["conformance-assertion", /^\s*assert\.equal\(compatibility\.conformanceStatus, "CONFORMANT"\);\s*$/m.test(body)],
    ["runtime-identity-assertion", /^\s*assert\.equal\(compatibility\.engineVersion, runtime\[0\] \?\? "6\.3\.0"\);\s*$/m.test(body)],
    ["expert-identity-assertion", /^\s*assert\.equal\(compatibility\.expertVersion, version\);\s*$/m.test(body)],
    ["core-identity-assertion", /^\s*assert\.equal\(compatibility\.coreDigest, core\.digest\);\s*$/m.test(body)],
    ["adapter-identity-assertion", /^\s*assert\.equal\(compatibility\.adapterDigest, adapter\.digest\);\s*$/m.test(body)]
  ].map(([id, passed]) => ({ id: `expert-compatibility:${id}`, status: passed ? "PASS" : "FAIL",
    message: passed ? "Current Runtime compatibility is wired to the exact public-install verifier" : `Missing executed public-install compatibility contract: ${id}` }));
}
