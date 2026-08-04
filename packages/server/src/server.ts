import path from "node:path";
import { pathToFileURL } from "node:url";
import { startServerFromEnvironment } from "./runtime/control-plane-runtime.js";

export * from "./runtime/control-plane-runtime.js";

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServerFromEnvironment();
}
