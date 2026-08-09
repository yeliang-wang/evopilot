import fs from "node:fs";
import path from "node:path";
import type { HarnessTemplateProfile } from "../domains/harness-template/index.js";

export interface ProjectRepositoryHintSource {
  repository?: {
    provider?: string;
    root?: string;
  };
}

export function domainHarnessRequiredActions(domainExecution: Record<string, unknown>): Record<string, unknown>[] {
  return normalizeDomainHarnessRecords(domainExecution.requiredActions);
}

export function domainHarnessEvidenceAdapters(domainExecution: Record<string, unknown>): Record<string, unknown>[] {
  return normalizeDomainHarnessRecords(domainExecution.evidenceAdapters);
}

export function domainHarnessRequiredActionIds(domainExecution: Record<string, unknown>): string[] {
  return domainHarnessRequiredActions(domainExecution)
    .map((action) => optionalTrimmedString(action.id))
    .filter((id): id is string => Boolean(id));
}

export function domainHarnessReleaseBlockers(domainExecution: Record<string, unknown>): string[] {
  return normalizeStringList(domainExecution.releaseBlockers, []);
}

export function normalizeDomainHarnessRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({ ...item }));
}

export function projectDomainHarnessRepoProbe(project: ProjectRepositoryHintSource, template: HarnessTemplateProfile): Record<string, unknown> {
  const runtimePatterns = recordObject(template.runtimePatterns);
  const domain = optionalTrimmedString(runtimePatterns.domain);
  const harnessLayer = optionalTrimmedString(runtimePatterns.harnessLayer);
  if (harnessLayer !== "domain" || !domain) {
    return {
      schema: "evopilot-domain-harness-repo-probe/v1",
      status: "SKIPPED",
      reason: "template is not a domain harness"
    };
  }
  const hints = projectRepositoryFileHints(project);
  const boundaries = domainHarnessModuleBoundaryPatterns(domain);
  const moduleSignals = boundaries.map((boundary) => {
    const matchedPaths = hints.filter((hint) => domainHarnessPathMatches(hint, boundary.patterns)).slice(0, 12);
    return {
      id: boundary.id,
      matchedPaths
    };
  });
  const missingModuleBoundaries = moduleSignals.filter((signal) => signal.matchedPaths.length === 0).map((signal) => signal.id);
  return {
    schema: "evopilot-domain-harness-repo-probe/v1",
    status: "PROBED",
    domain,
    hintCount: hints.length,
    moduleSignals,
    missingModuleBoundaries,
    nextAction: missingModuleBoundaries.length > 0
      ? "Review goal plan selectedHarness evidence and map missing module boundaries before phase-plan approval."
      : "Review generated module signals before phase-plan approval."
  };
}

export function projectRepositoryFileHints(project: ProjectRepositoryHintSource): string[] {
  const root = project.repository?.provider === "local-git" ? optionalTrimmedString(project.repository.root) : undefined;
  if (!root) return [];
  const absoluteRoot = path.resolve(root);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) return [];
  const ignored = new Set([".git", "node_modules", "dist", "build", "target", ".venv", "venv", "__pycache__"]);
  const results: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 2 || results.length >= 200) return;
    for (const entry of fs.readdirSync(dir).sort()) {
      if (ignored.has(entry) || results.length >= 200) continue;
      const absolute = path.join(dir, entry);
      const relative = path.relative(absoluteRoot, absolute);
      results.push(relative);
      if (fs.statSync(absolute).isDirectory()) visit(absolute, depth + 1);
    }
  };
  try {
    visit(absoluteRoot, 0);
  } catch {
    return [];
  }
  return results;
}

export function domainHarnessModuleBoundaryPatterns(domain: string): Array<{ id: string; patterns: string[] }> {
  if (domain === "database-product") {
    return [
      { id: "parser", patterns: ["parser", "parse", "grammar", "ast", "sql.y", "lexer"] },
      { id: "planner", patterns: ["planner", "optimizer", "plan", "cost", "explain"] },
      { id: "executor", patterns: ["executor", "exec", "execution", "operator"] },
      { id: "storage", patterns: ["storage", "store", "sst", "page", "buffer", "wal"] },
      { id: "transaction", patterns: ["transaction", "txn", "mvcc", "lock", "isolation"] },
      { id: "replication", patterns: ["replication", "replica", "raft", "consensus", "shard"] },
      { id: "recovery", patterns: ["recovery", "recover", "checkpoint", "backup", "restore", "redo"] }
    ];
  }
  if (domain === "api-gateway") {
    return [
      { id: "listener", patterns: ["listener", "listen", "tls", "server", "entrypoint"] },
      { id: "route", patterns: ["route", "router", "match", "rewrite", "ingress"] },
      { id: "upstream", patterns: ["upstream", "cluster", "backend", "balancer", "endpoint"] },
      { id: "policy", patterns: ["policy", "auth", "rate", "quota", "circuit", "retry"] },
      { id: "plugin", patterns: ["plugin", "filter", "extension", "middleware", "wasm"] },
      { id: "protocol", patterns: ["protocol", "http2", "grpc", "websocket", "xds"] }
    ];
  }
  return [];
}

export function domainHarnessPathMatches(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function recordObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeStringList(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map((item) => optionalTrimmedString(item)).filter((item): item is string => Boolean(item));
}
