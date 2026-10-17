import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { createMongoOutputRepository } from "./repository.js";
import type { OutputDraft } from "./types.js";
import { outputAssessmentDigest } from "./assessment.js";

/** Explicit isolated integration opt-in. Never reads .env or connects using a default credential. */
test("real Mongo drafts survive repository recreation and tenant/CAS boundaries", { skip: !process.env.LKB_T058_MONGO_URI, timeout: 30000 }, async () => {
  const databaseName = `test_t058_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(process.env.LKB_T058_MONGO_URI!, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(databaseName);
  assert.match(db.databaseName, /^test_t058_[a-f0-9]{32}$/u);
  try {
    const repository = createMongoOutputRepository(db), now = new Date().toISOString();
    const draft: OutputDraft = { _id: randomUUID(), tenantId: "a", kind: "faq", title: "Isolated persistence", purpose: "Verify durable drafts",
      sessionIds: ["s1"], revision: 1, createdAt: now, updatedAt: now, sourceDigest: "0".repeat(64), sourceCoverage: { status: "ready", withheldClaims: 0 }, provider: "fixture", model: "fixture", reviewState: "draft",
      sections: [{ key: "faq", title: "Questions and answers", missing: "", items: [{ id: "faq-1", kind: "fact", text: "Q: When?\nA: Monday.", citationIds: ["e1"], validation: "ai-supported", assessmentDigest: "" }] }],
      citations: [{ id: "e1", claimId: "c1", turnId: "t1", sessionId: "s1", speakerRef: "speaker:1", start: 0, end: 2, unit: "seconds", quote: "Monday.", href: "/sessions/s1#turn-t1" }] };
    for (const section of draft.sections) for (const item of section.items) item.assessmentDigest = outputAssessmentDigest(draft.sourceDigest, item);
    await repository.insert("a", draft);
    await client.close();
    await client.connect();
    const recreated = createMongoOutputRepository(client.db(databaseName));
    assert.deepEqual(await recreated.get("a", draft._id), draft);
    assert.equal(await recreated.get("b", draft._id), null); assert.deepEqual(await recreated.list("b"), []);
    await assert.rejects(recreated.insert("b", draft));
    assert.equal(await recreated.replace("b", { ...draft, tenantId: "b", revision: 2 }, 1), false);
    const concurrent = await Promise.all(["Writer 1", "Writer 2"].map((title) => recreated.replace("a", { ...draft, title, revision: 2 }, 1)));
    assert.equal(concurrent.filter(Boolean).length, 1); assert.equal((await recreated.get("a", draft._id))!.revision, 2);
  } finally {
    // The name is allocated in this test, never derived from a credential URI or user-supplied target.
    assert.match(databaseName, /^test_t058_[a-f0-9]{32}$/u);
    try { await client.db(databaseName).dropDatabase(); } finally { await client.close(); }
  }
});
