import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, RequestHandler } from "express";
import { createKnowledgeRouter, type NativeDocumentLifecycle } from "./collections-router.js";
import type { KnowledgeStore } from "./collections-store.js";

type Call = { method: string; tenant: string; input: unknown };
function fixture(failure?: string) {
  const calls: Call[] = [];
  const head = { documentId: "body-1", currentRevisionHash: "a".repeat(64), headRevision: 1, status: "published" as const };
  const record = (method: string, tenant: string, input: unknown) => {
    calls.push({ method, tenant, input }); if (failure) throw new Error(failure);
  };
  const lifecycle: NativeDocumentLifecycle = {
    async registerLogicalSource(tenant, input) { record("register", tenant, input); return { sourceId: "stable-1" }; },
    async publish(tenant, input) { record("publish", tenant, input); return head; },
    async tombstone(tenant, input) { record("tombstone", tenant, input); return { ...head, status: input.status, headRevision: 2 }; },
    async loadPublished() { return null; },
  };
  return { calls, lifecycle };
}

type RouteLayer = { route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: RequestHandler }> }; handle: RequestHandler };
/** Exercise the actual router's tenant guard, scope middleware and endpoint without sockets/DB. */
async function call(lifecycle: NativeDocumentLifecycle | undefined, method: string, path: string, body: unknown,
  auth: { tenantId: string; scopes: string[]; keyId?: string } | undefined = { tenantId: "a", scopes: ["ingest"], keyId: "verified-key" }) {
  const router = createKnowledgeRouter({ store: {} as KnowledgeStore, nativeDocuments: lifecycle });
  const layers = (router as unknown as { stack: RouteLayer[] }).stack;
  const route = layers.find(layer => layer.route?.path === path && layer.route.methods[method]);
  assert.ok(route?.route, `Missing ${method} ${path}`);
  const guard = layers.find(layer => !layer.route && layer.handle.name !== "router");
  assert.ok(guard, "Missing tenant guard");
  const request = { body, auth, params: { sourceId: "stable-1" } } as unknown as Request;
  let status = 0; let output: unknown;
  const response = {
    status(value: number) { status = value; return this; }, set() { return this; },
    json(value: unknown) { output = value; return this; },
  } as unknown as Response;
  for (const handle of [guard.handle, ...route.route.stack.map(layer => layer.handle)]) {
    let next = false;
    await handle(request, response, () => { next = true; });
    if (!next) break;
  }
  return { status, body: output as Record<string, unknown> };
}

const publishBody = { documentId: "body-1", documentSourceId: "immutable-1", revisionHash: "a".repeat(64), expectedHeadRevision: null };
const path = "/knowledge/document-sources/:sourceId";

test("native registration requires explicit consent and server verified key attribution", async () => {
  const fx = fixture();
  const response = await call(fx.lifecycle, "post", "/knowledge/document-sources", { consentGiven: true, note: "Provided document" });
  assert.equal(response.status, 201); assert.deepEqual(response.body, { sourceId: "stable-1" });
  assert.deepEqual(fx.calls, [{ method: "register", tenant: "a", input: { recordedBy: "verified-key", note: "Provided document" } }]);
  for (const body of [{}, { consentGiven: false }, { consentGiven: true, recordedBy: "forged" }, { consentGiven: true, tenantId: "foreign" }]) {
    assert.equal((await call(fx.lifecycle, "post", "/knowledge/document-sources", body)).status, 400);
  }
  assert.equal((await call(fx.lifecycle, "post", "/knowledge/document-sources", { consentGiven: true }, { tenantId: "a", scopes: ["ingest"] })).status, 401);
  assert.equal(fx.calls.length, 1);
});

test("native publication delegates exact immutable binding and CAS to tenant scoped head store", async () => {
  const fx = fixture();
  assert.equal((await call(fx.lifecycle, "put", path, publishBody)).status, 200);
  assert.equal((await call(fx.lifecycle, "put", path, { ...publishBody, expectedHeadRevision: 2 })).status, 200);
  assert.deepEqual(fx.calls.map(c => c.input), [{ sourceId: "stable-1", ...publishBody }, { sourceId: "stable-1", ...publishBody, expectedHeadRevision: 2 }]);
  assert.ok(fx.calls.every(c => c.tenant === "a"));
  for (const body of [{ ...publishBody, expectedHeadRevision: 0 }, { ...publishBody, expectedHeadRevision: "1" },
    { ...publishBody, expectedHeadRevision: undefined }, { ...publishBody, revisionHash: "bad" }, { ...publishBody, sourceId: "forged" }]) {
    assert.equal((await call(fx.lifecycle, "put", path, body)).status, 400);
  }
  assert.equal(fx.calls.length, 2);
});

test("delete and revoke delegate distinct tombstones and require positive exact CAS revision", async () => {
  const fx = fixture();
  assert.equal((await call(fx.lifecycle, "delete", path, { expectedHeadRevision: 1 })).status, 200);
  assert.equal((await call(fx.lifecycle, "post", path + "/revoke", { expectedHeadRevision: 2 })).status, 200);
  assert.deepEqual(fx.calls.map(c => c.input), [
    { sourceId: "stable-1", expectedHeadRevision: 1, status: "deleted" },
    { sourceId: "stable-1", expectedHeadRevision: 2, status: "revoked" },
  ]);
  for (const body of [{ expectedHeadRevision: null }, { expectedHeadRevision: 0 }, { expectedHeadRevision: 1, status: "published" }]) {
    assert.equal((await call(fx.lifecycle, "delete", path, body)).status, 400);
  }
  assert.equal(fx.calls.length, 2);
});

test("all native mutation routes enforce tenant authentication and ingest scope before delegation", async () => {
  const fx = fixture();
  const endpoints = [
    ["post", "/knowledge/document-sources", { consentGiven: true }], ["put", path, publishBody],
    ["delete", path, { expectedHeadRevision: 1 }], ["post", path + "/revoke", { expectedHeadRevision: 1 }],
  ] as const;
  for (const [method, endpoint, body] of endpoints) {
    assert.equal((await call(fx.lifecycle, method, endpoint, body, { tenantId: "a", scopes: ["sessions"], keyId: "reader" })).status, 403);
    assert.equal((await call(fx.lifecycle, method, endpoint, body, { tenantId: "", scopes: ["ingest"], keyId: "bad" })).status, 401);
    assert.equal((await call(undefined, method, endpoint, body)).status, 503);
  }
  assert.equal(fx.calls.length, 0);
});

test("store conflicts/unavailable/invalid bindings fail without publication claims or internal error disclosure", async () => {
  for (const [reason, status] of [["native_document_head_conflict", 409], ["native_document_source_unavailable", 404],
    ["native_document_invalid_binding", 422], ["native_document_index_timeout", 503], ["private database detail", 503]] as const) {
    const response = await call(fixture(reason).lifecycle, "put", path, publishBody);
    assert.equal(response.status, status);
    assert.equal("head" in response.body, false);
    assert.equal("indexed" in response.body, false);
    assert.equal(JSON.stringify(response.body).includes(reason), false);
  }
});
