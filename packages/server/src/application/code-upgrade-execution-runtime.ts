import { CodeUpgraderClient, type CodeUpgraderRunStatus } from "@evopilot/adapter-code-upgrader";
import { applyReviewDecision, type ProjectProfile } from "@evopilot/core";
import type { AuthContext, CodeUpgradeEvent, CodeUpgradeRun, ProjectCodeContext, RuntimeConfig, StoredProject } from "../model.js";
import { httpError } from "../http/errors.js";
import { logInfo } from "../http/server-logging.js";
import { audit } from "../runtime/runtime-auth.js";
import type { FileStore } from "../storage/file-store/index.js";
import { approveSourceScope, assertSourceScopeAccess, parseSourceScopeInput, resolveSourceScope, sourceScopeBindingMatches, sourceScopeDigest, sourceScopeRepositoryDigest, validateSourceScopeResult } from "./code-upgrade-source-scope.js";

export interface ReviewSourceScopeArgs {
  store: FileStore;
  auth: AuthContext;
  currentAuth?: () => AuthContext;
  reviewId: string;
  input: unknown;
  profile: ProjectProfile;
  runtime: RuntimeConfig;
  decidedAt: string;
  note: string;
}

type CollectSourceContext = (args: {
  store: FileStore;
  project?: StoredProject;
  runtime: RuntimeConfig;
  profile: ProjectProfile;
  sourceScopeFiles?: string[];
}) => Promise<ProjectCodeContext>;

interface UpgradeRefreshDependencies {
  inferCodeUpgradePhase: (message: string) => string;
  terminalCodeUpgradeFailureReason: (status: CodeUpgraderRunStatus, events: CodeUpgradeEvent[]) => string | undefined;
  terminalCodeUpgradeError: (status: CodeUpgraderRunStatus, events: CodeUpgradeEvent[]) => string | undefined;
  dedupeEvents: (events: CodeUpgradeEvent[]) => CodeUpgradeEvent[];
}

export async function prepareReviewSourceScopeWithContext(args: ReviewSourceScopeArgs, collectProjectCodeContext: CollectSourceContext) {
  const {store, auth, reviewId, profile, runtime, decidedAt} = args;
  const input = parseSourceScopeInput(args.input);
  const readCurrent = () => {
    const principal = args.currentAuth?.() ?? auth;
    if (!["operator", "admin"].includes(principal.role)) throw httpError(403, "CODE_UPGRADE_SCOPE_FORBIDDEN");
    const run = store.findRunByReviewId(reviewId), review = run?.reviews.find(item => item.id === reviewId);
    const project = review ? store.readProject(review.projectId) : undefined;
    assertSourceScopeAccess(principal, project);
    const plan = run?.plans.find(item => item.id === review?.planId);
    if (!run || !review || !plan) throw httpError(409, "CODE_UPGRADE_SCOPE_OWNER_MISMATCH");
    return {run, review, project, plan, auth: principal};
  };
  const initial = readCurrent();
  // Validate ownership, grammar, policy and compare-and-set before any Git IO.
  const provisional = approveSourceScope({...initial, profile, input, sourceCommit: input.sourceCommit, decidedAt});
  const observed = await collectProjectCodeContext({store, project: initial.project, runtime, profile, sourceScopeFiles: input.files});
  if (observed.status !== "AVAILABLE") throw httpError(409, "CODE_UPGRADE_SCOPE_SOURCE_UNAVAILABLE");
  const current = readCurrent();
  if (sourceScopeRepositoryDigest(current.project) !== provisional.repositoryDigest || sourceScopeDigest(current.plan) !== provisional.planDigest) throw httpError(409, "CODE_UPGRADE_SCOPE_BINDING_STALE");
  const scope = approveSourceScope({...current, profile, input, sourceCommit: observed.commitSha, decidedAt});
  // No awaited operation between final compare-and-set and persisted decision.
  const updated = applyReviewDecision(current.review, {action: "accept", actor: current.auth.actor, note: args.note, decidedAt, codeUpgradeSourceScope: scope});
  current.run.reviews[current.run.reviews.findIndex(item => item.id === reviewId)] = updated;
  store.writeRun(current.run);
  store.appendAudit(audit(current.auth, "review.decided", reviewId, {action: "accept", projectId: scope.projectId, planId: scope.planId,
    sourceScopeApprovalDigest: scope.approvalDigest, sourceCommit: scope.sourceCommit, repositoryDigest: scope.repositoryDigest,
    fileListDigest: sourceScopeDigest(scope.files), fileCount: scope.files.length}));
  return updated;
}

export async function refreshCodeUpgradeRunWithDependencies(dependencies: UpgradeRefreshDependencies, store: FileStore, codeUpgradeRunId: string, profile?: ProjectProfile, auth?: AuthContext, currentAuth?: () => AuthContext): Promise<CodeUpgradeRun | undefined> {
  const {inferCodeUpgradePhase, terminalCodeUpgradeFailureReason, terminalCodeUpgradeError, dedupeEvents} = dependencies;
  const run = store.readCodeUpgradeRun(codeUpgradeRunId);
  if (!run) return undefined;
  if (run.sourceScope) {
    auth = currentAuth?.() ?? auth;
    if (!auth) throw httpError(403, "CODE_UPGRADE_SCOPE_FORBIDDEN");
    assertSourceScopeAccess(auth, store.readProject(run.projectId));
  }
  if (run.status === "SUCCEEDED" || run.status === "FAILED" || run.status === "CANCELED") return run;
  const connector = store.readCodeUpgraderConnector(run.codeUpgrader.connectorId);
  if (!connector) return run;
  const snapshot = await new CodeUpgraderClient(connector).readCodeUpgradeSnapshot(run.codeUpgrader.conversationId, Boolean(run.sourceScope));
  if (run.sourceScope) {auth = currentAuth?.() ?? auth; if (!auth) throw httpError(403, "CODE_UPGRADE_SCOPE_FORBIDDEN"); assertSourceScopeAccess(auth, store.readProject(run.projectId));}
  let scopeFailure: string | undefined;
  const snapshotAcknowledged = !run.sourceScope || Boolean(run.sourceScopeBinding && sourceScopeBindingMatches(run.sourceScopeBinding, snapshot.sourceScopeBinding));
  if (!snapshotAcknowledged) {scopeFailure = "CODE_UPGRADE_SCOPE_PROVIDER_ACK_MISMATCH_UNCERTAIN"; snapshot.status = "FAILED";}
  if (run.sourceScope && !scopeFailure && snapshot.changedFiles !== undefined) {
    try {
      if (!(snapshot.status !== "SUCCEEDED" && Array.isArray(snapshot.changedFiles) && snapshot.changedFiles.length === 0)) validateSourceScopeResult(run.sourceScope, snapshot.changedFiles);
    } catch (error) {scopeFailure = error instanceof Error ? error.message : "CODE_UPGRADE_SCOPE_RESULT_INVALID"; snapshot.status = "FAILED";}
  }
  if (run.sourceScope && snapshot.status === "SUCCEEDED") {
    try {
      const parent = store.findRunByDeliveryId(run.deliveryPlanId), project = store.readProject(run.projectId);
      const plan = parent?.plans.find(item => item.id === run.planId), review = parent?.reviews.find(item => item.id === run.reviewId);
      if (!project || !plan || !review || !profile || !auth) throw httpError(409, "CODE_UPGRADE_SCOPE_OWNER_MISMATCH");
      resolveSourceScope({auth,
        project, plan, review, profile, approvalDigest: run.sourceScope.approvalDigest, proposalMarkdown: run.proposalMarkdown});
      validateSourceScopeResult(run.sourceScope, snapshot.changedFiles);
    } catch (error) { scopeFailure = error instanceof Error ? error.message : "CODE_UPGRADE_SCOPE_RESULT_INVALID"; snapshot.status = "FAILED"; }
  }
  const events = [
    ...store.listCodeUpgradeEvents(run.id).filter((event) => event.source === "evopilot"),
    ...snapshot.events.map((event, index): CodeUpgradeEvent => ({
      id: event.id || `code-upgrader-${run.id}-${index}`,
      codeUpgradeRunId: run.id,
      timestamp: event.timestamp ?? new Date().toISOString(),
      source: event.source ?? "code-upgrader",
      phase: event.phase ?? inferCodeUpgradePhase(event.message),
      level: event.level ?? "info",
      message: event.message,
      raw: event.raw
    }))
  ];
  if (scopeFailure) events.push({id: `event-${run.id}-scope-rejected`, codeUpgradeRunId: run.id, timestamp: new Date().toISOString(), source: "evopilot", phase: "验证代码范围", level: "error",
    message: scopeFailure, raw: {reportedArtifactsDigest: sourceScopeDigest({changedFiles: snapshot.changedFiles, diff: snapshot.diff}), sourceScopeApprovalDigest: run.sourceScope?.approvalDigest, authority: "NONE"}});
  const updated: CodeUpgradeRun = {
    ...run,
    status: snapshot.status,
    ...(run.sourceScope ? {sourceScopeAcknowledgement: {startMatched: run.sourceScopeAcknowledgement?.startMatched === true, snapshotMatched: snapshotAcknowledged, ...(!snapshotAcknowledged ? {effectsUncertain: true} : {})}} : {}),
    codeUpgrader: {
      ...run.codeUpgrader,
      workspaceId: snapshot.workspaceId ?? run.codeUpgrader.workspaceId
    },
    artifacts: {
      ...run.artifacts,
      diffPath: snapshot.diff && !scopeFailure ? store.writeCodeUpgradeDiff(run.id, snapshot.diff) : run.artifacts.diffPath,
      branchName: snapshot.branchName ?? run.artifacts.branchName,
      commitSha: snapshot.commitSha ?? run.artifacts.commitSha,
      pullRequestUrl: snapshot.pullRequestUrl ?? run.artifacts.pullRequestUrl,
      changedFiles: !scopeFailure ? snapshot.changedFiles ?? run.artifacts.changedFiles : run.artifacts.changedFiles
    },
    failureReason: scopeFailure ?? terminalCodeUpgradeFailureReason(snapshot.status, events) ?? run.failureReason,
    error: scopeFailure ?? terminalCodeUpgradeError(snapshot.status, events) ?? run.error,
    updatedAt: new Date().toISOString()
  };
  store.writeCodeUpgradeRun(updated);
  store.writeCodeUpgradeEvents(run.id, dedupeEvents(events));
  if (updated.status !== run.status) {
    logInfo("code-upgrade.status-changed", {
      target: updated.id,
      metadata: {
        projectId: updated.projectId,
        deliveryPlanId: updated.deliveryPlanId,
        previousStatus: run.status,
        status: updated.status,
        conversationId: updated.codeUpgrader.conversationId,
        changedFileCount: updated.artifacts.changedFiles?.length ?? 0,
        commitSha: updated.artifacts.commitSha,
        pullRequestUrl: updated.artifacts.pullRequestUrl,
        failureReason: updated.failureReason,
        error: updated.error
      }
    });
  }
  return updated;
}

