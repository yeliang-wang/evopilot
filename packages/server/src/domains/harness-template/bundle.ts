import type { GoalPlanSelectedHarnessBinding, GoalTarget } from "../../model.js";
import type { PublishedHarnessCandidate } from "@evopilot/core";
import { harnessTemplateDomainError } from "./errors.js";
import type {
  HarnessBundleAssetV3,
  HarnessCatalogScanResult,
  HarnessComponentAssetV3,
  HarnessProfileAssetV3
} from "./types.js";
import { canonicalJson, uniqueStrings } from "./utils.js";

export interface HarnessBundleSelectionV3 {
  profile: HarnessProfileAssetV3;
  bundle: HarnessBundleAssetV3;
  components: HarnessComponentAssetV3[];
  reasons: string[];
  candidateScores: Array<{
    profileId: string;
    version: string;
    score: number;
    catalogPriority: number;
    reasons: string[];
  }>;
}

export function publishedHarnessCandidatesV5(input: {
  profiles: HarnessProfileAssetV3[];
  bundles: HarnessBundleAssetV3[];
  components: HarnessComponentAssetV3[];
}): PublishedHarnessCandidate[] {
  return input.bundles.map((bundle) => {
    const profile = input.profiles.find((candidate) => candidate.metadata.id === bundle.spec.profile.id
      && candidate.metadata.version === bundle.spec.profile.version
      && candidate.catalogRef?.entryDigest === bundle.spec.profile.digest
      && candidate.catalogRef?.catalogId === bundle.catalogRef?.catalogId);
    const components = bundle.spec.resolvedComponents.map((ref) => input.components.find((candidate) => candidate.metadata.id === ref.id
      && candidate.metadata.version === ref.version
      && candidate.catalogRef?.entryDigest === ref.digest
      && candidate.catalogRef?.catalogId === bundle.catalogRef?.catalogId));
    const complete = components.every(Boolean);
    const resolved = components.filter((component): component is HarnessComponentAssetV3 => Boolean(component));
    return {
      profile: {
        id: profile?.metadata.id ?? bundle.spec.profile.id,
        version: profile?.metadata.version ?? bundle.spec.profile.version,
        digest: profile?.catalogRef?.entryDigest ?? bundle.spec.profile.digest,
        catalogId: bundle.catalogRef?.catalogId ?? "missing",
        catalogDigest: bundle.catalogRef?.catalogDigest ?? "missing",
        registryDigest: bundle.catalogRef?.registryDigest ?? "missing",
        domains: profile ? [profile.spec.classification.domain] : [],
        taskClasses: profile ? [profile.spec.classification.taskClass] : [],
        positiveConcepts: profile?.spec.match.positiveConcepts ?? [],
        negativeConcepts: uniqueStrings([...(profile?.spec.match.negativeConcepts ?? []), ...(profile?.spec.boundary.outOfScope ?? [])]),
        requiredProjectLabels: Object.fromEntries(Object.entries(profile?.metadata.labels ?? {}).filter(([key]) => key.startsWith("project.required.")).map(([key, value]) => [key.slice("project.required.".length), value]))
      },
      bundle: {
        id: bundle.metadata.id,
        version: bundle.metadata.version,
        digest: bundle.catalogRef?.entryDigest ?? "missing",
        profileDigest: bundle.spec.profile.digest,
        componentDigests: bundle.spec.resolvedComponents.map((ref) => ref.digest),
        requiredEvidence: uniqueStrings([...(profile?.spec.acceptance.requiredEvidence ?? []), ...bundle.spec.evidence, ...resolved.flatMap((component) => component.spec.evidence)]),
        validators: uniqueStrings([...(profile?.spec.acceptance.blockingValidators ?? []), ...bundle.spec.validators, ...resolved.flatMap((component) => component.spec.validators.map((validator) => validator.id))]),
        constraints: uniqueStrings([...bundle.spec.constraints, ...resolved.flatMap((component) => component.spec.constraints)]),
        capabilities: uniqueStrings(resolved.map((component) => component.spec.capability)),
        permissions: uniqueStrings(resolved.flatMap((component) => component.spec.actions.map((action) => action.id)))
      },
      published: bundle.metadata.lifecycle === "published" && profile?.metadata.lifecycle === "published",
      eligible: Boolean(profile && complete && bundle.catalogRef?.entryDigest && bundle.catalogRef?.catalogDigest && bundle.catalogRef?.registryDigest),
      priority: bundle.catalogRef?.registryCatalogPriority ?? 0
    };
  });
}

export function selectPublishedHarnessBundleV3(input: {
  profiles: HarnessProfileAssetV3[];
  bundles: HarnessBundleAssetV3[];
  components: HarnessComponentAssetV3[];
  contextText: string;
}): HarnessBundleSelectionV3 | undefined {
  const allCandidates = input.profiles.map((profile) => {
    const scored = scorePublishedHarnessProfileV3(profile, input.contextText);
    const profileDigest = profile.catalogRef?.entryDigest;
    const bundle = input.bundles
      .filter((candidate) => candidate.spec.profile.id === profile.metadata.id
        && candidate.spec.profile.version === profile.metadata.version
        && candidate.spec.profile.digest === profileDigest
        && candidate.catalogRef?.catalogId === profile.catalogRef?.catalogId)
      .sort((left, right) => compareVersions(right.metadata.version, left.metadata.version))[0];
    const resolvedComponents = bundle ? bundle.spec.resolvedComponents.map((ref) => input.components.find((component) =>
      component.metadata.id === ref.id
      && component.metadata.version === ref.version
      && component.catalogRef?.entryDigest === ref.digest
      && component.catalogRef?.catalogId === bundle.catalogRef?.catalogId
    )).filter((component): component is HarnessComponentAssetV3 => Boolean(component)) : [];
    return {
      profile,
      bundle,
      components: resolvedComponents,
      score: bundle && resolvedComponents.length === bundle.spec.resolvedComponents.length ? scored.score : 0,
      catalogPriority: bundle?.catalogRef?.registryCatalogPriority ?? profile.catalogRef?.registryCatalogPriority ?? 0,
      reasons: bundle ? scored.reasons : [...scored.reasons, "bundle=missing"]
    };
  });
  const candidates = allCandidates.filter((candidate) => candidate.bundle && candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.catalogPriority !== left.catalogPriority) return right.catalogPriority - left.catalogPriority;
      if (left.profile.metadata.id === right.profile.metadata.id) {
        return compareVersions(right.profile.metadata.version, left.profile.metadata.version);
      }
      return left.profile.metadata.id.localeCompare(right.profile.metadata.id);
    });
  const selected = candidates[0];
  if (!selected?.bundle) return undefined;
  const runnerUp = candidates[1];
  if (runnerUp && runnerUp.score === selected.score && runnerUp.catalogPriority === selected.catalogPriority) {
    throw harnessTemplateDomainError(409, "HARNESS_PROFILE_MATCH_AMBIGUOUS", `HarnessProfiles ${selected.profile.metadata.id}@${selected.profile.metadata.version} and ${runnerUp.profile.metadata.id}@${runnerUp.profile.metadata.version} are tied at score=${selected.score}; refine the Project Definition or GoalTarget.`);
  }
  return {
    profile: selected.profile,
    bundle: selected.bundle,
    components: selected.components,
    reasons: selected.reasons.length > 0 ? selected.reasons : ["profileMatch=classification"],
    candidateScores: allCandidates.sort((left, right) => right.score - left.score || right.catalogPriority - left.catalogPriority || left.profile.metadata.id.localeCompare(right.profile.metadata.id)).slice(0, 12).map((candidate) => ({
      profileId: candidate.profile.metadata.id,
      version: candidate.profile.metadata.version,
      score: candidate.score,
      catalogPriority: candidate.catalogPriority,
      reasons: candidate.reasons
    }))
  };
}

export function scorePublishedHarnessProfileV3(
  profile: HarnessProfileAssetV3,
  contextText: string
): { score: number; reasons: string[] } {
  const negativeMatches = uniqueStrings([
    ...profile.spec.match.negativeConcepts,
    ...profile.spec.boundary.outOfScope
  ]).filter((concept) => conceptMatchesContext(contextText, concept));
  if (negativeMatches.length > 0) {
    return { score: 0, reasons: negativeMatches.slice(0, 5).map((concept) => `negativeConcept=${concept}`) };
  }
  let score = 0;
  const reasons: string[] = [];
  const classification = profile.spec.classification;
  for (const concept of uniqueStrings([classification.domain, classification.role, classification.taskClass])) {
    if (!conceptMatchesContext(contextText, concept)) continue;
    score += concept === classification.domain ? 120 : 35;
    reasons.push(`classification=${concept}`);
  }
  for (const concept of profile.spec.match.positiveConcepts) {
    if (!conceptMatchesContext(contextText, concept)) continue;
    score += 24;
    reasons.push(`positiveConcept=${concept}`);
  }
  for (const scope of profile.spec.boundary.inScope) {
    if (!conceptMatchesContext(contextText, scope)) continue;
    score += 12;
    reasons.push(`inScope=${scope}`);
  }
  return { score, reasons: uniqueStrings(reasons).slice(0, 16) };
}

export function immutableHarnessBundlePlanBinding(
  selection: HarnessBundleSelectionV3 | undefined,
  now: string
): GoalPlanSelectedHarnessBinding | undefined {
  if (!selection) return undefined;
  const { profile, bundle, components } = selection;
  const catalogRef = bundle.catalogRef;
  const bundleDigest = catalogRef?.entryDigest;
  if (!bundleDigest) {
    throw harnessTemplateDomainError(409, "HARNESS_BUNDLE_BINDING_INVALID", `HarnessBundle ${bundle.metadata.id}@${bundle.metadata.version} is missing its Catalog digest.`);
  }
  const requiredEvidence = uniqueStrings([
    ...profile.spec.acceptance.requiredEvidence,
    ...bundle.spec.evidence,
    ...components.flatMap((component) => component.spec.evidence)
  ]);
  const validators = uniqueStrings([
    ...profile.spec.acceptance.blockingValidators,
    ...bundle.spec.validators,
    ...components.flatMap((component) => component.spec.validators.map((validator) => validator.id))
  ]);
  const layer = profile.spec.classification.taskClass === "runtime-task"
    ? "runtime"
    : profile.spec.classification.taskClass === "domain-task"
      ? "domain"
      : "composite";
  return {
    schema: "evopilot-goal-plan-selected-harness-binding/v2",
    bindingMode: "immutable-bundle",
    harnessId: bundle.metadata.id,
    version: bundle.metadata.version,
    domain: profile.spec.classification.domain,
    layer,
    status: "PUBLISHED",
    bundleRef: { id: bundle.metadata.id, version: bundle.metadata.version, digest: bundleDigest },
    profileRef: { ...bundle.spec.profile, digest: bundle.spec.profile.digest },
    resolvedComponents: bundle.spec.resolvedComponents.map((ref) => ({ ...ref, digest: ref.digest })),
    executionPlan: [...bundle.spec.executionPlan],
    constraints: uniqueStrings([...bundle.spec.constraints, ...components.flatMap((component) => component.spec.constraints)]),
    requiredEvidence,
    validators,
    capabilities: uniqueStrings(components.map((component) => component.spec.capability)),
    selectionMode: "catalog-auto-match",
    selectionReasons: selection.reasons,
    selectionCandidates: selection.candidateScores.map((candidate) => ({ ...candidate, selected: candidate.profileId === profile.metadata.id && candidate.version === profile.metadata.version })),
    catalogId: catalogRef?.catalogId,
    catalogSource: catalogRef?.catalogSource,
    catalogDigest: catalogRef?.catalogDigest,
    entryPath: catalogRef?.entryPath,
    entryDigest: bundleDigest,
    registryPath: catalogRef?.registryPath,
    registryDigest: catalogRef?.registryDigest,
    registryCatalogPriority: catalogRef?.registryCatalogPriority,
    registryCatalogRelease: catalogRef?.registryCatalogRelease,
    evidence: [
      "bindingMode=immutable-bundle",
      `bundle=${bundle.metadata.id}@${bundle.metadata.version}`,
      `bundleDigest=${bundleDigest}`,
      `profile=${bundle.spec.profile.id}@${bundle.spec.profile.version}`,
      `profileDigest=${bundle.spec.profile.digest}`,
      ...bundle.spec.resolvedComponents.map((ref) => `component=${ref.id}@${ref.version};digest=${ref.digest};required=${ref.required === true}`),
      ...bundle.spec.executionPlan.map((step, index) => `executionPlan[${index}]=${step}`),
      ...selection.reasons.map((reason) => `selectionReason=${reason}`),
      ...(catalogRef ? [
        `catalogId=${catalogRef.catalogId}`,
        `catalogDigest=${catalogRef.catalogDigest}`,
        `catalogEntry=${catalogRef.entryPath}`,
        `catalogEntryDigest=${catalogRef.entryDigest}`,
        ...(catalogRef.registryPath ? [`registryPath=${catalogRef.registryPath}`] : []),
        ...(catalogRef.registryDigest ? [`registryDigest=${catalogRef.registryDigest}`] : []),
        ...(catalogRef.registryCatalogPriority !== undefined ? [`registryCatalogPriority=${catalogRef.registryCatalogPriority}`] : []),
        ...(catalogRef.registryCatalogRelease ? [`registryCatalogRelease=${catalogRef.registryCatalogRelease}`] : [])
      ] : [])
    ],
    boundAt: now
  };
}

export function validateImmutableHarnessBundleBindingV3(input: {
  scans: HarnessCatalogScanResult[];
  binding: GoalPlanSelectedHarnessBinding;
}): {
  bundle: HarnessBundleAssetV3;
  profile: HarnessProfileAssetV3;
  components: HarnessComponentAssetV3[];
  evidence: string[];
} | undefined {
  const { binding } = input;
  if (binding.bindingMode !== "immutable-bundle") return undefined;
  if (!binding.bundleRef || !binding.profileRef || !binding.catalogId) {
    throw harnessTemplateDomainError(409, "HARNESS_BUNDLE_BINDING_INVALID", "Immutable HarnessBundle binding requires bundleRef, profileRef, and catalogId.");
  }
  const matchingScans = input.scans.filter((scan) => scan.mount.catalogId === binding.catalogId || scan.catalog?.catalogId === binding.catalogId);
  const scan = matchingScans.find((candidate) => candidate.status === "READY" && candidate.format === "asset-v3");
  if (!scan) {
    const detail = matchingScans.map((candidate) => candidate.error).filter(Boolean).join("; ") || `Catalog ${binding.catalogId} is not available as a valid v3 Catalog.`;
    const code = /digest mismatch/i.test(detail) ? "HARNESS_BUNDLE_DIGEST_MISMATCH" : "HARNESS_BUNDLE_BINDING_INVALID";
    throw harnessTemplateDomainError(409, code, detail);
  }
  const sameBundleVersion = scan.bundles.find((candidate) => candidate.metadata.id === binding.bundleRef?.id && candidate.metadata.version === binding.bundleRef?.version);
  const bundle = scan.bundles.find((candidate) => candidate.metadata.id === binding.bundleRef?.id
    && candidate.metadata.version === binding.bundleRef?.version
    && candidate.catalogRef?.entryDigest === binding.bundleRef?.digest);
  if (!bundle) {
    const actual = sameBundleVersion?.catalogRef?.entryDigest ?? "missing";
    throw harnessTemplateDomainError(409, "HARNESS_BUNDLE_DIGEST_MISMATCH", `HarnessBundle ${binding.bundleRef.id}@${binding.bundleRef.version} expected=${binding.bundleRef.digest} actual=${actual}.`);
  }
  if (bundle.spec.profile.id !== binding.profileRef.id
    || bundle.spec.profile.version !== binding.profileRef.version
    || bundle.spec.profile.digest !== binding.profileRef.digest) {
    throw harnessTemplateDomainError(409, "HARNESS_BUNDLE_BINDING_INVALID", `HarnessBundle ${binding.bundleRef.id}@${binding.bundleRef.version} Profile binding differs from the published Bundle.`);
  }
  const profile = scan.profiles.find((candidate) => candidate.metadata.id === binding.profileRef?.id
    && candidate.metadata.version === binding.profileRef?.version
    && candidate.catalogRef?.entryDigest === binding.profileRef?.digest);
  if (!profile) {
    throw harnessTemplateDomainError(409, "HARNESS_BUNDLE_DIGEST_MISMATCH", `HarnessProfile ${binding.profileRef.id}@${binding.profileRef.version} no longer matches digest ${binding.profileRef.digest}.`);
  }
  if (canonicalJson(binding.resolvedComponents ?? []) !== canonicalJson(bundle.spec.resolvedComponents)) {
    throw harnessTemplateDomainError(409, "HARNESS_BUNDLE_BINDING_INVALID", `HarnessBundle ${binding.bundleRef.id}@${binding.bundleRef.version} resolved Component binding differs from the published Bundle.`);
  }
  const components = bundle.spec.resolvedComponents.map((ref) => scan.components.find((candidate) => candidate.metadata.id === ref.id
    && candidate.metadata.version === ref.version
    && candidate.catalogRef?.entryDigest === ref.digest))
    .filter((component): component is HarnessComponentAssetV3 => Boolean(component));
  if (components.length !== bundle.spec.resolvedComponents.length) {
    throw harnessTemplateDomainError(409, "HARNESS_BUNDLE_DIGEST_MISMATCH", `HarnessBundle ${binding.bundleRef.id}@${binding.bundleRef.version} has a missing or modified Component.`);
  }
  const expectedConstraints = uniqueStrings([...bundle.spec.constraints, ...components.flatMap((component) => component.spec.constraints)]);
  const expectedEvidence = uniqueStrings([...profile.spec.acceptance.requiredEvidence, ...bundle.spec.evidence, ...components.flatMap((component) => component.spec.evidence)]);
  const expectedValidators = uniqueStrings([
    ...profile.spec.acceptance.blockingValidators,
    ...bundle.spec.validators,
    ...components.flatMap((component) => component.spec.validators.map((validator) => validator.id))
  ]);
  const immutableFields: Array<[string, unknown, unknown]> = [
    ["executionPlan", binding.executionPlan ?? [], bundle.spec.executionPlan],
    ["constraints", binding.constraints ?? [], expectedConstraints],
    ["requiredEvidence", binding.requiredEvidence ?? [], expectedEvidence],
    ["validators", binding.validators ?? [], expectedValidators],
    ["capabilities", binding.capabilities, uniqueStrings(components.map((component) => component.spec.capability))]
  ];
  for (const [field, actual, expected] of immutableFields) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw harnessTemplateDomainError(409, "HARNESS_BUNDLE_BINDING_INVALID", `Immutable HarnessBundle binding field ${field} differs from the published Bundle closure.`);
    }
  }
  return {
    bundle,
    profile,
    components,
    evidence: [
      `harnessBundle=${bundle.metadata.id}@${bundle.metadata.version}`,
      `harnessBundleDigest=${binding.bundleRef.digest}`,
      `harnessProfile=${profile.metadata.id}@${profile.metadata.version}`,
      `harnessProfileDigest=${binding.profileRef.digest}`,
      ...bundle.spec.resolvedComponents.map((ref) => `harnessComponent=${ref.id}@${ref.version};digest=${ref.digest}`),
      ...bundle.spec.executionPlan.map((step, index) => `harnessExecutionPlan[${index}]=${step}`),
      `harnessCatalog=${binding.catalogId}`,
      `harnessCatalogPlanningDigest=${binding.catalogDigest ?? "missing"}`,
      `harnessCatalogCurrentDigest=${scan.catalog?.catalogDigest ?? "missing"}`
    ]
  };
}

export function applySelectedHarnessBindingToGoalTargets(
  targets: GoalTarget[],
  selectedHarness?: GoalPlanSelectedHarnessBinding
): GoalTarget[] {
  if (!selectedHarness) return targets;
  const immutableBundle = selectedHarness.bindingMode === "immutable-bundle";
  return targets.map((target) => ({
    ...target,
    acceptanceCriteria: uniqueStrings([
      ...target.acceptanceCriteria,
      ...(target.layer === "harness" && immutableBundle
        ? [
          ...(selectedHarness.constraints ?? []).map((constraint) => `Harness constraint: ${constraint}`),
          ...(selectedHarness.validators ?? []).map((validator) => `Harness validator must pass: ${validator}`)
        ]
        : [])
    ]),
    requiredEvidence: uniqueStrings([
      ...(target.requiredEvidence ?? []),
      ...(target.layer === "harness" ? selectedHarness.requiredEvidence ?? [] : []),
      ...(immutableBundle ? ["harness-bundle-binding"] : [])
    ]),
    evidence: uniqueStrings([
      ...target.evidence,
      `selectedHarness=${selectedHarness.harnessId}@${selectedHarness.version}`,
      `selectedHarnessBindingMode=${selectedHarness.bindingMode}`,
      ...(selectedHarness.bundleRef ? [`selectedHarnessBundleDigest=${selectedHarness.bundleRef.digest}`] : []),
      ...(selectedHarness.profileRef ? [`selectedHarnessProfileDigest=${selectedHarness.profileRef.digest}`] : []),
      ...(selectedHarness.executionPlan ?? []).map((step, index) => `selectedHarnessExecutionPlan[${index}]=${step}`)
    ])
  }));
}

function conceptMatchesContext(contextText: string, concept: string): boolean {
  const normalized = concept.trim().toLowerCase();
  if (!normalized) return false;
  const variants = uniqueStrings([normalized, normalized.replace(/[-_]+/g, " "), normalized.replace(/[\s_]+/g, "-")]);
  return variants.some((variant) => selectionTextIncludes(contextText, variant));
}

function selectionTextIncludes(contextText: string, signal: string): boolean {
  const normalized = signal.trim().toLowerCase();
  if (!normalized) return false;
  if (/^[a-z0-9+#.]+$/.test(normalized) && normalized.length <= 4) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`).test(contextText);
  }
  return contextText.includes(normalized);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split(/[.-]/).map((part) => Number(part)).map((part) => Number.isFinite(part) ? part : 0);
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return left.localeCompare(right);
}
