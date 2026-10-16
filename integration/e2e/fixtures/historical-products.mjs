// TEST ONLY. Seeds synthetic v0.2 records for historical regression/readback.
// These factories are deliberately absent from all product exports and packages.
// Current native behavior is exercised by native-*.test.mjs, never by this fixture.
import { loadInstalledProducts } from '../../../dist/integration/composition.js';
import { createRuntimeService as runtime } from '../../../projects/evopilot-runtime/tests/fixtures/historical-runtime-v020.mjs';
import { createHistoricalFixtureService as harness } from '../../../projects/evopilot-harness/tests/fixtures/v020-service.mjs';
import { createOntologyService as ontology } from '../../../projects/evopilot-ontology/tests/fixtures/historical-v020/dist/service.js';
const pick = (value, keys) => Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => keys.includes(key)));
export const createHistoricalRuntime = (options, providers) => runtime(options, pick(providers, ['resolveOntology', 'resolveHarness', 'execute', 'inspectReceipt', 'timeoutMs']));
export const createHistoricalHarness = (options, providers) => harness(options, pick(providers, ['resolveOntology']));
export const createHistoricalOntology = (options, providers) => ontology(options, pick(providers, ['resolveLegacyHarness', 'resolveClassificationSource', 'classificationAdvisor', 'classificationModel']));
export async function historicalProducts() {
  const apis = await loadInstalledProducts();
  return { runtime: { ...apis.runtime, createRuntimeService: createHistoricalRuntime }, harness: { ...apis.harness, createHarnessService: createHistoricalHarness }, ontology: { ...apis.ontology, createOntologyService: createHistoricalOntology } };
}
