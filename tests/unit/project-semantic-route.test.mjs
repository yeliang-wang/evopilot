import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import test from "node:test";
import {handleProjectSemanticRoutes} from "../../packages/server/dist/http/routes/project-semantics.js";
import {SemanticCatalogError} from "../../packages/server/dist/domains/harness-template/semantic-catalog-contract.js";

function context(inspect) {
  const request = Object.assign(new EventEmitter(), {method: "GET", headers: {}});
  const headers = {}, response = Object.assign(new EventEmitter(), {setHeader: (key, value) => {headers[key] = value;}});
  const written = [];
  return {request, response, headers, written, url: new URL("http://localhost/api/v1/projects/p/semantic-catalogs/c"), requestId: "synthetic-request",
    service: {inspect}, currentAccess: () => ({}), setRequestErrorCode: () => {},
    deps: {envelope: data => ({data}), writeJson: (_response, status, body) => {written.push({status, body}); return true;}}};
}
for (const [code, status] of [["PERMISSION_DENIED", 403], ["UNAVAILABLE", 404], ["TIMEOUT", 504], ["CANCELLED", 408], ["DRIFT", 409]]) {
  test(`route maps ${code} without raw exceptions or partial results`, async () => {
    const c = context(async () => {throw new SemanticCatalogError(code);});
    assert.equal(await handleProjectSemanticRoutes(c), true); assert.equal(c.written[0].status, status);
    assert.equal(c.written[0].body.error, `SEMANTIC_CATALOG_${code}`); assert.equal(c.written[0].body.data, undefined);
    assert.equal(c.request.listenerCount("aborted"), 0); assert.equal(c.response.listenerCount("close"), 0);
  });
}
test("unexpected service errors are redacted before HTTP output", async () => {
  const c = context(async () => {throw Error("private/path and private material");}); await handleProjectSemanticRoutes(c);
  assert.equal(c.written[0].status, 409); assert(!JSON.stringify(c.written).includes("private"));
});
test("response disconnect cancels the same in-flight operation and removes listeners", async () => {
  let observed;
  const c = context(({signal}) => {observed = signal; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new SemanticCatalogError("CANCELLED")), {once: true}));});
  const pending = handleProjectSemanticRoutes(c); c.response.emit("close"); await pending;
  assert.equal(observed.aborted, true); assert.equal(c.written[0].status, 408);
  assert.equal(c.request.listenerCount("aborted"), 0); assert.equal(c.response.listenerCount("close"), 0);
});
test("GET body framing is rejected before the semantic service is called", async () => {
  for (const suffix of ["", "/onboarding"]) for (const headers of [{"content-length": "1"}, {"transfer-encoding": "chunked"}]) {
    const c = context(() => {assert.fail("not called");}); c.request.headers = headers;
    c.url = new URL(c.url.href + suffix); c.onboarding = () => {assert.fail("not called");};
    await handleProjectSemanticRoutes(c); assert.equal(c.written[0].status, 400);
  }
});
