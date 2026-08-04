import http from "node:http";

interface SettingsRouteContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  options: { maxBodyBytes?: number };
  store: any;
  deps: {
    audit: (context: any, action: string, target: string, metadata?: Record<string, unknown>) => unknown;
    envelope: <T>(data: T) => unknown;
    hasRole: (auth: any, role: "viewer" | "operator" | "admin") => boolean;
    readJson: (request: http.IncomingMessage, maxBodyBytes?: number) => Promise<any>;
    setActiveLoggingSettings: (settings: any) => void;
    writeJson: (response: http.ServerResponse, statusCode: number, body: unknown) => void;
  };
}

export async function handleSettingsRoute(context: SettingsRouteContext): Promise<boolean> {
  const { request, response, url, auth, store, deps } = context;

  if (request.method === "GET" && url.pathname === "/api/v1/settings/logging") {
    if (!deps.hasRole(auth, "viewer")) {
      deps.writeJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    deps.writeJson(response, 200, deps.envelope(store.readLoggingSettings()));
    return true;
  }

  if ((request.method === "PUT" || request.method === "POST") && url.pathname === "/api/v1/settings/logging") {
    if (!deps.hasRole(auth, "admin")) {
      deps.writeJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    const body = await deps.readJson(request, context.options.maxBodyBytes);
    const previous = store.readLoggingSettings();
    const settings = store.writeLoggingSettings(body, auth.actor);
    deps.setActiveLoggingSettings(settings);
    store.appendAudit(deps.audit(auth, "logging.settings.updated", "evopilot", {
      previousLevel: previous.level,
      level: settings.level,
      format: settings.format,
      includeStack: settings.includeStack
    }));
    deps.writeJson(response, 200, deps.envelope({
      schema: "evopilot-logging-settings-update-result/v1",
      status: "UPDATED",
      settings,
      previous
    }));
    return true;
  }

  return false;
}
