import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export function serveDashboard(request: http.IncomingMessage, response: http.ServerResponse, url: URL, dashboardRoot: string | undefined): boolean {
  if (!dashboardRoot || request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname === "/health") return false;
  const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const absolute = path.resolve(dashboardRoot, relative);
  const root = path.resolve(dashboardRoot);
  if (!absolute.startsWith(root) || !fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) return false;
  const ext = path.extname(absolute);
  const contentType = ext === ".html" ? "text/html; charset=utf-8" : ext === ".css" ? "text/css; charset=utf-8" : ext === ".js" ? "text/javascript; charset=utf-8" : "application/octet-stream";
  response.writeHead(200, { "content-type": contentType });
  response.end(fs.readFileSync(absolute));
  return true;
}
