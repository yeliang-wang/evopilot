import { createServer } from "../../packages/server/dist/index.js";

const server = createServer({ dataRoot: process.argv[2], runtimeMode: "prod", tokens: [
  { name: "admin", token: "synthetic-admin", role: "admin" },
  { name: "operator", token: "synthetic-operator", role: "operator" },
  { name: "viewer", token: "synthetic-viewer", role: "viewer" }
] });
server.listen(0, "127.0.0.1", () => process.send({ port: server.address().port }));
process.on("message", message => {
  if (message === "stop") server.close(() => process.exit(0));
});
