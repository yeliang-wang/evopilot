import {
  effectiveHarnessTemplateDomain,
  effectiveHarnessTemplateLayer,
  harnessTemplateRef,
  hydrateHarnessTemplateRef
} from "./template.js";
import type {
  HarnessKnowledgeSource,
  HarnessTemplateLayer,
  HarnessTemplateMatchCandidate,
  HarnessTemplateMatchDecision,
  HarnessTemplateMatchReport,
  HarnessTemplateProfile,
  HarnessTemplateRef
} from "./types.js";
import {
  digestText,
  incrementSemverPatch,
  isRecord,
  normalizeStringList,
  optionalTrimmedString,
  recordObject,
  safeFileName,
  uniqueStrings
} from "./utils.js";

export interface HarnessTemplateMatcherRepository {
  listHarnessTemplates(): HarnessTemplateProfile[];
  readHarnessTemplate(templateId: string, version?: string): HarnessTemplateProfile | undefined;
}

export interface HarnessTemplateMatchInput {
  sources: HarnessKnowledgeSource[];
  intent?: string;
}

interface DomainMatchProfile {
  domain: string;
  templateId: string;
  layer: HarnessTemplateLayer;
  include: string[];
  exclude?: string[];
  baseTemplateByLanguage: Partial<Record<HarnessTemplateProfile["languageFamily"], string>>;
}

interface DomainDetection {
  profile: DomainMatchProfile;
  score: number;
  matchedSignals: string[];
  excludedSignals: string[];
}

const DOMAIN_MATCH_PROFILES: DomainMatchProfile[] = [
  {
    domain: "database-product",
    templateId: "database-product-harness",
    layer: "domain",
    include: [
      "database product",
      "self-developed database",
      "self developed database",
      "dbms",
      "sql engine",
      "storage engine",
      "query optimizer",
      "transaction engine",
      "distributed database",
      "database kernel",
      "postgres-compatible",
      "mysql-compatible",
      "数据库产品",
      "自研数据库",
      "数据库内核",
      "查询优化器",
      "存储引擎",
      "事务引擎",
      "分布式数据库"
    ],
    exclude: ["database connection", "jdbc datasource", "orm", "crud repository", "connect to mysql", "connect to postgres", "数据库连接", "数据源"],
    baseTemplateByLanguage: {
      go: "go-middleware-harness",
      java: "java-ddd-service-harness",
      node: "node-saas-control-plane-harness",
      python: "python-enterprise-harness",
      generic: "generic-management-software-harness"
    }
  },
  {
    domain: "api-gateway",
    templateId: "api-gateway-harness",
    layer: "domain",
    include: [
      "api gateway",
      "gateway product",
      "ingress controller",
      "traffic proxy",
      "route matching",
      "upstream selection",
      "rate limit",
      "auth policy",
      "plugin lifecycle",
      "filter chain",
      "service mesh gateway",
      "envoy",
      "kong",
      "apisix",
      "网关",
      "api 网关",
      "流量网关",
      "路由匹配",
      "限流",
      "插件生命周期"
    ],
    baseTemplateByLanguage: {
      go: "go-middleware-harness",
      java: "java-ddd-service-harness",
      node: "node-saas-control-plane-harness",
      python: "python-enterprise-harness",
      generic: "go-middleware-harness"
    }
  },
  {
    domain: "distributed-cache",
    templateId: "distributed-cache-harness",
    layer: "domain",
    include: [
      "distributed cache",
      "cache product",
      "redis-compatible",
      "memcached-compatible",
      "redis",
      "memcached",
      "kv store",
      "key-value store",
      "ttl",
      "lru",
      "lfu",
      "eviction",
      "hot key",
      "consistent hash",
      "consistent hashing",
      "hash slot",
      "slot migration",
      "shard",
      "replica",
      "failover",
      "raft",
      "gossip",
      "缓存产品",
      "分布式缓存",
      "键值存储",
      "一致性哈希",
      "热点 key",
      "分片",
      "副本",
      "淘汰策略"
    ],
    baseTemplateByLanguage: {
      go: "go-middleware-harness",
      java: "java-ddd-service-harness",
      node: "node-saas-control-plane-harness",
      python: "python-enterprise-harness",
      generic: "go-middleware-harness"
    }
  },
  {
    domain: "scheduler",
    templateId: "scheduler-harness",
    layer: "domain",
    include: [
      "scheduler",
      "distributed scheduler",
      "cron",
      "dag",
      "job",
      "task queue",
      "misfire",
      "worker heartbeat",
      "leader election",
      "调度系统",
      "任务调度",
      "定时任务",
      "分布式调度"
    ],
    baseTemplateByLanguage: {
      go: "go-middleware-harness",
      java: "java-ddd-service-harness",
      node: "node-saas-control-plane-harness",
      python: "python-enterprise-harness",
      generic: "generic-management-software-harness"
    }
  },
  {
    domain: "messaging-stream",
    templateId: "messaging-stream-harness",
    layer: "domain",
    include: [
      "message queue",
      "streaming platform",
      "kafka",
      "pulsar",
      "rabbitmq",
      "consumer group",
      "offset",
      "partition",
      "broker",
      "消息队列",
      "流式平台",
      "消费组",
      "分区",
      "偏移量"
    ],
    baseTemplateByLanguage: {
      go: "go-middleware-harness",
      java: "java-ddd-service-harness",
      node: "node-saas-control-plane-harness",
      python: "python-enterprise-harness",
      generic: "go-middleware-harness"
    }
  }
];

const RUNTIME_BASE_BY_LANGUAGE: Record<HarnessTemplateProfile["languageFamily"], string> = {
  python: "python-enterprise-harness",
  node: "node-saas-control-plane-harness",
  java: "java-ddd-service-harness",
  go: "go-middleware-harness",
  generic: "generic-management-software-harness"
};

export function matchHarnessTemplateEvolutionSource(
  store: HarnessTemplateMatcherRepository,
  input: HarnessTemplateMatchInput
): HarnessTemplateMatchReport {
  const templates = store.listHarnessTemplates();
  if (templates.length === 0) {
    throw new Error("No HarnessTemplate is available for matching.");
  }
  const now = new Date().toISOString();
  const contextText = harnessTemplateMatchContextText(input.sources, input.intent);
  const languageDetection = detectHarnessTemplateMatchLanguage(contextText);
  const domainDetections = detectHarnessTemplateMatchDomains(contextText);
  const primaryDomain = domainDetections[0];
  const language = languageDetection.language ?? "generic";
  const candidates = candidateTemplates(templates, {
    contextText,
    primaryDomain,
    language,
    languageSignals: languageDetection.signals
  });
  const templateDrivenDomain = !primaryDomain
    ? candidates.find((candidate) => candidate.harnessLayer === "domain" && candidate.score >= 90)
    : undefined;
  const templateDrivenDomainTemplate = templateDrivenDomain
    ? templates.find((template) => template.id === templateDrivenDomain.templateRef.templateId && template.version === templateDrivenDomain.templateRef.version)
    : undefined;
  const existingDomainTemplate = primaryDomain
    ? latestTemplateForDomainOrId(templates, primaryDomain.profile.domain, primaryDomain.profile.templateId)
    : templateDrivenDomainTemplate;
  const baseTemplate = resolveBaseTemplate(store, primaryDomain?.profile, language);
  const decision = primaryDomain
    ? chooseMatchDecision(primaryDomain, existingDomainTemplate)
    : existingDomainTemplate
      ? "EVOLVE_EXISTING"
      : "NEEDS_ADMIN_CONFIRMATION";
  const selectedExistingRef = existingDomainTemplate ? harnessTemplateRef(existingDomainTemplate) : undefined;
  const baseTemplateRef = decision === "EVOLVE_EXISTING" && selectedExistingRef ? selectedExistingRef : harnessTemplateRef(baseTemplate);
  const targetTemplateId = decision === "EVOLVE_EXISTING" && existingDomainTemplate
    ? existingDomainTemplate.id
    : decision === "CREATE_NEW_FROM_BASE" && primaryDomain
      ? primaryDomain.profile.templateId
      : baseTemplate.id;
  const targetVersion = decision === "CREATE_NEW_FROM_BASE"
    ? "0.1.0"
    : incrementSemverPatch((decision === "EVOLVE_EXISTING" && existingDomainTemplate ? existingDomainTemplate : baseTemplate).version);
  const targetLayer = primaryDomain?.profile.layer ?? effectiveHarnessTemplateLayer(existingDomainTemplate ?? baseTemplate);
  const targetDomain = primaryDomain?.profile.domain ?? effectiveHarnessTemplateDomain(existingDomainTemplate ?? baseTemplate);
  const confidence = matchConfidence(decision, primaryDomain, languageDetection.signals, candidates[0]?.score ?? 0);
  const reasons = matchReasons({
    decision,
    primaryDomain,
    languageSignals: languageDetection.signals,
    baseTemplate,
    existingDomainTemplate,
    templateDrivenDomain,
    targetTemplateId,
    targetVersion
  });
  return hydrateHarnessTemplateMatchReport({
    schema: "evopilot-harness-template-match-report/v1",
    decision,
    confidence,
    baseTemplateRef,
    targetTemplateId,
    targetVersion,
    targetHarnessLayer: targetLayer,
    ...(targetDomain ? { targetDomain } : {}),
    languageSignals: languageDetection.signals,
    runtimeSignals: runtimeSignalsForLanguage(languageDetection.signals, language),
    domainSignals: domainDetections.flatMap((detection) => [
      `domain=${detection.profile.domain}`,
      ...detection.matchedSignals.slice(0, 8).map((signal) => `domainSignal=${signal}`)
    ]).concat(templateDrivenDomain?.domain ? [`domain=${templateDrivenDomain.domain}`, "domainSource=harness-matchSignals"] : []),
    sourceDigests: input.sources.map((source) => source.contentDigest ?? digestText(source.contentText ?? source.uri ?? source.name)),
    candidateTemplates: candidates,
    reasons,
    llmAdjudication: {
      used: false,
      reason: "deterministic matcher used; LLM adjudication is review-only and not enabled for this request"
    },
    nextAction: decision === "NEEDS_ADMIN_CONFIRMATION" ? "confirm-template-match-or-override" : "advance-template-evolution",
    generatedAt: now
  });
}

export function hydrateHarnessTemplateMatchReport(input: unknown): HarnessTemplateMatchReport {
  const record = isRecord(input) ? input : {};
  const baseTemplateRef = hydrateHarnessTemplateRef(record.baseTemplateRef);
  const decision = normalizeHarnessTemplateMatchDecision(record.decision);
  const targetHarnessLayer = normalizeHarnessTemplateMatchLayer(record.targetHarnessLayer);
  return {
    schema: "evopilot-harness-template-match-report/v1",
    decision,
    confidence: clampConfidence(record.confidence),
    baseTemplateRef,
    targetTemplateId: safeFileName(String(record.targetTemplateId ?? baseTemplateRef.templateId)),
    targetVersion: String(record.targetVersion ?? incrementSemverPatch(baseTemplateRef.version)),
    targetHarnessLayer,
    targetDomain: optionalTrimmedString(record.targetDomain),
    languageSignals: normalizeStringList(record.languageSignals, []),
    runtimeSignals: normalizeStringList(record.runtimeSignals, []),
    domainSignals: normalizeStringList(record.domainSignals, []),
    sourceDigests: normalizeStringList(record.sourceDigests, []),
    candidateTemplates: Array.isArray(record.candidateTemplates)
      ? record.candidateTemplates.map(hydrateHarnessTemplateMatchCandidate)
      : [],
    reasons: normalizeStringList(record.reasons, []),
    llmAdjudication: {
      used: isRecord(record.llmAdjudication) && record.llmAdjudication.used === true,
      reason: isRecord(record.llmAdjudication)
        ? String(record.llmAdjudication.reason ?? "not used")
        : "not used"
    },
    nextAction: String(record.nextAction ?? (decision === "NEEDS_ADMIN_CONFIRMATION" ? "confirm-template-match-or-override" : "advance-template-evolution")),
    generatedAt: String(record.generatedAt ?? new Date().toISOString())
  };
}

function hydrateHarnessTemplateMatchCandidate(input: unknown): HarnessTemplateMatchCandidate {
  const record = isRecord(input) ? input : {};
  return {
    templateRef: hydrateHarnessTemplateRef(record.templateRef),
    harnessLayer: normalizeHarnessTemplateMatchLayer(record.harnessLayer),
    domain: optionalTrimmedString(record.domain),
    languageFamily: normalizeHarnessTemplateMatchLanguage(record.languageFamily),
    score: Math.max(0, Number(record.score ?? 0)),
    matchedSignals: normalizeStringList(record.matchedSignals, []),
    reasons: normalizeStringList(record.reasons, [])
  };
}

function normalizeHarnessTemplateMatchDecision(value: unknown): HarnessTemplateMatchDecision {
  const decision = String(value ?? "").trim().toUpperCase();
  if (decision === "EVOLVE_EXISTING" || decision === "CREATE_NEW_FROM_BASE" || decision === "NEEDS_ADMIN_CONFIRMATION") return decision;
  return "NEEDS_ADMIN_CONFIRMATION";
}

function normalizeHarnessTemplateMatchLayer(value: unknown): HarnessTemplateLayer {
  const layer = String(value ?? "runtime").trim().toLowerCase();
  if (layer === "domain" || layer === "composite" || layer === "runtime") return layer;
  return "runtime";
}

function normalizeHarnessTemplateMatchLanguage(value: unknown): HarnessTemplateProfile["languageFamily"] {
  const language = String(value ?? "generic").trim().toLowerCase();
  if (language === "python" || language === "node" || language === "java" || language === "go" || language === "generic") return language;
  return "generic";
}

function chooseMatchDecision(primaryDomain: DomainDetection | undefined, existingDomainTemplate: HarnessTemplateProfile | undefined): HarnessTemplateMatchDecision {
  if (!primaryDomain || primaryDomain.score < 2) return "NEEDS_ADMIN_CONFIRMATION";
  return existingDomainTemplate ? "EVOLVE_EXISTING" : "CREATE_NEW_FROM_BASE";
}

function resolveBaseTemplate(
  store: HarnessTemplateMatcherRepository,
  domainProfile: DomainMatchProfile | undefined,
  language: HarnessTemplateProfile["languageFamily"]
): HarnessTemplateProfile {
  const baseTemplateId = domainProfile?.baseTemplateByLanguage[language]
    ?? RUNTIME_BASE_BY_LANGUAGE[language]
    ?? RUNTIME_BASE_BY_LANGUAGE.generic;
  return store.readHarnessTemplate(baseTemplateId)
    ?? store.readHarnessTemplate(RUNTIME_BASE_BY_LANGUAGE[language])
    ?? store.readHarnessTemplate(RUNTIME_BASE_BY_LANGUAGE.generic)
    ?? store.listHarnessTemplates()[0];
}

function candidateTemplates(
  templates: HarnessTemplateProfile[],
  args: {
    contextText: string;
    primaryDomain?: DomainDetection;
    language: HarnessTemplateProfile["languageFamily"];
    languageSignals: string[];
  }
): HarnessTemplateMatchCandidate[] {
  return templates
    .map((template) => {
      const layer = effectiveHarnessTemplateLayer(template);
      const domain = effectiveHarnessTemplateDomain(template);
      const signalMatches = matchedTemplateSignals(template, args.contextText);
      let score = signalMatches.length * 8;
      const reasons: string[] = [];
      if (args.primaryDomain && (domain === args.primaryDomain.profile.domain || template.id === args.primaryDomain.profile.templateId)) {
        score += 260 + args.primaryDomain.score * 20;
        reasons.push(`domain=${args.primaryDomain.profile.domain}`);
        reasons.push(...args.primaryDomain.matchedSignals.slice(0, 5).map((signal) => `domainSignal=${signal}`));
      }
      if (!args.primaryDomain && layer === "domain" && signalMatches.length > 0) {
        score += 100 + Math.min(signalMatches.length, 8) * 12;
        reasons.push("domainSource=harness-matchSignals");
        if (domain) reasons.push(`domain=${domain}`);
      }
      if (template.languageFamily === args.language) {
        score += args.language === "generic" ? 35 : 90;
        reasons.push(`language=${args.language}`);
      } else if (template.languageFamily === "generic" && args.primaryDomain) {
        score += 45;
        reasons.push("language=generic-domain-compatible");
      }
      if (template.id === RUNTIME_BASE_BY_LANGUAGE[args.language]) {
        score += 50;
        reasons.push(`runtimeBase=${args.language}`);
      }
      if (template.id === "generic-management-software-harness") {
        score += 6;
        reasons.push("fallback=generic-management-software");
      }
      return {
        templateRef: harnessTemplateRef(template),
        harnessLayer: layer,
        ...(domain ? { domain } : {}),
        languageFamily: template.languageFamily,
        score,
        matchedSignals: uniqueStrings([...signalMatches, ...args.languageSignals]),
        reasons: uniqueStrings(reasons).slice(0, 10)
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return `${left.templateRef.templateId}@${left.templateRef.version}`.localeCompare(`${right.templateRef.templateId}@${right.templateRef.version}`);
    })
    .slice(0, 8);
}

function matchedTemplateSignals(template: HarnessTemplateProfile, contextText: string): string[] {
  const runtimePatterns = recordObject(template.runtimePatterns);
  const signals = uniqueStrings([
    template.id,
    template.name,
    template.description,
    template.languageFamily,
    effectiveHarnessTemplateLayer(template),
    effectiveHarnessTemplateDomain(template) ?? "",
    optionalTrimmedString(runtimePatterns.domainLabel) ?? "",
    ...normalizeStringList(runtimePatterns.architectureStyles, []),
    ...normalizeStringList(runtimePatterns.packageManagers, []),
    ...normalizeStringList(runtimePatterns.buildTools, []),
    ...normalizeStringList(runtimePatterns.runtimeProfiles, []),
    ...normalizeStringList(template.matchSignals?.include, []),
    ...template.capabilities.flatMap((capability) => [capability.id, capability.name])
  ].flatMap((signal) => String(signal).toLowerCase().split(/[,/|]+/)).map((signal) => signal.trim()).filter((signal) => signal.length >= 3));
  const excluded = normalizeStringList(template.matchSignals?.exclude, []).some((signal) => textIncludesSignal(contextText, signal));
  if (excluded) return [];
  return signals.filter((signal) => textIncludesSignal(contextText, signal)).slice(0, 18);
}

function latestTemplateForDomainOrId(templates: HarnessTemplateProfile[], domain: string, templateId: string): HarnessTemplateProfile | undefined {
  const candidates = templates.filter((template) => template.id === templateId || effectiveHarnessTemplateDomain(template) === domain);
  return candidates.sort((left, right) => compareVersions(right.version, left.version))[0];
}

function detectHarnessTemplateMatchDomains(contextText: string): DomainDetection[] {
  return DOMAIN_MATCH_PROFILES
    .map((profile) => {
      const matchedSignals = profile.include.filter((signal) => textIncludesSignal(contextText, signal));
      const excludedSignals = (profile.exclude ?? []).filter((signal) => textIncludesSignal(contextText, signal));
      return {
        profile,
        score: matchedSignals.length - excludedSignals.length * 2,
        matchedSignals,
        excludedSignals
      };
    })
    .filter((detection) => detection.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.profile.domain.localeCompare(right.profile.domain);
    });
}

function detectHarnessTemplateMatchLanguage(contextText: string): { language?: HarnessTemplateProfile["languageFamily"]; signals: string[] } {
  const languageSignals: Array<{ language: HarnessTemplateProfile["languageFamily"]; signals: string[] }> = [
    { language: "go", signals: ["go.mod", ".go", "golang", "package main", "go test", "go build"] },
    { language: "java", signals: ["pom.xml", "build.gradle", ".java", "spring", "maven", "gradle"] },
    { language: "node", signals: ["package.json", "typescript", "javascript", "npm", "pnpm", "node", "express", "nestjs"] },
    { language: "python", signals: ["pyproject.toml", "requirements.txt", ".py", "pytest", "python", "fastapi", "django"] }
  ];
  const scored = languageSignals
    .map((candidate) => ({
      language: candidate.language,
      signals: candidate.signals.filter((signal) => textIncludesSignal(contextText, signal))
    }))
    .filter((candidate) => candidate.signals.length > 0)
    .sort((left, right) => {
      if (right.signals.length !== left.signals.length) return right.signals.length - left.signals.length;
      return left.language.localeCompare(right.language);
    });
  const selected = scored[0];
  return selected
    ? { language: selected.language, signals: selected.signals.map((signal) => `languageSignal=${signal}`) }
    : { language: undefined, signals: [] };
}

function runtimeSignalsForLanguage(languageSignals: string[], language: HarnessTemplateProfile["languageFamily"]): string[] {
  const signals = languageSignals.length > 0 ? languageSignals : [`language=${language}`];
  return uniqueStrings([`runtime=${language}`, ...signals]);
}

function matchConfidence(
  decision: HarnessTemplateMatchDecision,
  primaryDomain: DomainDetection | undefined,
  languageSignals: string[],
  candidateScore: number
): number {
  if (decision === "NEEDS_ADMIN_CONFIRMATION") {
    return roundConfidence(Math.min(0.69, 0.35 + languageSignals.length * 0.05 + Math.min(candidateScore, 120) / 500));
  }
  const domainConfidence = primaryDomain ? Math.min(0.46, 0.18 + primaryDomain.score * 0.045) : 0;
  const languageConfidence = Math.min(0.16, languageSignals.length * 0.04);
  const base = decision === "EVOLVE_EXISTING" ? 0.38 : 0.34;
  return roundConfidence(Math.min(0.98, base + domainConfidence + languageConfidence + Math.min(candidateScore, 360) / 1800));
}

function matchReasons(args: {
  decision: HarnessTemplateMatchDecision;
  primaryDomain?: DomainDetection;
  languageSignals: string[];
  baseTemplate: HarnessTemplateProfile;
  existingDomainTemplate?: HarnessTemplateProfile;
  templateDrivenDomain?: HarnessTemplateMatchCandidate;
  targetTemplateId: string;
  targetVersion: string;
}): string[] {
  const reasons: string[] = [];
  reasons.push(`decision=${args.decision}`);
  if (args.primaryDomain) {
    reasons.push(`domain=${args.primaryDomain.profile.domain}`);
    reasons.push(...args.primaryDomain.matchedSignals.slice(0, 8).map((signal) => `domainSignal=${signal}`));
  }
  reasons.push(...args.languageSignals);
  if (args.existingDomainTemplate) reasons.push(`existingTemplate=${args.existingDomainTemplate.id}@${args.existingDomainTemplate.version}`);
  if (args.templateDrivenDomain) reasons.push("domainSource=harness-matchSignals");
  reasons.push(`baseTemplate=${args.baseTemplate.id}@${args.baseTemplate.version}`);
  reasons.push(`target=${args.targetTemplateId}@${args.targetVersion}`);
  if (args.decision === "CREATE_NEW_FROM_BASE") reasons.push("newDomainTemplateRequiresAdminReview=true");
  if (args.decision === "NEEDS_ADMIN_CONFIRMATION") reasons.push("confidenceBelowAutoCreateThreshold=true");
  return uniqueStrings(reasons);
}

function harnessTemplateMatchContextText(sources: HarnessKnowledgeSource[], intent?: string): string {
  const values = [
    intent,
    ...sources.flatMap((source) => [
      source.type,
      source.name,
      source.uri,
      source.ref,
      source.fileName,
      source.contentText,
      JSON.stringify(source.metadata ?? {})
    ])
  ].filter((value) => value !== undefined && value !== null).map(String);
  return values.join("\n").toLowerCase().slice(0, 500_000);
}

function textIncludesSignal(contextText: string, signal: string): boolean {
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
  const parse = (value: string) => value.split(/[.-]/).map((part) => {
    const parsed = Number(part);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function clampConfidence(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return roundConfidence(Math.max(0, Math.min(1, parsed)));
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
