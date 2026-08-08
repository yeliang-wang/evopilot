interface HarnessEvolveWorkflowContext {
  auth: any;
  body: Record<string, unknown>;
  deps: Record<string, any>;
  parentRequestId?: string;
  requestId: string;
  store: any;
  traceId?: string;
  url: URL;
}

type HarnessEvolveWorkflowResult =
  | { statusCode: number; body: Record<string, unknown> }
  | { statusCode: number; error: Record<string, unknown> };

export async function runHarnessEvolveWorkflow(context: HarnessEvolveWorkflowContext): Promise<HarnessEvolveWorkflowResult> {
  const { auth, body, deps, parentRequestId, requestId, store, traceId, url } = context;
  const {
    advanceHarnessTemplateEvolutionRun,
    audit,
    canAccessScopedResource,
    createHarnessTemplateEvolutionRun,
    harnessTemplateEvolutionLogMetadata,
    harnessTemplateEvolutionNextAction,
    logInfo,
    optionalTrimmedString,
    requestCorrelation,
    resolveLoopLlmSelection,
    safeFileName
  } = deps;
  const resumeEvolutionId = optionalTrimmedString(body.resumeEvolutionId ?? body.resume);
  let saved: any;
  const steps: Record<string, unknown>[] = [];
  const workflowMode = resumeEvolutionId ? "resume" : "create";

  if (resumeEvolutionId) {
    const existing = store.readHarnessTemplateEvolutionRun(safeFileName(resumeEvolutionId));
    if (!existing) return { statusCode: 404, error: { error: "HARNESS_TEMPLATE_EVOLUTION_NOT_FOUND" } };
    if (!canAccessScopedResource(auth, existing.tenantId, existing.workspaceId)) return { statusCode: 403, error: { error: "HARNESS_TEMPLATE_EVOLUTION_FORBIDDEN" } };
    saved = existing;
    steps.push({ action: "resume", status: saved.status, nextAction: harnessTemplateEvolutionNextAction(saved) });
  } else {
    const created = createHarnessTemplateEvolutionRun(store, auth, {
      ...body,
      intent: optionalTrimmedString(body.intent ?? body.goal ?? body.objective ?? body.description),
      autoMatch: body.autoMatch ?? true
    });
    saved = store.writeHarnessTemplateEvolutionRun(created);
    steps.push({ action: "create", status: saved.status, nextAction: harnessTemplateEvolutionNextAction(saved) });
    store.appendAudit(audit(auth, "harness-template-evolution.workflow-created", saved.evolutionId, {
      baseTemplateId: saved.baseTemplateRef.templateId,
      baseTemplateVersion: saved.baseTemplateRef.version,
      targetTemplateId: saved.targetTemplateId,
      targetVersion: saved.targetVersion,
      autoMatchDecision: saved.autoMatch?.decision,
      autoMatchConfidence: saved.autoMatch?.confidence,
      sourceCount: saved.sources.length
    }));
  }

  const lowConfidenceStop = saved.autoMatch?.nextAction === "confirm-template-match-or-override" && body.advanceLowConfidence !== true;
  for (let index = 0; !lowConfidenceStop && index < 5 && ["CREATED", "SOURCES_COLLECTED", "ANALYZED"].includes(saved.status); index += 1) {
    const advanced = await advanceHarnessTemplateEvolutionRun(store, saved, auth, body, {
      resolveLlm: ({ run: evolutionRun, body: evolutionBody }: any) => {
        const requestedProfileId = optionalTrimmedString(evolutionBody.llmProfileId ?? evolutionBody.llmProfile);
        const requireLlm = store.requireLlm() || evolutionBody.requireLlm === true;
        const llmResolution = resolveLoopLlmSelection(store, {
          tenantId: evolutionRun.tenantId,
          workspaceId: evolutionRun.workspaceId,
          requestedProfileId,
          requireLlm,
          actor: auth
        });
        return {
          client: store.resolveGoalPlanLlmClient(llmResolution.selection),
          selection: {
            profileId: llmResolution.selection.profileId,
            provider: llmResolution.selection.provider,
            model: llmResolution.selection.model
          },
          requireLlm
        };
      }
    });
    saved = store.writeHarnessTemplateEvolutionRun(advanced);
    steps.push({ action: "advance", status: saved.status, nextAction: harnessTemplateEvolutionNextAction(saved) });
    store.appendAudit(audit(auth, "harness-template-evolution.workflow-advanced", saved.evolutionId, {
      status: saved.status,
      sourceCount: saved.sources.length,
      snapshotCount: saved.snapshots.length,
      draftVersion: saved.draft?.version,
      blockers: saved.blockers
    }));
    if (saved.status === "BLOCKED") break;
  }

  const nextAction = lowConfidenceStop ? "confirm-template-match-or-override" : harnessTemplateEvolutionNextAction(saved);
  logInfo("harness-template-evolution.workflow.completed", {
    requestId,
    tenantId: saved.tenantId,
    workspaceId: saved.workspaceId,
    actor: auth.actor,
    role: auth.role,
    outcome: saved.status === "BLOCKED" ? "blocked" : "success",
    correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
    metadata: harnessTemplateEvolutionLogMetadata(saved, { workflowMode, stepCount: steps.length, nextAction })
  });
  return {
    statusCode: workflowMode === "create" ? 201 : 200,
    body: {
      schema: "evopilot-harness-evolve-result/v1",
      status: saved.status,
      evolutionId: saved.evolutionId,
      evolution: saved,
      autoMatch: saved.autoMatch,
      draft: saved.draft,
      sourceCoverage: saved.draft?.sourceCoverage,
      validation: saved.draft?.validation,
      diffFromBase: saved.draft?.diffFromBase,
      workflow: { mode: workflowMode, defaultStop: "REVIEW_REQUIRED", steps },
      nextAction,
      instruction: lowConfidenceStop
        ? "Harness evolve stopped before source advancement because auto-match requires administrator confirmation. Review autoMatch candidates or rerun with explicit base/target overrides."
        : saved.status === "REVIEW_REQUIRED"
          ? "Harness evolve produced a reviewable HarnessTemplateEvolution DRAFT. Show source coverage, validation, diff, and draft pack to an administrator before approval or publishing."
          : "Harness evolve stopped at the current lifecycle boundary. Inspect evolution.status, blockers, warnings, and nextAction before continuing."
    }
  };
}
