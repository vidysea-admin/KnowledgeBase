import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createMongoKnowledgeCatalog, publicResourceUrl } from "./catalog-store.js";
type Row = Record<string, any>;
function fixture() {
  const rows: Record<string, Row[]> = {
    topics: [{ _id: "a:visas", tenantId: "a", name: "Visas", sessionRefs: ["sa"] }, { _id: "b:visas", tenantId: "b", name: "Foreign visas" }],
    claims: [{ _id: "c1", tenantId: "a", topicRefs: ["a:visas"], text: "Admissions evidence", status: "needs-review", confidence: 0.7, evidence: [{ sessionId: "sa", turnId: "ta", quote: "Real source quote" }] },
      { _id: "suffix-forgery", tenantId: "a", topicRefs: ["b:visas"], text: "Do not show suffix forgery", status: "verified", evidence: [{ sessionId: "sa", turnId: "ta" }] },
      { _id: "missing", tenantId: "a", topicRefs: ["a:visas"], text: "Missing source", status: "verified", evidence: [{ sessionId: "sb", turnId: "tb" }] }],
    sessions: [{ _id: "sa", tenantId: "a", title: "Own session", sourceId: "source" }, { _id: "sb", tenantId: "b", title: "Foreign session" }],
    turns: [{ _id: "ta", tenantId: "a", sessionId: "sa", speakerRef: "document", text: "Real source quote", tStart: 400, tEnd: 417 }],
    sources: [{ _id: "source", tenantId: "a", kind: "url", createdAt: "2026-10-14", url: "https://example.org/resource", path: "SECRET_LOCAL_PATH", privateToken: "SECRET_TOKEN" },
      { _id: "unsafe", tenantId: "a", kind: "document", createdAt: "2026-10-14", url: "javascript:alert(1)" },
      { _id: "foreign", tenantId: "b", kind: "document", createdAt: "2026-10-14", path: "FOREIGN_PATH" }],
    programs: [{ _id: "program", tenantId: "a", name: "Recorded label", orgRef: "Foreign university", sessionRefs: ["sa"] }],
    knowledge_collections: [{ _id: "collection-a", tenantId: "a", members: [{ kind: "topic", id: "a:visas" }, { kind: "document", id: "document-a" }, { kind: "document", id: "document-b" }] },
      { _id: "collection-b", tenantId: "b", members: [{ kind: "topic", id: "a:visas" }, { kind: "document", id: "document-b" }] }],
    document_documents: [{ _id: "document-a", sourceId: "document-a", version: "a".repeat(64), tenantId: "a", title: "Source document", pages: [{ pageNumber: 1, text: "Exact quote" }] },
      { _id: "document-b", tenantId: "b", title: "Foreign document", pages: [{ pageNumber: 1, text: "Foreign quote" }] }],
  };
  const calls: Array<{ name: string; filter: Row }> = [];
  const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([k, v]) => v && typeof v === "object" && "$elemMatch" in v ? Array.isArray(row[k]) && row[k].some((m: Row) => matches(m, v.$elemMatch)) : Array.isArray(row[k]) ? row[k].includes(v) : row[k] === v);
  const db = { collection(name: string) { return {
    find(filter: Row) { calls.push({ name, filter }); return { toArray: async () => structuredClone((rows[name] ?? []).filter(r => matches(r, filter))) }; },
    async findOne(filter: Row) { calls.push({ name, filter }); return structuredClone((rows[name] ?? []).find(r => matches(r, filter)) ?? null); },
  }; } } as unknown as Db;
  return { db, calls, rows };
}
test("actual catalog store matches exact tenant-namespaced topic ref and resolves only owned exact evidence", async () => {
  const fx = fixture(); const catalog = createMongoKnowledgeCatalog(fx.db); const detail = await catalog.topic("a", "a:visas");
  assert.equal(detail!.claims.length, 1); assert.equal(detail!.claims[0]!.id, "c1"); assert.equal(detail!.withheldClaims, 0);
  assert.equal(detail!.claims[0]!.evidence[0]!.quote, "Real source quote"); assert.equal(detail!.claims[0]!.evidence[0]!.coordinate, "character-offset");
  assert.deepEqual(detail!.sessions, [{ id: "sa", title: "Own session" }]); assert.equal(await catalog.topic("a", "b:visas"), null);
  assert.equal(detail!.documents.length, 1); assert.equal(detail!.documents[0]!.id, "document-a"); assert.equal(detail!.documents[0]!.association, "co-curated-unverified");
  assert.ok(fx.calls.every(c => c.filter.tenantId === "a")); assert.equal(fx.calls.find(c => c.name === "claims")!.filter.topicRefs, "a:visas");
});
test("recorded programs/resources retain unverified state, safe URLs and owned sessions with no path/private extras", async () => {
  const fx = fixture(); const result = await createMongoKnowledgeCatalog(fx.db).resources("a");
  assert.equal(result.resources.length, 2); assert.equal(result.resources[1]!.url, null); assert.equal(result.programs[0]!.classification, "unclassified");
  assert.equal(result.programs[0]!.organization, "unverified"); assert.equal(result.programs[0]!.sessions.length, 1);
  assert.ok(!JSON.stringify(result).includes("SECRET")); assert.ok(!JSON.stringify(result).includes("Foreign")); assert.ok(fx.calls.every(c => c.filter.tenantId === "a"));
});
test("public links refuse unsafe protocols, credentials, whitespace and controls", () => {
  for (const v of ["javascript:alert(1)", "https://user:pass@example.org", " https://example.org", "https://example.org\n", "file:///tmp/doc"]) assert.equal(publicResourceUrl(v), null);
  assert.equal(publicResourceUrl("https://example.org/doc"), "https://example.org/doc");
});

test("raw WhatsApp and mixed cached metadata cannot leak through catalogs or resources", async () => {
  const fx = fixture();
  fx.rows.sources!.push({ _id: "wa-source", tenantId: "a", kind: "whatsapp-batch", path: "PRIVATE_GROUP", createdAt: "2026-10-14" });
  fx.rows.sessions!.push({ _id: "wa-session", tenantId: "a", sourceId: "wa-source", title: "PRIVATE_GROUP_TITLE" });
  fx.rows.topics!.push({ _id: "tainted", tenantId: "a", name: "PRIVATE_MIXED_TOPIC", sessionRefs: ["sa", "wa-session"] });
  fx.rows.programs!.push({ _id: "tainted-program", tenantId: "a", name: "PRIVATE_MIXED_PROGRAM", sessionRefs: ["sa", "wa-session"] });
  fx.rows.claims!.push({ _id: "wa-claim", tenantId: "a", topicRefs: ["a:visas"], text: "PRIVATE_MESSAGE", status: "verified", evidence: [{ sessionId: "wa-session", turnId: "wa-turn", quote: "PRIVATE_MESSAGE" }] });
  fx.rows.turns!.push({ _id: "wa-turn", tenantId: "a", sessionId: "wa-session", speakerRef: "PRIVATE_SENDER", text: "PRIVATE_MESSAGE", tStart: 0, tEnd: 1 });
  const catalog = createMongoKnowledgeCatalog(fx.db);
  assert.equal(await catalog.topic("a", "tainted"), null);
  const output = { topics: await catalog.topics("a"), detail: await catalog.topic("a", "a:visas"), resources: await catalog.resources("a") };
  assert.equal(output.detail!.withheldClaims, 0); assert.ok(!JSON.stringify(output).includes("PRIVATE"));
  assert.equal(output.resources.programs.length, 1); assert.equal(output.resources.resources.length, 2);
  for (let i = 0; i < 101; i++) fx.rows.claims!.push({ ...fx.rows.claims!.at(-1), _id: `pending-${i}` });
  for (let i = 0; i < 101; i++) fx.rows.sources!.push({ _id: `wa-${i}`, tenantId: "a", kind: "whatsapp-batch", createdAt: "2026-10-14" });
  assert.equal((await catalog.topic("a", "a:visas"))!.truncated, false);
  assert.equal((await catalog.resources("a")).truncated, false); // Hidden rows cannot influence trusted aggregate counts/flags.
});
