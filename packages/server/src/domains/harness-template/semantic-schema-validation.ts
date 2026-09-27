import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { semanticConsumptionSchemas } from "./semantic-schemas.js";
import { isRecord, digestObject } from "./utils.js";
import { requireSemantic } from "./semantic-catalog-contract.js";

const validators = new Map<string, ValidateFunction>();
const ajv = new Ajv2020({strict: true, allErrors: false, ownProperties: true,
  coerceTypes: false, useDefaults: false, removeAdditional: false});
// Compile only checked-in schemas; no $data, custom keywords, remote loading,
// content-provided schemas or mutation/coercion of received materials.
export function validateSemanticDocument(value: unknown): void {
  requireSemantic(isRecord(value), "MATERIAL_INVALID");
  let name: string | undefined;
  if (typeof value.schema === "string" && /^evopilot-harness-[a-z-]+\/v1$/.test(value.schema)) {
    name = value.schema.replace(/^evopilot-harness-/, "").replace("/v1", "-v1");
  } else if (value.apiVersion === "harness.evopilot.io/v3" && ["HarnessComponent", "HarnessProfile", "HarnessBundle"].includes(String(value.kind))) {
    name = "harness-asset-v3";
  } else if (value.apiVersion === "semantics.evopilot.io/v1" &&
    ["DomainOntologyPack", "ProductOntologyPack", "OrganizationOntologyPack", "ProjectOntologyOverlay", "DomainHarnessPack"].includes(String(value.kind))) {
    name = "professional-pack-v1";
  }
  requireSemantic(name && Object.hasOwn(semanticConsumptionSchemas, name), "UNSUPPORTED");
  let validate = validators.get(name);
  if (!validate) {validate = ajv.compile(semanticConsumptionSchemas[name]); validators.set(name, validate);}
  requireSemantic(validate(value) === true, "MATERIAL_INVALID");
  if (value.kind === "HarnessBundle" && isRecord(value.spec) && value.spec.semanticRequirements != null) {
    requireSemantic(isRecord(value.spec.semanticRequirements), "MATERIAL_INVALID");
    const requirements = {...value.spec.semanticRequirements}, recorded = requirements.requirementsDigest;
    delete requirements.requirementsDigest;
    requireSemantic(recorded === digestObject(requirements), "DIGEST_MISMATCH");
  }
}
