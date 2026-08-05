import http from "node:http";

interface RuleRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  profile: { id: string };
  llmClient: any;
  requireLlm: boolean;
  deps: Record<string, any>;
}

export async function handleRuleRoutes(context: RuleRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, profile, llmClient, requireLlm } = context;
  const {
    audit,
    compileRuleWithLlm,
    envelope,
    hasRole,
    readJson,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/rules") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listRuleMemories().map((rule: any) => ({
      id: rule.id,
      prompt: rule.userPrompt,
      enabled: rule.enabled,
      description: "已由 EvoPilot 编译为执行规则，管理员可在 Markdown 规则文件中审查细节。",
      llmTrace: rule.llmTrace
    }))));
  }

  if (request.method === "POST" && url.pathname === "/api/v1/rules/compile") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const userPrompt = String(body.prompt ?? "").trim();
    if (!userPrompt) return writeJson(response, 400, { error: "RULE_PROMPT_REQUIRED" });
    const projectId = String(body.projectId ?? profile.id);
    const compiled = await compileRuleWithLlm({
      projectId,
      userPrompt,
      llmClient,
      requireLlm
    });
    store.writeRuleMemory(compiled.memory);
    store.appendAudit(audit(auth, "rule.compiled", compiled.memory.id, { projectId, llmTrace: compiled.memory.llmTrace }));
    return writeJson(response, 201, envelope({
      id: compiled.memory.id,
      prompt: compiled.memory.userPrompt,
      enabled: compiled.memory.enabled,
      description: compiled.memory.description,
      storagePath: compiled.memory.storagePath,
      llmTrace: compiled.memory.llmTrace
    }));
  }

  return false;
}
