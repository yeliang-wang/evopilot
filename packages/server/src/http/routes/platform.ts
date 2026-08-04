import http from "node:http";
import {
  platformHealthBody,
  platformReadyBody,
  platformVersionBody
} from "../platform-readiness.js";
import { envelope, writeJson } from "../response.js";

export interface PlatformRouteContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  profileId: string;
  runtimeMode: string;
  dataRoot: string;
  authRequired: boolean;
  ready: boolean;
  schemaVersion: number;
  dashboardEnabled: boolean;
}

export function handlePlatformRoute(context: PlatformRouteContext): boolean {
  const { request, response, url } = context;

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, platformHealthBody({
      profileId: context.profileId,
      runtimeMode: context.runtimeMode,
      dataRoot: context.dataRoot,
      authRequired: context.authRequired
    }));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/ready") {
    writeJson(response, 200, platformReadyBody({
      ready: context.ready,
      schemaVersion: context.schemaVersion
    }));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/version") {
    writeJson(response, 200, envelope(platformVersionBody({
      dashboardEnabled: context.dashboardEnabled
    })));
    return true;
  }

  return false;
}
