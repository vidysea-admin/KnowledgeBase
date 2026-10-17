/**
 * Privacy: `/sources` and `/knowledge/resources` must never emit local filesystem paths
 * (contract goal-t055 C6), including nested ones. Stored rows keep `path`; only the response is projected.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { Sources } from "@lkb/core";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeBrainReadDeps } from "../fixtures.js";
import { createMongoKnowledgeCatalog } from "./catalog-store.js";

const BS = String.fromCharCode(92);
const WIN = ["C:", "Users", "umesh", "Private", "secret-recording.mp4"].join(BS);
const POSIX = "/home/umesh/private/secret-recording.mp4";
const FORBIDDEN = ["C:" + BS, "Private", "secret-recording", "/home/umesh", "umesh"];

function leaky(): Sources[] {
  return [
    { _id: "s1", tenantId: "tenant-1", kind: "recording", captureMode: "provided", path: WIN, hash: "h1", createdAt: "2026-10-01",
      consent: { given: true, recordedBy: "ops", note: POSIX }, sourceMeta: { path: POSIX, filePath: WIN, nested: { localPath: WIN, storagePath: POSIX, absolutePath: WIN } },
      filePath: WIN, localPath: POSIX, storagePath: WIN, absolutePath: POSIX } as unknown as Sources,
    { _id: "s2", tenantId: "tenant-1", kind: "url", captureMode: "public", path: POSIX, url: "file:///home/umesh/private/secret-recording.mp4", hash: "h2", createdAt: "2026-10-02",
      consent: { given: false, recordedBy: "ops" } } as unknown as Sources,
    { _id: "s3", tenantId: "tenant-1", kind: "url", captureMode: "public", url: "https://example.org/talk", hash: "h3", createdAt: "2026-10-03",
      consent: { given: true, recordedBy: "ops" } } as unknown as Sources,
  ];
}
function assertNoPaths(json: string): void {
  assert.ok(!json.includes(WIN) && !json.includes(POSIX), "response contains a planted path");
  for (const needle of FORBIDDEN) assert.ok(!json.includes(needle), `response contains ${needle}`);
  assert.ok(!/"(path|filePath|localPath|absolutePath|storagePath)"\s*:/.test(json), "response has a path-like key");
}

test("GET /sources strips path-like fields (top-level and nested) and keeps the allowlisted view", async () => {
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({ k: { tenantId: "tenant-1", scopes: ["sources"] } }),
    brain: fakeBrainReadDeps({ listSources: async () => leaky() }),
  }));
  try {
    const res = await fetch(`${server.baseUrl}/sources`, { headers: { authorization: "Bearer k" } });
    assert.equal(res.status, 200);
    const text = await res.text();
    assertNoPaths(text);
    const body = JSON.parse(text) as { sources: Array<Record<string, any>> };
    assert.equal(body.sources.length, 3);
    assert.equal(body.sources[0]!._id, "s1");
    assert.deepEqual(body.sources[0]!.consent, { given: true, recordedBy: "ops" });
    assert.equal(body.sources[1]!.url, undefined);
    assert.equal(body.sources[2]!.url, "https://example.org/talk");
  } finally { await server.close(); }
});

test("catalog resources (the /knowledge/resources source) emits no path-like data", async () => {
  type Row = Record<string, any>;
  const rows: Record<string, Row[]> = {
    sources: leaky().map(r => ({ ...r, tenantId: "a" })), programs: [],
    sessions: [{ _id: "sa", tenantId: "a", title: "Own session", sourceId: "s3" }], turns: [], claims: [],
  };
  const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([k, v]) => v && typeof v === "object" && "$elemMatch" in v ? Array.isArray(row[k]) && row[k].some((m: Row) => matches(m, v.$elemMatch)) : Array.isArray(row[k]) ? row[k].includes(v) : row[k] === v);
  const db = { collection(name: string) { return {
    find: (filter: Row) => ({ toArray: async () => structuredClone((rows[name] ?? []).filter(r => matches(r, filter))) }),
    findOne: async (filter: Row) => structuredClone((rows[name] ?? []).find(r => matches(r, filter)) ?? null),
  }; } } as unknown as Db;
  const result = await createMongoKnowledgeCatalog(db).resources("a");
  assert.ok(result.resources.length >= 2);
  assertNoPaths(JSON.stringify(result));
});
