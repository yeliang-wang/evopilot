import type { CodeUpgradeSourceScopeApproval, EvolutionPlan, ProjectProfile, ReviewRecord } from "@evopilot/core";
import { validateProtectedPaths } from "@evopilot/core";
import type { CodeUpgraderSourceScopeBinding } from "@evopilot/adapter-code-upgrader";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AuthContext, StoredProject } from "../model.js";
import { httpError } from "../http/errors.js";

const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object"
  ? `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(",")}}` : JSON.stringify(v);
export const sourceScopeDigest = (v: unknown): string => `sha256:${createHash("sha256").update(stable(v)).digest("hex")}`;
export const sourceScopeTextDigest = (v: string): string => `sha256:${createHash("sha256").update(v).digest("hex")}`;
const hash = (v: unknown): v is string => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const fail = (code: string, status = 409): never => { throw httpError(status, `CODE_UPGRADE_SCOPE_${code}`); };
const denied = new Set([".git", "node_modules", "dist", "build", "target", ".venv", "__pycache__"]);

export function exactSourceFiles(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) fail("FILES_INVALID", 400);
  let bytes = 0;
  const files = (value as unknown[]).map(v => {
    if (typeof v !== "string" || !v || v.trim() !== v || Buffer.byteLength(v) > 1024 || /[\\:*?\[\]{}\x00-\x1f\x7f]/.test(v)) fail("FILES_INVALID", 400);
    const name = v as string, parts = name.split("/");
    if (parts.some(x => !x || x === "." || x === ".." || denied.has(x.toLowerCase()))) fail("FILES_INVALID", 400);
    bytes += Buffer.byteLength(name);
    return name;
  }).sort();
  if (bytes > 65536 || new Set(files).size !== files.length || files.some((f, i) => files.slice(i + 1).some(next => next.startsWith(f + "/")))) fail("FILES_INVALID", 400);
  return files;
}

export interface SourceScopeInput {
  schema: "evopilot-code-upgrade-source-scope/v1";
  expectedReviewDigest: string;
  sourceCommit: string;
  proposalDigest: string;
  files: string[];
}
export function parseSourceScopeInput(value: unknown): SourceScopeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INPUT_INVALID", 400);
  const v = value as Record<string, unknown>, keys = ["schema", "expectedReviewDigest", "sourceCommit", "proposalDigest", "files"];
  if (Object.keys(v).length !== keys.length || !keys.every(k => Object.hasOwn(v, k)) || v.schema !== "evopilot-code-upgrade-source-scope/v1" || !hash(v.expectedReviewDigest) || !hash(v.proposalDigest) || typeof v.sourceCommit !== "string" || !/^[a-f0-9]{40}$/.test(v.sourceCommit)) fail("INPUT_INVALID", 400);
  return {schema: "evopilot-code-upgrade-source-scope/v1", expectedReviewDigest: v.expectedReviewDigest as string, sourceCommit: v.sourceCommit as string, proposalDigest: v.proposalDigest as string, files: exactSourceFiles(v.files)};
}

export function assertSourceScopeAccess(auth: AuthContext, project?: StoredProject): asserts project is StoredProject {
  if (!project) fail("PROJECT_NOT_FOUND", 404);
  if (!auth.platformAdmin && (auth.tenantId !== project!.tenantId || auth.workspaceId !== project!.workspaceId)) fail("FORBIDDEN", 403);
  if (project!.validation.status !== "VERIFIED" || !project!.repository) fail("PROJECT_UNAVAILABLE");
}
export function sourceScopeRepositoryDigest(project: StoredProject): string {
  const {credentials: _credentials, ...repository} = project.repository!;
  return sourceScopeDigest(repository);
}
export function assertSourceFilesPolicy(files: string[], profile: ProjectProfile): void {
  if (validateProtectedPaths(files, profile.policy.protectedPaths).length || validateProtectedPaths(files.map(x => x.toLowerCase()), profile.policy.protectedPaths.map(x => x.toLowerCase())).length) fail("PROTECTED_PATH");
  for (const file of files) for (const raw of profile.policy.protectedPaths) {
    const prefix = raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (file === prefix || file.startsWith(prefix + "/")) fail("PROTECTED_PATH");
  }
}
/** Check only paths within the observed repository, including final components. */
export function assertSourceFilesOnDisk(root: string, files: string[]): void {
  for (const file of exactSourceFiles(files)) {
    const parts = file.split("/");
    for (let i = 0; i < parts.length; i++) {
      const target = path.join(root, ...parts.slice(0, i + 1));
      let stat: fs.Stats;
      try { stat = fs.lstatSync(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") break; throw error; }
      if (stat.isSymbolicLink() || (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) fail("FILE_TYPE_INVALID");
    }
  }
}

interface ScopeContext { auth: AuthContext; project: StoredProject; plan: EvolutionPlan; review: ReviewRecord; profile: ProjectProfile; }
function assertOwner(c: ScopeContext): void {
  assertSourceScopeAccess(c.auth, c.project);
  if (c.review.projectId !== c.project.id || c.plan.projectId !== c.project.id || c.review.planId !== c.plan.id) fail("OWNER_MISMATCH");
}
export function approveSourceScope(c: ScopeContext & {input: SourceScopeInput; sourceCommit?: string; decidedAt: string}): CodeUpgradeSourceScopeApproval {
  assertOwner(c);
  if (sourceScopeDigest(c.review) !== c.input.expectedReviewDigest) fail("REVIEW_STALE");
  if (c.sourceCommit !== c.input.sourceCommit) fail("SOURCE_STALE");
  assertSourceFilesPolicy(c.input.files, c.profile);
  const scope: Omit<CodeUpgradeSourceScopeApproval, "approvalDigest"> = {
    schema: "evopilot-code-upgrade-source-scope-approval/v1", expectedReviewDigest: c.input.expectedReviewDigest,
    projectId: c.project.id, planId: c.plan.id, reviewId: c.review.id, tenantId: c.project.tenantId, workspaceId: c.project.workspaceId,
    repositoryDigest: sourceScopeRepositoryDigest(c.project), planDigest: sourceScopeDigest(c.plan), sourceBranch: c.project.repository!.defaultBranch ?? "main",
    sourceCommit: c.input.sourceCommit, proposalDigest: c.input.proposalDigest, files: c.input.files,
    approvedBy: c.auth.actor, approvedAt: c.decidedAt
  };
  return {...scope, approvalDigest: sourceScopeDigest(scope)};
}
export function resolveSourceScope(c: ScopeContext & {approvalDigest: unknown; proposalMarkdown: string; sourceCommit?: string}): CodeUpgradeSourceScopeApproval {
  assertOwner(c);
  const decision = c.review.decisions.at(-1), scope = decision?.codeUpgradeSourceScope;
  if (!hash(c.approvalDigest) || c.review.status !== "USER_CONFIRMED" || decision?.action !== "accept" || !scope) fail("APPROVAL_REQUIRED");
  const approved = scope!, {approvalDigest, ...body} = approved;
  if (c.approvalDigest !== approvalDigest || sourceScopeDigest(body) !== approvalDigest || approved.schema !== "evopilot-code-upgrade-source-scope-approval/v1" || sourceScopeDigest(exactSourceFiles(approved.files)) !== sourceScopeDigest(approved.files)) fail("APPROVAL_INVALID");
  if (approved.projectId !== c.project.id || approved.planId !== c.plan.id || approved.reviewId !== c.review.id || approved.tenantId !== c.project.tenantId || approved.workspaceId !== c.project.workspaceId || approved.repositoryDigest !== sourceScopeRepositoryDigest(c.project) || approved.planDigest !== sourceScopeDigest(c.plan)) fail("BINDING_STALE");
  if (approved.proposalDigest !== sourceScopeTextDigest(c.proposalMarkdown)) fail("PROPOSAL_MISMATCH");
  if (c.sourceCommit !== undefined && c.sourceCommit !== approved.sourceCommit) fail("SOURCE_STALE");
  assertSourceFilesPolicy(approved.files, c.profile);
  return approved;
}
export function validateSourceScopeResult(scope: CodeUpgradeSourceScopeApproval, changedFiles: unknown): void {
  const actual = exactSourceFiles(changedFiles);
  if (actual.some(file => !scope.files.includes(file))) fail("RESULT_OUTSIDE_SCOPE");
}
export function sourceScopeProviderBinding(scope: CodeUpgradeSourceScopeApproval): CodeUpgraderSourceScopeBinding {
  return {schema: "evopilot-code-upgrade-source-binding/v1", approvalDigest: scope.approvalDigest, repositoryDigest: scope.repositoryDigest, sourceCommit: scope.sourceCommit, filesDigest: sourceScopeDigest(scope.files)};
}
export function sourceScopeBindingMatches(expected: CodeUpgraderSourceScopeBinding, observed: unknown): boolean {
  return Boolean(observed && typeof observed === "object" && !Array.isArray(observed) && Object.keys(observed).length === 5 && sourceScopeDigest(observed) === sourceScopeDigest(expected));
}
