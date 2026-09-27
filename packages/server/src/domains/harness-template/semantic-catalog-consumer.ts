import {readConfiguredSemanticCatalog, type SemanticConsumerSubject} from "./semantic-catalog-configuration.js";
import {inspectSemanticClosureMaterials} from "./semantic-closure-materials.js";
import {inspectSemanticLegacyMembership} from "./semantic-legacy-membership.js";
import {requireSemantic, type SemanticCatalogLimits} from "./semantic-catalog-contract.js";
import {freeze} from "./semantic-catalog-io.js";

/** Trusted server-composition primitive, not an HTTP/CLI handler. The caller
 * supplies configured paths and the current authenticated subject, never input
 * from a Catalog. Material checks cannot be replaced with a caller callback.
 * Reading valid evidence does not bind a project or authorize its execution.
 */
export async function readVerifiedSemanticCatalog(input: {
  registryConfigPath: string; policyPath: string; catalogId: string;
  currentSubject: () => SemanticConsumerSubject | Promise<SemanticConsumerSubject>;
  limits?: Partial<SemanticCatalogLimits>; signal?: AbortSignal;
}) {
  let materialEvidence: ReturnType<typeof inspectSemanticClosureMaterials> | undefined;
  let legacyEvidence: Awaited<ReturnType<typeof inspectSemanticLegacyMembership>> | undefined;
  const snapshot = await readConfiguredSemanticCatalog({...input,
    validateMaterials: async (candidate, context) => {
      context.operation.check();
      const material = inspectSemanticClosureMaterials(candidate);
      context.operation.check();
      const legacy = await inspectSemanticLegacyMembership({snapshot: candidate, ...context});
      context.operation.check();
      materialEvidence = material; legacyEvidence = legacy;
      return true;
    }});
  requireSemantic(materialEvidence && legacyEvidence, "MATERIAL_MISSING");
  return Object.freeze({...snapshot, verification: freeze({status: "CONFIGURED_MATERIALS_VERIFIED" as const,
    eligibleForExecution: false as const, sets: materialEvidence.sets,
    legacyCatalogDigest: legacyEvidence.catalogDigest, legacyMarkdownDigest: legacyEvidence.markdownDigest,
    legacyAssetFiles: legacyEvidence.assetFiles, totalMaterialBytes: legacyEvidence.totalMaterialBytes,
    limitations: materialEvidence.limitations,
    pending: ["project-and-execution-binding", "full-variant-and-acceptance-matrix"]})});
}
