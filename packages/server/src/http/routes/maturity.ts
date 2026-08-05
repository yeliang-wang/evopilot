import http from "node:http";

interface MaturityRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  deps: Record<string, any>;
}

export async function handleMaturityRoutes(context: MaturityRoutesContext): Promise<boolean> {
  const { request, response, url, auth } = context;
  const {
    DEFAULT_MATURITY_STANDARD_SET_ID,
    MATURITY_PHASES,
    envelope,
    hasRole,
    maturityStandardTemplates,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/maturity/standards") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope({
      schema: "evopilot-maturity-standard-set/v1",
      id: DEFAULT_MATURITY_STANDARD_SET_ID,
      terminalMaturity: "ga",
      phases: MATURITY_PHASES,
      templates: maturityStandardTemplates()
    }));
  }

  const maturityStandardMatch = url.pathname.match(/^\/api\/v1\/maturity\/standards\/([^/]+)$/);
  if (request.method === "GET" && maturityStandardMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const id = decodeURIComponent(maturityStandardMatch[1]);
    const template = maturityStandardTemplates().find((item: any) => item.id === id || item.phase === id);
    if (!template) return writeJson(response, 404, { error: "MATURITY_STANDARD_NOT_FOUND" });
    return writeJson(response, 200, envelope(template));
  }

  return false;
}
