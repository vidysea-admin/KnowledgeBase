import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import type { Claims, Sessions } from "../../../packages/core/src/index.js";
import { scopedCollection } from "../../../packages/db/src/lib/tenantScope.js";
import { createMongoClaimsListDeps, type ClaimsListReaders } from "../../../apps/api/src/claims/store.js";
import { createKnowledgeMetadataVisibility } from "../../../apps/api/src/knowledge/metadata-visibility.js";

function fixture(withTopic: boolean) {
  const tenantId = "checker", topicId = "checker:unapproved-whatsapp-private-topic";
  const claim = { _id: "claim-doc", tenantId, text: "Public document tuition is 12.", status: "verified", confidence: 0.7,
    ...(withTopic ? { topicRefs: [topicId] } : {}), evidence: [{ turnId: "turn-doc", sessionId: "session-doc", quote: "Public document tuition is 12." }] };
  const topic = { _id: topicId, tenantId, name: "UNAPPROVED WhatsApp topic", sessionRefs: ["session-doc", "session-wa"] };
  const rows: Record<string, Record<string, unknown>[]> = {
    claims: [claim], topics: [topic],
    sources: [{ _id: "source-doc", tenantId, kind: "document" }, { _id: "source-wa", tenantId, kind: "whatsapp-batch", path: "group" }],
    sessions: [{ _id: "session-doc", tenantId, sourceId: "source-doc", title: "Public document" }, { _id: "session-wa", tenantId, sourceId: "source-wa", title: "PRIVATE group" }],
    turns: [{ _id: "turn-doc", tenantId, sessionId: "session-doc", text: claim.text, speakerRef: "document", tStart: 0, tEnd: 1 }],
  };
  const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && "$gt" in value) return String(row[key]) > String((value as { $gt: unknown }).$gt);
    return row[key] === value;
  });
  const db = { collection(name: string) { return {
    async findOne(filter: Record<string, unknown>) { return structuredClone((rows[name] ?? []).find(row => matches(row, filter)) ?? null); },
    find(filter: Record<string, unknown>) {
      let start = 0, take = Infinity;
      const cursor = { sort() { return cursor; }, skip(n: number) { start = n; return cursor; }, limit(n: number) { take = n; return cursor; },
        async toArray() { return structuredClone((rows[name] ?? []).filter(row => matches(row, filter)).slice(start, start + take)); } };
      return cursor;
    },
  }; } } as unknown as Db;
  const readers = { claims: scopedCollection<Claims>(db, "claims"), sessions: scopedCollection<Sessions>(db, "sessions") } as unknown as ClaimsListReaders;
  return { db, claim, topic, topicId, tenantId, store: createMongoClaimsListDeps(readers, () => db) };
}

test("independent actual claims projection must not reveal a cached topic ID whose WhatsApp contribution is withheld", async () => {
  const f = fixture(true);
  assert.equal(await createKnowledgeMetadataVisibility(f.db).memberVisible(f.tenantId, "topic", f.topic), false, "actual catalog policy must withhold this mixed topic");
  const result = await f.store.listClaims(f.tenantId, { limit: 10, offset: 0 });
  assert.equal(result.claims.length, 1, "the ordinary document claim remains valid");
  assert.equal(result.claims[0]!.text, f.claim.text);
  assert.ok(!JSON.stringify(result).includes(f.topicId), "withheld literal topic slug leaked through an otherwise valid document claim");
});

test("independent claims control preserves ordinary document text and confidence", async () => {
  const f = fixture(false);
  const result = await f.store.listClaims(f.tenantId, { limit: 10, offset: 0 });
  assert.equal(result.claims[0]!.text, f.claim.text);
  assert.equal(result.claims[0]!.confidence, 0.7);
  assert.equal(result.truncated, false);
});
