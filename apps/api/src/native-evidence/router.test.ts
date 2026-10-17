import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { requireAuth } from "../auth.js";
import { createNativeEvidenceRouter } from "./router.js";
import { createNativeEvidenceResolver, type NativeCurrentUnit } from "./resolver.js";

const hash = createHash("sha256").update("Exact page.").digest("hex");
const locator = { kind: "document-page" as const, documentId: "doc-a", documentSourceId: "immutable-source-a", headRevision: 1, sourceId: "source-a", revisionHash: hash,
  pageNumber: 1, passage: { start: 0, end: 11, sha256: hash } };
async function fixture(run: (call: (body: unknown, key?: string) => Promise<Response>, loads: string[], set: (row: NativeCurrentUnit | null | "error") => void) => Promise<void>) {
  const loads: string[] = []; let unit: NativeCurrentUnit | null | "error" = { kind: "document-page", documentId: "doc-a", documentSourceId: "immutable-source-a", headRevision: 1, sourceId: "source-a", tenantId: "tenant-a",
    revisionHash: hash, currentRevisionHash: hash, pageNumber: 1, eligible: true, text: "Exact page." };
  const resolver = createNativeEvidenceResolver({ async loadCurrent(tenantId) {
    loads.push(tenantId); if (unit === "error") throw new Error("PRIVATE credential detail"); return unit;
  } });
  const app = express(); app.use(express.json({ limit: "32kb" }));
  app.use(requireAuth({ async verify(key) { return key === "allowed" ? { tenantId: "tenant-a", scopes: ["citations"] }
    : key === "foreign" ? { tenantId: "tenant-b", scopes: ["citations"] }
      : key === "wrong-scope" ? { tenantId: "tenant-a", scopes: ["search"] } : null; } }));
  app.use(createNativeEvidenceRouter(resolver));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const address = server.address() as AddressInfo;
  const call = (body: unknown, key = "allowed") => fetch(`http://127.0.0.1:${address.port}/citations/native/resolve`, {
    method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body),
  });
  try { await run(call, loads, row => { unit = row; }); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}

test("native citation route uses current bearer tenant and exact evidence envelope", async () => fixture(async (call, loads) => {
  const response = await call({ sourceLocator: locator }); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { evidence: { sourceLocator: locator, quote: "Exact page." } });
  assert.deepEqual(loads, ["tenant-a"]);
  assert.equal((await call({ sourceLocator: locator }, "foreign")).status, 404);
  assert.deepEqual(loads, ["tenant-a", "tenant-b"]);
}));

test("unauthorized/scope/client-tenant/malformed requests cannot load native source", async () => fixture(async (call, loads) => {
  assert.equal((await call({ sourceLocator: locator }, "")).status, 401);
  assert.equal((await call({ sourceLocator: locator }, "revoked")).status, 401);
  assert.equal((await call({ sourceLocator: locator }, "wrong-scope")).status, 403);
  for (const body of [null, [], {}, { sourceLocator: locator, tenantId: "tenant-b" }, { sourceLocator: { ...locator, pageNumber: 0 } },
    { sourceLocator: { ...locator, tStart: 0 } }]) assert.equal((await call(body)).status, 400);
  assert.deepEqual(loads, []);
}));

test("deletion and infrastructure failures disclose fixed safe responses", async () => fixture(async (call, _loads, set) => {
  set(null); const missing = await call({ sourceLocator: locator }); assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "evidence_unavailable" });
  set("error"); const failed = await call({ sourceLocator: locator }); assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "evidence_unavailable" });
}));
