import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {digestObject} from "../domains/harness-template/utils.js";
import type {createProjectSemanticDiscoveryService} from "./project-semantic-discovery.js";

type Candidates = Awaited<ReturnType<ReturnType<typeof createProjectSemanticDiscoveryService>["onboardingCandidates"]>>;

/** Pure Runtime-owned presentation of already verified choices. A recommended
 * mode never selects an asset, persists a review, upgrades legacy state or
 * confers Harness eligibility. Exact binding approval remains a separate flow. */
export function semanticOnboardingGuidance(input: Candidates) {
  const compatible = input.candidates.filter(c => c.status === "COMPATIBLE").length;
  const indeterminate = input.candidates.filter(c => c.status === "INDETERMINATE").length;
  const status = compatible > 1 ? "SELECTION_REQUIRED" : compatible === 1 ? "REVIEW_REQUIRED" :
    indeterminate ? "EVIDENCE_REQUIRED" : input.candidates.length ? "NO_COMPATIBLE_MATCH" : "NO_PUBLISHED_CANDIDATE";
  const result = {schema: "evopilot-project-semantic-onboarding/v1", projectId: input.projectId, projectRevisionDigest: input.projectRevisionDigest,
    catalogId: input.catalogId, candidatesDigest: input.candidatesDigest, candidates: input.candidates, compatibleCount: compatible,
    status, recommendedBindingMode: compatible ? "DUAL_BINDING_REVIEW" : "UNRESOLVED", selectedCandidate: null,
    existingBinding: null, businessField: null, productType: null,
    missingInputs: compatible ? ["artifactSetDigest", "bundleDigest"] : [],
    nextAction: compatible ? "select-exact-published-pair-then-prepare-review" : indeterminate ? "review-compatibility-evidence" : "review-semantic-gap",
    bindingCreated: false, preservesLegacyBindings: true, eligibleForExecution: false, grantsExecutionAuthority: false,
    requiresSeparateBindingApproval: true, maximumCandidates: input.maximumCandidates};
  return freeze({...result, onboardingDigest: digestObject(result)});
}
