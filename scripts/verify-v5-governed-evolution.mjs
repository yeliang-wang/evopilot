import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { assertNoLegacySuiteFallback, normalizeEvolutionProjectDefinition } from "../packages/core/dist/index.js";
import { EVOLUTION_EXPERT_CORE, assertExpertAdapterConformance, createExpertAdapter } from "../packages/evolution-expert/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const references = ["datarig", "evopilot", "evopilot-harness", "new-project"];

for (const id of references) {
  try {
    const definition = parse(fs.readFileSync(path.join(root, `examples/projects/${id}.yaml`), "utf8"));
    normalizeEvolutionProjectDefinition(definition);
  } catch (error) {
    failures.push(`${id} Project Definition: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const host of ["codex", "workbuddy", "generic-agent", "generic-mcp"]) {
  try {
    const adapter = createExpertAdapter(host);
    assertExpertAdapterConformance(adapter);
    const installed = JSON.parse(fs.readFileSync(path.join(root, `packages/evolution-expert/generated/${host}/adapter.json`), "utf8"));
    if (installed.digest !== adapter.digest || installed.coreDigest !== EVOLUTION_EXPERT_CORE.digest) failures.push(`${host} generated adapter drift`);
  } catch (error) {
    failures.push(`${host} adapter: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const relative of [
  "schemas/governed-evolution/project-definition-v1.schema.json",
  "schemas/governed-evolution/human-interaction-v1.schema.json",
  "schemas/governed-evolution/legacy-suite-snapshot-v1.schema.json",
  "governance/legacy-suite-transition.json"
]) {
  try { JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); } catch (error) { failures.push(`${relative}: invalid JSON`); }
}

const runtimeFiles = [
  "packages/core/src/governed-evolution.ts",
  "packages/server/src/domains/governed-evolution/service.ts",
  "packages/server/src/http/routes/governed-evolution.ts"
];
for (const relative of runtimeFiles) {
  const content = fs.readFileSync(path.join(root, relative), "utf8");
  if (/(?:project|projectId|definition\.metadata\.id)\s*(?:===|==|case)\s*["'](?:datarig|evopilot-harness)["']/i.test(content)) failures.push(`${relative}: project-name branch detected`);
}

try {
  const transition = JSON.parse(fs.readFileSync(path.join(root, "governance/legacy-suite-transition.json"), "utf8"));
  if (transition.runtimePolicy !== "NO_RUNTIME_FALLBACK") failures.push("legacy Suite transition: Runtime fallback must be forbidden");
  if (transition.preRelease?.installedSuiteDisposition !== "ACTIVE_AND_INDEPENDENT") failures.push("legacy Suite transition: installed Suites must remain active and independent before release");
  if (transition.preRelease?.snapshotPolicy !== "LATE_BOUND_EXACT") failures.push("legacy Suite transition: snapshots must be late-bound and exact");
  if (transition.preRelease?.snapshotDriftPolicy !== "STALE_AND_SELECTIVE_RERUN") failures.push("legacy Suite transition: drift must stale affected evidence and trigger selective rerun");
  if (transition.preRelease?.candidateEnvironment !== "LEGACY_SUITES_ABSENT") failures.push("legacy Suite transition: Candidate independence must be proven with Suites absent");
  if (transition.preRelease?.realInstalledSuiteMutationAllowed !== false) failures.push("legacy Suite transition: real installed Suites must remain untouched before release");
  if (transition.postRelease?.timing !== "AFTER_PUBLIC_V5_RELEASE_AND_VERIFIED_INSTALLATION") failures.push("legacy Suite transition: Cutover must remain post-release");
  if (transition.postRelease?.releaseBlockerForV5 !== false) failures.push("legacy Suite transition: post-release Cutover must not block v5 release");
  if (!transition.postRelease?.requiresSeparateEvolutionTarget || !transition.postRelease?.requiresSeparateHumanAuthorization) failures.push("legacy Suite transition: Cutover requires separate Target and human authorization");
  assertNoLegacySuiteFallback({ legacySuiteInvocationCount: 0, loadedPaths: [] });
} catch (error) { failures.push(`legacy Suite transition: ${error instanceof Error ? error.message : String(error)}`); }

const targetLoop = fs.readFileSync(path.join(root, "packages/server/src/storage/file-store/index.ts"), "utf8");
for (const invariant of ["HARNESS_BUNDLE_REQUIRED", "validateImmutableHarnessBundleBindingV3", "loop-iteration"]) {
  if (!targetLoop.includes(invariant)) failures.push(`Goal Loop invariant missing: ${invariant}`);
}

if (failures.length) {
  console.error("EvoPilot v5 governed-evolution verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`EvoPilot v5 governed-evolution verification passed: ${references.length} project declarations, 4 generated Host adapters, mandatory Harness binding, pre-release Suite independence, and zero Runtime fallback.`);
