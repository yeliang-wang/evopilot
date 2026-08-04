import path from "node:path";
import { pathToFileURL } from "node:url";

import { startServerFromEnvironment } from "./server.js";

export * from "./server.js";
export type * from "./model.js";

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServerFromEnvironment();
}
