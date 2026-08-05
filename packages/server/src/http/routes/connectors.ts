import http from "node:http";
import type { StoredCodeUpgraderConnector, StoredDeployConnector } from "../../model.js";

interface ConnectorRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  runtime: any;
  deps: Record<string, any>;
}

export async function handleConnectorRoutes(context: ConnectorRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, runtime } = context;
  const {
    audit,
    envelope,
    hasRole,
    maskCodeUpgraderConnector,
    maskDeployConnector,
    normalizeStringList,
    normalizeStringMap,
    readJson,
    requireBodyString,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/connectors/code-upgrader") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listCodeUpgraderConnectors().map(maskCodeUpgraderConnector)));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/connectors/deploy") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listDeployConnectors().map(maskDeployConnector)));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/schedules") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listSchedules().slice(-20).reverse()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/connectors/deploy") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = new Date().toISOString();
    const connectorType = body.type === "ecs-docker-compose" ? "ecs-docker-compose" : "http-webhook";
    const connector: StoredDeployConnector = {
      id: requireBodyString(body.id, "DEPLOY_CONNECTOR_ID_REQUIRED", runtime, "default"),
      name: String(body.name ?? body.id ?? "生产部署连接器").trim(),
      type: connectorType,
      url: body.url || body.webhookUrl ? String(body.url ?? body.webhookUrl).trim() : undefined,
      rollbackUrl: body.rollbackUrl ? String(body.rollbackUrl).trim() : undefined,
      method: connectorType === "http-webhook" ? "POST" : undefined,
      token: body.token ? String(body.token) : undefined,
      tokenRef: body.tokenRef ? String(body.tokenRef) : undefined,
      headers: body.headers && typeof body.headers === "object" ? normalizeStringMap(body.headers) : undefined,
      timeoutSeconds: Math.max(1, Math.min(300, Number(body.timeoutSeconds ?? 30))),
      workingDir: body.workingDir ? String(body.workingDir).trim() : undefined,
      composeFile: body.composeFile ? String(body.composeFile).trim() : connectorType === "ecs-docker-compose" ? "docker-compose.yml" : undefined,
      serviceName: body.serviceName ? String(body.serviceName).trim() : undefined,
      gitRemote: body.gitRemote ? String(body.gitRemote).trim() : "origin",
      gitBranch: body.gitBranch ? String(body.gitBranch).trim() : "main",
      gitPull: body.gitPull === undefined ? connectorType === "ecs-docker-compose" : Boolean(body.gitPull),
      preserveLocalPaths: normalizeStringList(body.preserveLocalPaths, []),
      build: body.build === undefined ? true : Boolean(body.build),
      skipComposeWhenUnchanged: Boolean(body.skipComposeWhenUnchanged),
      deployLock: body.deployLock === undefined ? connectorType === "ecs-docker-compose" : Boolean(body.deployLock),
      idempotency: body.idempotency === undefined ? connectorType === "ecs-docker-compose" : Boolean(body.idempotency),
      rollbackOnFailure: body.rollbackOnFailure === undefined ? connectorType === "ecs-docker-compose" : Boolean(body.rollbackOnFailure),
      rollbackOnHealthFailure: body.rollbackOnHealthFailure === undefined ? connectorType === "ecs-docker-compose" : Boolean(body.rollbackOnHealthFailure),
      gitCommand: body.gitCommand ? String(body.gitCommand).trim() : "git",
      dockerCommand: body.dockerCommand ? String(body.dockerCommand).trim() : "docker",
      healthPath: body.healthPath ? String(body.healthPath) : undefined,
      readyPath: body.readyPath ? String(body.readyPath) : undefined,
      createdAt: now,
      updatedAt: now
    };
    if (!connector.id) return writeJson(response, 400, { error: "DEPLOY_CONNECTOR_REQUIRED" });
    if (connector.type === "http-webhook" && !connector.url) return writeJson(response, 400, { error: "DEPLOY_CONNECTOR_URL_REQUIRED" });
    if (connector.type === "ecs-docker-compose" && !connector.workingDir) return writeJson(response, 400, { error: "DEPLOY_CONNECTOR_WORKING_DIR_REQUIRED" });
    store.writeDeployConnector(connector);
    store.appendAudit(audit(auth, "deploy.connector.saved", connector.id, { type: connector.type, url: connector.url, workingDir: connector.workingDir }));
    return writeJson(response, 201, envelope(maskDeployConnector(connector)));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/connectors/code-upgrader") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = new Date().toISOString();
    const connector: StoredCodeUpgraderConnector = {
      id: requireBodyString(body.id, "CODE_UPGRADE_CONNECTOR_ID_REQUIRED", runtime, "default"),
      name: String(body.name ?? body.id ?? "代码升级执行器").trim(),
      baseUrl: String(body.baseUrl ?? "").trim(),
      apiKey: body.apiKey ? String(body.apiKey) : undefined,
      workspaceMode: body.workspaceMode === "remote" ? "remote" : "docker",
      defaultModel: body.defaultModel ? String(body.defaultModel) : process.env.EVOPILOT_CODE_UPGRADER_MODEL ?? process.env.EVOPILOT_LLM_MODEL_NAME,
      llmModel: body.llmModel ? String(body.llmModel) : process.env.EVOPILOT_CODE_UPGRADER_LLM_MODEL ?? process.env.EVOPILOT_CODE_UPGRADER_MODEL ?? process.env.EVOPILOT_LLM_MODEL_NAME,
      llmBaseUrl: body.llmBaseUrl ? String(body.llmBaseUrl) : process.env.EVOPILOT_CODE_UPGRADER_LLM_BASE_URL ?? process.env.EVOPILOT_LLM_BASE_URL,
      llmApiKey: body.llmApiKey ? String(body.llmApiKey) : process.env.EVOPILOT_CODE_UPGRADER_LLM_API_KEY ?? process.env.EVOPILOT_LLM_API_KEY,
      maxIterations: body.maxIterations ? Number(body.maxIterations) : Number(process.env.EVOPILOT_CODE_UPGRADER_MAX_ITERATIONS ?? 80),
      condenserMaxSize: body.condenserMaxSize ? Number(body.condenserMaxSize) : Number(process.env.EVOPILOT_CODE_UPGRADER_CONDENSER_MAX_SIZE ?? 12000),
      gitUserName: body.gitUserName ? String(body.gitUserName) : process.env.EVOPILOT_CODE_UPGRADER_GIT_USER_NAME ?? "EvoPilot",
      gitUserEmail: body.gitUserEmail ? String(body.gitUserEmail) : process.env.EVOPILOT_CODE_UPGRADER_GIT_USER_EMAIL ?? "evopilot@local",
      createdAt: now,
      updatedAt: now
    };
    if (!connector.id || !connector.baseUrl) return writeJson(response, 400, { error: "CODE_UPGRADER_CONNECTOR_REQUIRED" });
    store.writeCodeUpgraderConnector(connector);
    store.appendAudit(audit(auth, "code-upgrader.connector.saved", connector.id, { baseUrl: connector.baseUrl, workspaceMode: connector.workspaceMode }));
    return writeJson(response, 201, envelope(maskCodeUpgraderConnector(connector)));
  }


  return false;
}
