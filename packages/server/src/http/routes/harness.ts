import http from "node:http";

interface HarnessRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  requestId: string;
  traceId?: string;
  parentRequestId?: string;
  setRequestErrorCode: (code: string) => void;
  deps: Record<string, any>;
}

export async function handleHarnessRoutes(context: HarnessRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, requestId, traceId, parentRequestId, setRequestErrorCode } = context;
  const {
    advanceHarnessTemplateEvolutionRun,
    approveHarnessTemplateEvolutionRun,
    audit,
    canAccessScopedResource,
    createHarnessTemplateEvolutionRun,
    createTenantHarnessPolicyVersion,
    envelope,
    hasRole,
    harnessTemplateEvolutionLogMetadata,
    harnessTemplateEvolutionNextAction,
    harnessTemplateRef,
    hydrateHarnessTemplateEvolutionRun,
    impactReportForHarnessTemplate,
    isRecord,
    logInfo,
    logWarn,
    optionalTrimmedString,
    parseHarnessKnowledgeSources,
    parseHarnessTemplateApplyPayload,
    parseTenantHarnessPolicyPayload,
    publishHarnessTemplateEvolutionRun,
    readJson,
    requestCorrelation,
    resolveLoopLlmSelection,
    safeFileName,
    tenantHarnessPolicyLogMetadata,
    validateHarnessTemplateProfile,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/harness/template-evolutions") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope({
      schema: "evopilot-harness-template-evolution-list/v1",
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      evolutions: store.listHarnessTemplateEvolutionRuns(auth.tenantId, auth.workspaceId).map((run: any) => ({
        schema: run.schema,
        evolutionId: run.evolutionId,
        status: run.status,
        baseTemplateRef: run.baseTemplateRef,
        targetTemplateId: run.targetTemplateId,
        targetVersion: run.targetVersion,
        intent: run.intent,
        sourceCount: run.sources.length,
        snapshotCount: run.snapshots.length,
        draftVersion: run.draft?.version,
        publishedTemplateRef: run.publishedTemplateRef,
        blockers: run.blockers,
        warnings: run.warnings,
        updatedAt: run.updatedAt
      }))
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/harness/template-evolutions") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
    const run = createHarnessTemplateEvolutionRun(store, auth, body);
    const saved = store.writeHarnessTemplateEvolutionRun(run);
    logInfo("harness-template-evolution.created", {
      requestId,
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      actor: auth.actor,
      role: auth.role,
      outcome: "success",
      correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
      metadata: harnessTemplateEvolutionLogMetadata(saved, { nextAction: "advance-template-evolution" })
    });
    store.appendAudit(audit(auth, "harness-template-evolution.created", saved.evolutionId, {
      baseTemplateId: saved.baseTemplateRef.templateId,
      baseTemplateVersion: saved.baseTemplateRef.version,
      targetTemplateId: saved.targetTemplateId,
      targetVersion: saved.targetVersion,
      sourceCount: saved.sources.length
    }));
    return writeJson(response, 201, envelope({
      schema: "evopilot-harness-template-evolution-create-result/v1",
      status: saved.status,
      evolution: saved,
      nextAction: "advance-template-evolution",
      instruction: "HarnessTemplateEvolution is CREATED. Advance it to collect snapshots, analyze sources, and produce a reviewable DRAFT."
    }));
  }
  const harnessTemplateEvolutionMatch = url.pathname.match(/^\/api\/v1\/harness\/template-evolutions\/([^/]+)(?:\/(sources|advance|approve|publish|impact))?$/);
  if (harnessTemplateEvolutionMatch) {
    const evolutionId = safeFileName(decodeURIComponent(harnessTemplateEvolutionMatch[1]));
    const action = harnessTemplateEvolutionMatch[2];
    const run = store.readHarnessTemplateEvolutionRun(evolutionId);
    if (!run) return writeJson(response, 404, { error: "HARNESS_TEMPLATE_EVOLUTION_NOT_FOUND" });
    if (!canAccessScopedResource(auth, run.tenantId, run.workspaceId)) return writeJson(response, 403, { error: "HARNESS_TEMPLATE_EVOLUTION_FORBIDDEN" });
    if (request.method === "GET" && !action) {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      return writeJson(response, 200, envelope(run));
    }
    if (request.method === "POST" && action === "sources") {
      if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      if (run.status !== "CREATED") return writeJson(response, 409, { error: "HARNESS_TEMPLATE_EVOLUTION_SOURCES_LOCKED", detail: "Sources can only be added before snapshots are collected." });
      const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
      const nextSources = [...run.sources, ...parseHarnessKnowledgeSources(body)];
      const saved = store.writeHarnessTemplateEvolutionRun(hydrateHarnessTemplateEvolutionRun({ ...run, sources: nextSources, updatedAt: new Date().toISOString() }));
      return writeJson(response, 200, envelope({ schema: "evopilot-harness-template-evolution-source-result/v1", status: saved.status, evolution: saved, nextAction: "advance-template-evolution" }));
    }
    if (request.method === "POST" && action === "advance") {
      if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
      const advanced = await advanceHarnessTemplateEvolutionRun(store, run, auth, body, {
        resolveLlm: ({ run: evolutionRun, body: evolutionBody }: any) => {
          const requestedProfileId = optionalTrimmedString(evolutionBody.llmProfileId ?? evolutionBody.llmProfile);
          const requireLlm = store.requireLlm() || evolutionBody.requireLlm === true;
          const llmResolution = resolveLoopLlmSelection(store, {
            tenantId: evolutionRun.tenantId,
            workspaceId: evolutionRun.workspaceId,
            requestedProfileId,
            requireLlm
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
      const saved = store.writeHarnessTemplateEvolutionRun(advanced);
      const failed = saved.status === "BLOCKED";
      if (failed) setRequestErrorCode("HARNESS_TEMPLATE_EVOLUTION_BLOCKED");
      logInfo("harness-template-evolution.advanced", {
        requestId,
        tenantId: saved.tenantId,
        workspaceId: saved.workspaceId,
        actor: auth.actor,
        role: auth.role,
        outcome: failed ? "blocked" : "success",
        errorCode: failed ? "HARNESS_TEMPLATE_EVOLUTION_BLOCKED" : undefined,
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        diagnosis: failed ? {
          summary: "HarnessTemplateEvolution is blocked.",
          likelyCause: saved.blockers.join("; ") || "Draft validation failed or source extraction had no usable snapshots.",
          recommendedAction: "Inspect evolution.blockers, evolution.warnings, draft.validation, and source snapshot warnings; add or repair sources, then retry with a new evolution run if needed.",
          retriable: false,
          humanActionRequired: true
        } : undefined,
        metadata: harnessTemplateEvolutionLogMetadata(saved, { nextAction: harnessTemplateEvolutionNextAction(saved) })
      });
      store.appendAudit(audit(auth, "harness-template-evolution.advanced", saved.evolutionId, {
        status: saved.status,
        sourceCount: saved.sources.length,
        snapshotCount: saved.snapshots.length,
        draftVersion: saved.draft?.version,
        blockers: saved.blockers
      }));
      return writeJson(response, failed ? 409 : 200, envelope({
        schema: "evopilot-harness-template-evolution-advance-result/v1",
        status: saved.status,
        evolution: saved,
        nextAction: harnessTemplateEvolutionNextAction(saved)
      }));
    }
    if (request.method === "POST" && action === "approve") {
      if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
      const approved = approveHarnessTemplateEvolutionRun(run, body, auth);
      const saved = store.writeHarnessTemplateEvolutionRun(approved);
      store.appendAudit(audit(auth, "harness-template-evolution.approved", saved.evolutionId, {
        targetTemplateId: saved.targetTemplateId,
        targetVersion: saved.targetVersion,
        confirmedBy: saved.review?.confirmedBy
      }));
      return writeJson(response, 200, envelope({
        schema: "evopilot-harness-template-evolution-approve-result/v1",
        status: saved.status,
        evolution: saved,
        nextAction: "publish-template-evolution"
      }));
    }
    if (request.method === "POST" && action === "publish") {
      if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
      const published = publishHarnessTemplateEvolutionRun(store, run, body, auth);
      const saved = store.writeHarnessTemplateEvolutionRun(published);
      logInfo("harness-template-evolution.published", {
        requestId,
        tenantId: saved.tenantId,
        workspaceId: saved.workspaceId,
        actor: auth.actor,
        role: auth.role,
        outcome: "success",
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        metadata: harnessTemplateEvolutionLogMetadata(saved, { nextAction: "review-impact-report" })
      });
      store.appendAudit(audit(auth, "harness-template-evolution.published", saved.evolutionId, {
        templateId: saved.publishedTemplateRef?.templateId,
        templateVersion: saved.publishedTemplateRef?.version,
        templateDigest: saved.publishedTemplateRef?.digest,
        staleProfileCount: saved.impactReport?.staleProfileCount
      }));
      return writeJson(response, 201, envelope({
        schema: "evopilot-harness-template-evolution-publish-result/v1",
        status: saved.status,
        evolution: saved,
        template: saved.draft?.template,
        impactReport: saved.impactReport,
        nextAction: "review-impact-report"
      }));
    }
    if ((request.method === "GET" || request.method === "POST") && action === "impact") {
      if (request.method === "GET" && !hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      if (request.method === "POST" && !hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const templateRef = run.publishedTemplateRef ?? (run.draft ? harnessTemplateRef(run.draft.template) : run.baseTemplateRef);
      const report = request.method === "POST" ? impactReportForHarnessTemplate(store, templateRef, run.tenantId, run.workspaceId) : run.impactReport ?? impactReportForHarnessTemplate(store, templateRef, run.tenantId, run.workspaceId);
      const saved = request.method === "POST"
        ? store.writeHarnessTemplateEvolutionRun(hydrateHarnessTemplateEvolutionRun({ ...run, impactReport: report, status: run.status === "PUBLISHED" ? "IMPACT_ANALYZED" : run.status, updatedAt: new Date().toISOString() }))
        : run;
      if (request.method === "POST") {
        logInfo("harness-template-evolution.impact-analyzed", {
          requestId,
          tenantId: saved.tenantId,
          workspaceId: saved.workspaceId,
          actor: auth.actor,
          role: auth.role,
          outcome: "success",
          correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
          metadata: harnessTemplateEvolutionLogMetadata(saved, {
            nextAction: report.staleProfileCount > 0 ? "generate-project-harness-profile-upgrade-drafts" : "no-project-profile-action-required"
          })
        });
        store.appendAudit(audit(auth, "harness-template-evolution.impact-analyzed", saved.evolutionId, {
          templateId: report.templateRef.templateId,
          templateVersion: report.templateRef.version,
          templateDigest: report.templateRef.digest,
          affectedProjectProfileCount: report.affectedProjectProfiles.length,
          staleProfileCount: report.staleProfileCount
        }));
      }
      return writeJson(response, 200, envelope({
        schema: "evopilot-harness-template-evolution-impact-result/v1",
        status: saved.status,
        evolutionId: run.evolutionId,
        impactReport: report,
        nextAction: report.staleProfileCount > 0 ? "generate-project-harness-profile-upgrade-drafts" : "no-project-profile-action-required"
      }));
    }
  }
  if (request.method === "GET" && url.pathname === "/api/v1/harness/templates") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope({
      schema: "evopilot-harness-template-set/v1",
      templates: store.listHarnessTemplates()
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/harness/templates/validate") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const template = parseHarnessTemplateApplyPayload(body, auth.actor);
    const validation = validateHarnessTemplateProfile(template);
    const status = validation.status === "VALIDATED" ? 200 : 422;
    return writeJson(response, status, envelope({
      schema: "evopilot-harness-template-validation-result/v1",
      status: validation.status,
      template,
      validation,
      instruction: validation.status === "VALIDATED"
        ? "HarnessTemplate is valid for pack publishing."
        : "Fix HarnessTemplate validation blockers before publishing."
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/harness/templates") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const force = isRecord(body) && body.force === true;
    const template = parseHarnessTemplateApplyPayload(body, auth.actor);
    const previous = store.readHarnessTemplate(template.id, template.version);
    if (previous && !force) {
      setRequestErrorCode("HARNESS_TEMPLATE_VERSION_EXISTS");
      logWarn("harness-template.apply.rejected", {
        requestId,
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        actor: auth.actor,
        role: auth.role,
        outcome: "blocked",
        errorCode: "HARNESS_TEMPLATE_VERSION_EXISTS",
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        diagnosis: {
          summary: "HarnessTemplate version already exists.",
          likelyCause: `${template.id}@${template.version} is already stored in the control plane.`,
          recommendedAction: "Publish a new template version, or retry with force=true only for an intentional replacement.",
          retriable: false,
          humanActionRequired: true
        },
        metadata: {
          templateId: template.id,
          templateVersion: template.version,
          templateDigest: template.digest,
          previousDigest: previous.digest,
          nextAction: "publish-new-template-version-or-force-replace"
        }
      });
      return writeJson(response, 409, {
        error: "HARNESS_TEMPLATE_VERSION_EXISTS",
        detail: `HarnessTemplate ${template.id}@${template.version} already exists. Use force=true only for an intentional replacement, or publish a new version.`
      });
    }
    const saved = store.writeHarnessTemplate(template);
    logInfo("harness-template.applied", {
      requestId,
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      actor: auth.actor,
      role: auth.role,
      outcome: "success",
      correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
      metadata: {
        templateId: saved.id,
        templateVersion: saved.version,
        templateDigest: saved.digest,
        languageFamily: saved.languageFamily,
        scope: saved.scope,
        action: previous ? "REPLACED_VERSION" : "CREATED_VERSION",
        force,
        changelogCount: saved.changelog.length,
        nextAction: "generate-or-upgrade-project-harness-profile"
      }
    });
    store.appendAudit(audit(auth, "harness-template.applied", `${saved.id}@${saved.version}`, {
      templateId: saved.id,
      version: saved.version,
      digest: saved.digest,
      action: previous ? "REPLACED_VERSION" : "CREATED_VERSION",
      force,
      changelog: saved.changelog.filter((entry: any) => entry.version === saved.version).map((entry: any) => entry.summary)
    }));
    return writeJson(response, previous ? 200 : 201, envelope({
      schema: "evopilot-harness-template-apply-result/v1",
      action: previous ? "REPLACED_VERSION" : "CREATED_VERSION",
      template: saved,
      previousTemplate: previous,
      instruction: "HarnessTemplate version is stored in the control plane. Existing ProjectHarnessProfiles keep their templateRef until an administrator generates or upgrades a new profile revision."
    }));
  }
  const harnessTemplateMatch = url.pathname.match(/^\/api\/v1\/harness\/templates\/([^/]+)$/);
  if (request.method === "GET" && harnessTemplateMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const template = store.readHarnessTemplate(decodeURIComponent(harnessTemplateMatch[1]), url.searchParams.get("version") ?? undefined);
    if (!template) return writeJson(response, 404, { error: "HARNESS_TEMPLATE_NOT_FOUND" });
    return writeJson(response, 200, envelope(template));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/harness/policies") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope({
      schema: "evopilot-tenant-harness-policy-list/v1",
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      policies: store.listTenantHarnessPolicySummaries(auth.tenantId, auth.workspaceId)
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/harness/policies") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const parsed = parseTenantHarnessPolicyPayload(body, auth.tenantId, auth.workspaceId);
    const candidate = createTenantHarnessPolicyVersion(store, auth.tenantId, auth.workspaceId, {
      source: parsed.source,
      sourceFormat: parsed.sourceFormat,
      actor: auth.actor,
      changelog: parsed.changelog,
      status: "VALIDATED"
    });
    if (candidate.validation.status !== "VALIDATED") {
      setRequestErrorCode("TENANT_HARNESS_POLICY_VALIDATION_FAILED");
      logWarn("tenant-harness-policy.validation.failed", {
        requestId,
        category: "harness",
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        actor: auth.actor,
        role: auth.role,
        outcome: "blocked",
        errorCode: "TENANT_HARNESS_POLICY_VALIDATION_FAILED",
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        diagnosis: {
          summary: "TenantHarnessPolicy validation failed.",
          likelyCause: candidate.validation.blockers.join("; ") || "Tenant harness policy did not declare a valid private project contract.",
          recommendedAction: "Inspect validation.checks and validation.blockers, edit the policy source, then rerun harness policy apply.",
          retriable: false,
          humanActionRequired: true
        },
        metadata: tenantHarnessPolicyLogMetadata(candidate, { nextAction: "edit-policy-source" })
      });
      return writeJson(response, 409, envelope({
        schema: "evopilot-tenant-harness-policy-apply-result/v1",
        status: "FAILED",
        validation: candidate.validation,
        candidate
      }));
    }
    const saved = store.writeTenantHarnessPolicyVersion(candidate);
    logInfo("tenant-harness-policy.applied", {
      requestId,
      category: "harness",
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      actor: auth.actor,
      role: auth.role,
      outcome: "success",
      correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
      metadata: tenantHarnessPolicyLogMetadata(saved, { nextAction: "activate-reviewed-policy" })
    });
    store.appendAudit(audit(auth, "tenant-harness-policy.applied", `${saved.policyId}/v${saved.version}`, {
      policyId: saved.policyId,
      version: saved.version,
      sourceDigest: saved.sourceDigest,
      compiledDigest: saved.compiledDigest,
      validation: saved.validation.status
    }));
    return writeJson(response, 201, envelope({
      schema: "evopilot-tenant-harness-policy-apply-result/v1",
      status: "VALIDATED",
      policy: saved,
      summary: store.tenantHarnessPolicySummary(saved.tenantId, saved.workspaceId, saved.policyId),
      instruction: "TenantHarnessPolicy is stored as a validated version. Activate it explicitly before it constrains new ProjectHarnessProfile validation and goal planning."
    }));
  }
  const tenantHarnessPolicyVersionMatch = url.pathname.match(/^\/api\/v1\/harness\/policies\/([^/]+)\/versions\/(\d+)$/);
  if (request.method === "GET" && tenantHarnessPolicyVersionMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const policyId = safeFileName(decodeURIComponent(tenantHarnessPolicyVersionMatch[1]));
    const version = store.readTenantHarnessPolicyVersion(auth.tenantId, auth.workspaceId, policyId, Number(tenantHarnessPolicyVersionMatch[2]));
    if (!version) return writeJson(response, 404, { error: "TENANT_HARNESS_POLICY_VERSION_NOT_FOUND" });
    return writeJson(response, 200, envelope(version));
  }
  const tenantHarnessPolicyActionMatch = url.pathname.match(/^\/api\/v1\/harness\/policies\/([^/]+)\/(activate)$/);
  if (tenantHarnessPolicyActionMatch) {
    const policyId = safeFileName(decodeURIComponent(tenantHarnessPolicyActionMatch[1]));
    if (request.method === "POST" && tenantHarnessPolicyActionMatch[2] === "activate") {
      if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
      const versions = store.listTenantHarnessPolicyVersions(auth.tenantId, auth.workspaceId, policyId);
      const selectedVersion = Number(body.version ?? versions[versions.length - 1]?.version ?? 0);
      if (!selectedVersion) return writeJson(response, 404, { error: "TENANT_HARNESS_POLICY_VERSION_NOT_FOUND" });
      const activated = store.activateTenantHarnessPolicyVersion(auth.tenantId, auth.workspaceId, policyId, selectedVersion, auth.actor);
      if (!activated) return writeJson(response, 404, { error: "TENANT_HARNESS_POLICY_VERSION_NOT_FOUND" });
      logInfo("tenant-harness-policy.activated", {
        requestId,
        category: "harness",
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        actor: auth.actor,
        role: auth.role,
        outcome: "success",
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        metadata: tenantHarnessPolicyLogMetadata(activated, { nextAction: "generate-or-upgrade-project-harness-profile" })
      });
      store.appendAudit(audit(auth, "tenant-harness-policy.activated", `${policyId}/v${activated.version}`, {
        policyId,
        version: activated.version,
        sourceDigest: activated.sourceDigest,
        compiledDigest: activated.compiledDigest
      }));
      return writeJson(response, 200, envelope({
        schema: "evopilot-tenant-harness-policy-activate-result/v1",
        status: "ACTIVE",
        policy: activated,
        summary: store.tenantHarnessPolicySummary(auth.tenantId, auth.workspaceId, policyId)
      }));
    }
  }
  const tenantHarnessPolicyMatch = url.pathname.match(/^\/api\/v1\/harness\/policies\/([^/]+)$/);
  if (request.method === "GET" && tenantHarnessPolicyMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const policyId = safeFileName(decodeURIComponent(tenantHarnessPolicyMatch[1]));
    const selectedVersion = url.searchParams.get("version") ? Number(url.searchParams.get("version")) : undefined;
    const policy = selectedVersion
      ? store.readTenantHarnessPolicyVersion(auth.tenantId, auth.workspaceId, policyId, selectedVersion)
      : store.readActiveTenantHarnessPolicy(auth.tenantId, auth.workspaceId, policyId) ?? store.listTenantHarnessPolicyVersions(auth.tenantId, auth.workspaceId, policyId).at(-1);
    if (!policy) return writeJson(response, 404, { error: "TENANT_HARNESS_POLICY_NOT_FOUND" });
    return writeJson(response, 200, envelope(policy));
  }


  return false;
}
