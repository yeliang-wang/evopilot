import type {evaluateProjectSemanticCompatibility} from "../domains/harness-template/semantic-compatibility.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {digestObject} from "../domains/harness-template/utils.js";

/** Internal projection of verified Runtime compatibility, never client diagnosis
 * or producer authority. A mismatch identifies a review destination, not blame. */
export function projectSemanticGap(report: ReturnType<typeof evaluateProjectSemanticCompatibility>, provenance: {
  projectId: string; projectRevisionDigest: string; catalogId: string; inspectionDigest: string;
}) {
  const destinations: Record<string, string> = {
    REQUIREMENTS_NOT_DECLARED: "HARNESS_DECLARATION_REVIEW",
    FOUNDATION_MISMATCH: "CROSS_CONTRACT_REVIEW",
    REQUIRED_CONCEPT_MISSING: "ONTOLOGY_MATERIAL_REVIEW", REQUIRED_META_TYPE_MISMATCH: "ONTOLOGY_MATERIAL_REVIEW",
    PROHIBITED_CONCEPT_PRESENT: "ONTOLOGY_MATERIAL_REVIEW", EXPLICIT_RELATION_MISSING: "ONTOLOGY_MATERIAL_REVIEW",
    EVIDENCE_REQUIREMENTS_UNVERIFIED: "EVIDENCE_QUALIFICATION", EXTERNAL_REASONER_UNVERIFIED: "REASONING_QUALIFICATION"
  };
  requireSemantic(report.reasons.every(reason => Object.hasOwn(destinations, reason)), "INVALID");
  const content = {schema: "evopilot-project-semantic-gap/v1", ...provenance, scope: report.scope,
    status: report.status === "COMPATIBLE" ? "NO_DECLARED_COMPATIBILITY_GAP" : "REVIEW_REQUIRED",
    compatibilityStatus: report.status, compatibilityDigest: report.compatibilityDigest,
    artifactSetDigest: report.artifactSetDigest, bundleRef: report.bundleRef,
    findings: report.reasons.map(reason => ({reason, destination: destinations[reason]})),
    details: {missingRequiredConceptIds: report.missingRequiredConceptIds, mismatchedMetaTypeConceptIds: report.mismatchedMetaTypeConceptIds,
      presentProhibitedConceptIds: report.presentProhibitedConceptIds, missingRelations: report.missingRelations},
    businessField: null, productType: null, selectedSuccessor: null, bindingCreated: false, eligibleForExecution: false,
    successorHandoff: {mode: "EXTERNAL_PRODUCER_REVIEW_ONLY", action: "MIGRATE", destinationKind: "PREPARED_REVIEW_DIGEST",
      requiredInputs: ["publishedCatalogId", "artifactSetDigest", "bundleDigest", "expectedHeadDigest", "reviewDigest"],
      steps: ["producer-review-and-separate-authorized-publication", "exact-published-pair-compatibility", "prepare-project-binding-review",
        "read-current-activation-head", "prepare-explicit-migration-review", "separate-exact-human-transition-approval", "readback-current-activation"],
      preservesExistingRunPins: true, grantsExecutionAuthority: false},
    authority: {maySelect: false, mayModify: false, mayApprove: false, mayPublish: false, mayBind: false, mayExecute: false},
    limitations: ["compatibility-only-not-business-truth-or-harness-eligibility", "review-destination-is-not-defect-attribution",
      "unverified-evidence-and-reasoning-remain-unresolved", "no-automatic-successor-selection-or-existing-run-rewrite"]};
  return freeze({...content, gapDigest: digestObject(content)});
}
