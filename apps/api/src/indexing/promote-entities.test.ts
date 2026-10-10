/**
 * apps/api/src/indexing/promote-entities.test.ts — ISS-126.
 *
 * WHY THIS FILE EXISTS: cycle 1 shipped a 102-line writer with **no test at all**. The checker
 * mutated `{ upsert: true }` to `{ upsert: false }` at both write sites — turning the entire
 * promotion into a no-op — and `apps/api` still reported 130/130 green. Combined with the
 * deliberate decision not to run a live backfill, that meant the persistence half of U2.1 had
 * never executed against anything, real or fake.
 *
 * I tested the PURE promotion thoroughly (10 cases in packages/index) and then left the part that
 * actually touches the database unasserted — which is the same shape as this project's own
 * repeated untested-guard failures (ISS-056's first fix, ISS-060, ISS-118).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { promoteAndPersistEntities, entityId, topicPreviewLine } from "./promote-entities.js";
import { indexSession } from "./session.js";
import { fakeDb, completeWith, type Call } from "./testutils.js";
import type { TreeIndexNode } from "@lkb/core";

const node = (id: string, title: string, level: string, evidence?: unknown): TreeIndexNode =>
  ({ node_id: id, title, level, summary: "", children: [], ...(evidence ? { evidence } : {}) }) as never;

/** A root carrying one topic across two sessions, plus one org. */
function treeRoot(): TreeIndexNode {
  const root = node("tenant:t", "t", "root");
  root.children.push(node("tenant:t/2026/06/session:s1/topic:visa-rules", "Visa Rules", "topic",
    { sessionRef: "s1", sessionRefs: ["s1", "s2"] }));
  root.children.push(node("tenant:t/2026/06/session:s1/org:acme", "Acme", "org", { sessionRef: "s1" }));
  return root;
}

/**
 * ISS-C-TOPICREFS-ARG-001. `treeRoot()`'s one topic spans BOTH s1 and s2, so passing either session
 * id to `topicRefsForSession` yields the same result — no fixture built from `treeRoot()` can tell
 * which `sessionId` a caller actually passed. This root adds a second topic whose `sessionRefs`
 * EXCLUDES s1, so the two sessions surface different topic sets and the argument's value becomes
 * observable in the write it produces.
 */
function treeRootExclusiveTopics(): TreeIndexNode {
  const root = node("tenant:t", "t", "root");
  root.children.push(node("tenant:t/2026/06/session:s1/topic:visa-rules", "Visa Rules", "topic",
    { sessionRef: "s1", sessionRefs: ["s1"] }));
  root.children.push(node("tenant:t/2026/06/session:s2/topic:funding", "Funding", "topic",
    { sessionRef: "s2", sessionRefs: ["s2"] }));
  return root;
}

const writes = (calls: Call[], coll: string) => calls.filter((c) => c.coll === coll && c.op === "updateOne");

test("ISS-126: topics and orgs are UPSERTED — a mutation to upsert:false must not pass unnoticed", async () => {
  // The exact mutation that survived cycle 1. Without `upsert`, nothing exists to match, so every
  // write silently does nothing and the collections stay empty forever.
  const { db, calls } = fakeDb();
  const res = await promoteAndPersistEntities("t", "s1", treeRoot(), db);

  const t = writes(calls, "topics");
  const o = writes(calls, "orgs");
  assert.equal(t.length, 1, "one topic row");
  assert.equal(o.length, 1, "one org row");
  assert.deepEqual(t[0]!.options, { upsert: true }, "without upsert the write is a permanent no-op");
  assert.deepEqual(o[0]!.options, { upsert: true });
  assert.equal(res.topics, 1);
  assert.equal(res.orgs, 1);
  assert.equal(res.skipped, null);
});

test("ISS-126: promotion NEVER deletes — a topic row spans sessions, so delete-then-insert would drop other sessions' evidence", async () => {
  // The ISS-056 shape one level up: chunks can clean-replace because a chunk belongs to one
  // session; a topic row does not.
  const { db, calls } = fakeDb();
  await promoteAndPersistEntities("t", "s1", treeRoot(), db);
  for (const coll of ["topics", "orgs"]) {
    assert.equal(calls.filter((c) => c.coll === coll && c.op === "deleteMany").length, 0,
      `${coll} must never be deleted — its rows carry cross-session evidence`);
  }
});

test("ISS-156: the ORG body carries tenantId too — the topic assertion alone left orgs unpinned", async () => {
  // Dropping tenantId from the org $set survived 161/0 while the identical topic mutation reddened:
  // the same topics-vs-orgs asymmetry as ISS-154, one layer in. Live impact is nil today because
  // scopedCollection merges withTenant into the filter and Mongo builds the upsert-insert from it —
  // but "harmless because something else covers it" is how the first asymmetry survived too.
  const { db, calls } = fakeDb();
  await promoteAndPersistEntities("t", "s1", treeRoot(), db);
  const orgSet = (writes(calls, "orgs")[0]!.update as Record<string, Record<string, unknown>>).$set!;
  assert.equal(orgSet.tenantId, "t", "the org body must carry its tenantId, exactly as the topic body does");
  assert.equal(orgSet.name, "Acme");
});

test("ISS-126: the written topic carries the UNIONED sessionRefs, not just the indexed session", async () => {
  // If this regressed to `[sessionId]`, every topic would look single-session and the one signal
  // that makes a topic worth being an entity would be gone.
  const { db, calls } = fakeDb();
  await promoteAndPersistEntities("t", "s1", treeRoot(), db);
  const set = (writes(calls, "topics")[0]!.update as Record<string, Record<string, unknown>>).$set!;
  assert.deepEqual(set.sessionRefs, ["s1", "s2"]);
  assert.equal(set.name, "Visa Rules");
  assert.equal(set.tenantId, "t");
});

test("ISS-126/ISS-202: every write is tenant-scoped on filter AND body", async () => {
  // ISS-202. The version this replaces was VACUOUS in three separate ways, and it is the one test
  // in this file whose subject is tenancy — the security class this repo never round-caps.
  //
  //   for (const c of calls.filter(...)) {
  //     const body = c.update?.$set;
  //     if (body && "tenantId" in body) { assert.equal(body.tenantId, "tenant-a"); }
  //   }
  //
  //   1. the filtered array was never asserted non-empty — zero writes means the loop body never
  //      runs and the test passes having checked nothing;
  //   2. the body check was GATED on `"tenantId" in body`, so an implementation that drops
  //      tenantId from `$set` entirely skips the assertion instead of failing it. That is exactly
  //      the mutation ISS-156 records as having SURVIVED on the org body;
  //   3. it never checked the FILTER half of its own name.
  //
  // Every assertion below is therefore unconditional, and the non-emptiness is asserted first so
  // nothing downstream can pass by iterating an empty list.
  const { db, calls } = fakeDb();
  await promoteAndPersistEntities("tenant-a", "s1", treeRoot(), db);

  const scoped = calls.filter((x) => ["topics", "orgs", "claims"].includes(x.coll));
  assert.ok(scoped.length > 0, "NON-VACUITY: no writes were captured, so this test would assert nothing");

  // Both entity collections must actually have been written, or "every write" is a claim about a
  // set that silently shrank.
  for (const coll of ["topics", "orgs"]) {
    assert.ok(scoped.some((c) => c.coll === coll), `no ${coll} write captured`);
  }

  // Reads and writes are partitioned rather than filtered down to writes. Writing this the first
  // time, the unconditional body assertion tripped on `claims.find` — a READ, which has no `$set`.
  // The reflex is to narrow the loop to writes; that would drop the read entirely, and an unscoped
  // READ is this repo's most expensive defect to date (ISS-078, a cross-tenant disclosure that
  // survived four PASSes). So reads are checked too, on the filter alone.
  const isWrite = (op: string) => op.startsWith("update") || op.startsWith("insert") || op.startsWith("replace");

  // ISS-211. The first version of this helper accepted `_id.includes(tenant)` for EVERY operation.
  // Because the entity writes filter on a namespaced `_id`, that disjunct absorbed them: removing
  // `tenantId` from the write filter still passed a test named "tenant-scoped ON FILTER and body".
  // The assertion was unfalsifiable on exactly the half its name promises, and the manifest claimed
  // the opposite. Split by operation so the name is literally true:
  //
  //   WRITES — require `tenantId` in the filter itself. A namespaced `_id` guards against
  //            COLLISION (ISS-121), not against an unscoped update; those are different
  //            guarantees and the old helper conflated them.
  //   READS  — the namespaced-`_id` disjunct is allowed: fetching one row by an id that already
  //            contains the tenant cannot cross a tenant boundary.
  //
  // A lone `sessionId` counts for neither — session ids are not tenant-namespaced.
  const hasTenantField = (f: Record<string, unknown> | undefined) => !!f && f.tenantId === "tenant-a";
  const idIsNamespaced = (f: Record<string, unknown> | undefined) =>
    !!f && typeof f._id === "string" && f._id.startsWith("tenant-a:");

  let writeCount = 0;
  for (const c of scoped) {
    const where = `${c.coll}.${c.op}`;

    // FILTER — for reads AND writes. The half the old test's own name promised and never checked.
    // A correctly-scoped body behind an unscoped filter still touches another tenant's row.
    assert.ok(
      isWrite(c.op) ? hasTenantField(c.filter) : hasTenantField(c.filter) || idIsNamespaced(c.filter),
      `${where}: filter is not tenant-scoped — ${JSON.stringify(c.filter)}. A WRITE must carry ` +
        `tenantId in the filter itself; a namespaced _id counts only for a READ; a lone sessionId ` +
        `counts for neither.`,
    );

    if (!isWrite(c.op)) continue;
    writeCount++;

    // BODY — unconditional for writes. Presence is asserted BEFORE value, so an implementation
    // that drops tenantId from `$set` fails here instead of skipping the check. That is the
    // ISS-156 mutation which this file itself records as having survived.
    const body = (c.update as Record<string, Record<string, unknown>> | undefined)?.$set;
    assert.ok(body, `${where}: a write with no $set body`);
    assert.ok("tenantId" in body, `${where}: $set MUST carry tenantId — dropping it used to pass`);
    assert.equal(body.tenantId, "tenant-a", `${where} wrote another tenant's id into the body`);
  }
  assert.ok(writeCount > 0, "NON-VACUITY: the body half asserted nothing — no writes were seen");
});

test("ISS-126: promotion NEVER THROWS — a write failure must not strand the session (ISS-121's lesson)", async () => {
  const exploding = {
    collection(name: string) {
      const real = (fakeDb().db as unknown as { collection: (n: string) => Record<string, unknown> }).collection(name);
      if (name !== "topics") return real;
      return { ...real, updateOne: async () => { throw new Error("boom"); } };
    },
  } as never;
  const res = await promoteAndPersistEntities("t", "s1", treeRoot(), exploding);
  assert.equal(res.skipped, "promotion-failed", "the failure must be reported, not thrown");
  assert.equal(res.topics, 0);
});

test("ISS-126: tagClaims:false issues NO claims operation at all (the ISS-056 invariant)", async () => {
  const { db, calls } = fakeDb();
  await promoteAndPersistEntities("t", "s1", treeRoot(), db, { tagClaims: false });
  assert.deepEqual(calls.filter((c) => c.coll === "claims"), [],
    "a degraded claims run must see no claims read OR write from promotion");
});

test("ISS-126: an empty tree writes nothing rather than writing empty rows", async () => {
  const { db, calls } = fakeDb();
  const res = await promoteAndPersistEntities("t", "s1", node("tenant:t", "t", "root"), db);
  assert.equal(writes(calls, "topics").length, 0);
  assert.equal(writes(calls, "orgs").length, 0);
  assert.equal(res.skipped, null, "nothing to promote is a success, not a failure");
});

/* ── ISS-126 item (4): the tagClaims:TRUE path was unreachable in all 137 tests ────────────────
 * Cycle 2's writer tests asserted `tagClaims: false` writes nothing, and stopped there. But
 * `fakeDb.find` returned `[]` for `claims`, so the branch that actually WRITES topicRefs never
 * executed — mutating `{ $set: { topicRefs: refs } }` to `{ $set: { topicRefs: [] } }` left the
 * suite fully green. ISS-126's own fix_direction had warned in advance: "extend fakeDb rather than
 * assuming an untested op is unreachable." I asserted the negative case and mistook it for
 * covering both.
 */
test("ISS-126(4): tagClaims writes the session's REAL topicRefs onto each of its claims", async () => {
  const { db, calls } = fakeDb({
    claims: [
      { _id: "c1", tenantId: "t", text: "a", evidence: [{ turnId: "t1", sessionId: "s1" }] },
      { _id: "c2", tenantId: "t", text: "b", evidence: [{ turnId: "t2", sessionId: "s1" }] },
    ],
  });
  const res = await promoteAndPersistEntities("t", "s1", treeRoot(), db);

  const claimWrites = calls.filter((c) => c.coll === "claims" && c.op === "updateOne");
  assert.equal(claimWrites.length, 2, "every claim of this session must be tagged");
  assert.equal(res.claimsTagged, 2);
  for (const w of claimWrites) {
    const set = (w.update as Record<string, Record<string, unknown>>).$set!;
    assert.deepEqual(set.topicRefs, ["t:visa-rules"],
      "the REAL topic slugs must be written — an empty array here is the mutation that stayed green");
  }
});

test("ISS-126(4): a session whose tree surfaced NO topics clears topicRefs rather than leaving them stale", async () => {
  // Writing [] is correct here and is a different case from the bug above: it removes a tagging
  // from a previous build whose topic no longer exists in the tree.
  // The claim is seeded on s1 — the session being indexed. The first version of this test seeded
  // it on "other" and still expected it visited, which ENCODED UNSCOPED BEHAVIOUR AS EXPECTED
  // (ISS-C-CLAIMS-TARGETING-001): it would have passed just as happily against a `.find({})`.
  const { db, calls } = fakeDb({ claims: [{ _id: "c1", tenantId: "t", evidence: [{ turnId: "t1", sessionId: "s1" }] }] });
  const root = node("tenant:t", "t", "root"); // no topic nodes at all
  await promoteAndPersistEntities("t", "s1", root, db);
  const w = calls.find((c) => c.coll === "claims" && c.op === "updateOne");
  assert.ok(w, "the claim is still visited");
  assert.deepEqual((w!.update as Record<string, Record<string, unknown>>).$set!.topicRefs, []);
});

/* ── ISS-C-CLAIMS-TARGETING-001: assert what the writes are AIMED AT, not just what they carry ──
 * Nine writer tests asserted the update BODY and the call COUNT and never the FILTER, so both
 * `.find({"evidence.sessionId": id})` -> `.find({})` and `.updateOne({_id})` -> `.updateOne({})`
 * survived at 139/139. `fakeDb` had recorded the filters all along; nothing read them.
 *
 * This is the third guard in this unit that looked like a guard and defended nothing. The pattern
 * is consistent enough to name: I assert the value a write CARRIES and forget the predicate that
 * decides WHICH ROWS it reaches — and the second one is where tenancy and scoping live.
 */
test("ISS-C-TARGETING: the claims read is scoped to THIS session, not the whole collection", async () => {
  const { db, calls } = fakeDb({
    claims: [
      { _id: "mine", tenantId: "t", evidence: [{ turnId: "t1", sessionId: "s1" }] },
      { _id: "other-session", tenantId: "t", evidence: [{ turnId: "t9", sessionId: "s-other" }] },
    ],
  });
  const res = await promoteAndPersistEntities("t", "s1", treeRoot(), db);

  const find = calls.find((c) => c.coll === "claims" && c.op === "find");
  assert.ok(find, "a claims read must happen");
  assert.deepEqual(find!.filter?.["evidence.sessionId"], "s1",
    "widening this to {} would re-tag every session's claims on every single-session index");
  assert.equal(res.claimsTagged, 1, "only this session's claim may be tagged");
  const writes = calls.filter((c) => c.coll === "claims" && c.op === "updateOne");
  assert.deepEqual(writes.map((w) => w.filter?._id), ["mine"], "the other session's claim must be untouched");
});

test("ISS-C-TARGETING: each claim update targets ONE claim by _id, never an open filter", async () => {
  const { db, calls } = fakeDb({
    claims: [
      { _id: "c1", tenantId: "t", evidence: [{ turnId: "t1", sessionId: "s1" }] },
      { _id: "c2", tenantId: "t", evidence: [{ turnId: "t2", sessionId: "s1" }] },
    ],
  });
  await promoteAndPersistEntities("t", "s1", treeRoot(), db);
  const writes = calls.filter((c) => c.coll === "claims" && c.op === "updateOne");
  assert.equal(writes.length, 2);
  for (const w of writes) {
    assert.ok(w.filter && typeof w.filter._id === "string" && w.filter._id.length > 0,
      "updateOne({}) would overwrite an arbitrary claim's topicRefs instead of the intended one");
  }
  assert.deepEqual(writes.map((w) => w.filter!._id).sort(), ["c1", "c2"]);
});

test("ISS-C-TARGETING: topic and org upserts target their own _id, not an open filter", async () => {
  const { db, calls } = fakeDb();
  await promoteAndPersistEntities("t", "s1", treeRoot(), db);
  assert.equal((writes(calls, "topics")[0]!.filter as Record<string, unknown>)._id, "t:visa-rules");
  assert.equal((writes(calls, "orgs")[0]!.filter as Record<string, unknown>)._id, "t:acme");
});

/* ── ISS-C-TOPICREFS-ARG-001: the claims write is keyed to the ARGUMENT sessionId, not any topic ──
 * `tagClaimsForSession` calls `topicRefsForSession(sessionId, topics)` — every prior test in this
 * file called it through `treeRoot()`, whose single topic's `sessionRefs` is `["s1","s2"]`, so s1
 * and s2 both resolve to the SAME topic set and no assertion here could tell which value the
 * argument actually carried. A checker's mutation to a hard-coded "s2" reproduced this: apps/api
 * stayed green. `treeRootExclusiveTopics()` gives the two sessions disjoint topic sets so the
 * argument's value is load-bearing in the write it produces.
 */
test("ISS-C-TOPICREFS-ARG-001: a claim is tagged with the INDEXED session's topics, not the other session's", async () => {
  const { db, calls } = fakeDb({
    claims: [{ _id: "c1", tenantId: "t", evidence: [{ turnId: "t1", sessionId: "s1" }] }],
  });
  const res = await promoteAndPersistEntities("t", "s1", treeRootExclusiveTopics(), db);

  const claimWrites = calls.filter((c) => c.coll === "claims" && c.op === "updateOne");
  assert.equal(claimWrites.length, 1);
  const set = (claimWrites[0]!.update as Record<string, Record<string, unknown>>).$set!;
  assert.deepEqual(set.topicRefs, [entityId("t", "visa-rules")],
    "s1 only surfaced 'visa-rules' — 'funding' is s2-exclusive and must not appear; a hard-coded " +
      "or swapped sessionId argument would write [\"t:funding\"] here instead");
  assert.equal(res.claimsTagged, 1);
});

/* ── C6: corpus-wide entity ids must not collide across tenants ────────────────────────────────
 * REPRODUCED LIVE before fixing: two scratch tenants upserting the slug `uk` into `topics` — A
 * inserted, B failed `E11000 duplicate key ... index: _id_`. `scopedCollection` merges tenantId
 * into the FILTER, but Mongo's `_id_` index is unique per COLLECTION.
 *
 * This is the SECOND time this project has paid for this exact shape. ISS-121 was the same bug in
 * `recordVectorGap`, fixed by me one unit earlier with `vectorGapId(tenantId, sessionId)` — and I
 * did not carry the lesson across a file. It is worse here: ISS-121's throw stranded one session,
 * while this sits inside a catch that swallows it, so tenant B would lose ALL entity promotion
 * silently and permanently.
 */
test("C6: two tenants promoting the SAME slug write to different _ids", async () => {
  const a = fakeDb();
  const b = fakeDb();
  await promoteAndPersistEntities("tenant-a", "s1", treeRoot(), a.db);
  await promoteAndPersistEntities("tenant-b", "s1", treeRoot(), b.db);
  const idA = (writes(a.calls, "topics")[0]!.filter as Record<string, unknown>)._id;
  const idB = (writes(b.calls, "topics")[0]!.filter as Record<string, unknown>)._id;
  assert.notEqual(idA, idB, "a bare slug makes the second tenant's upsert an E11000 and it loses ALL promotion");
  assert.equal(idA, "tenant-a:visa-rules");
  assert.equal(idB, "tenant-b:visa-rules");
});

test("C6: org ids are namespaced too — the same collision applies to orgs", async () => {
  const a = fakeDb();
  const b = fakeDb();
  await promoteAndPersistEntities("tenant-a", "s1", treeRoot(), a.db);
  await promoteAndPersistEntities("tenant-b", "s1", treeRoot(), b.db);
  assert.notEqual(
    (writes(a.calls, "orgs")[0]!.filter as Record<string, unknown>)._id,
    (writes(b.calls, "orgs")[0]!.filter as Record<string, unknown>)._id,
  );
});

test("C6: a topicRef resolves to a real topics._id — namespaced through the SAME helper", async () => {
  // If the rows are namespaced and the refs are not, every claim points at an id that does not
  // exist. The two must derive from one function, not two conventions that happen to agree.
  const { db, calls } = fakeDb({ claims: [{ _id: "c1", tenantId: "x", evidence: [{ turnId: "t1", sessionId: "s1" }] }] });
  await promoteAndPersistEntities("x", "s1", treeRoot(), db);
  const writtenTopicId = (writes(calls, "topics")[0]!.filter as Record<string, unknown>)._id;
  const claimSet = (calls.find((c) => c.coll === "claims" && c.op === "updateOne")!
    .update as Record<string, Record<string, unknown>>).$set!;
  assert.deepEqual(claimSet.topicRefs, [writtenTopicId], "the ref must equal the id actually written");
  assert.equal(writtenTopicId, entityId("x", "visa-rules"));
});

/* ── ISS-154 / contract C3: entity writes must be REACHED and tenant-scoped ON THE FILTER ──────
 * The contract's mandatory mutation — `scopedCollection(...)` replaced by a bare
 * `db.collection(...)` handle — SURVIVED on both `topics` and `orgs` at 159/0 green. Not because
 * the code was wrong, but because nothing reached it: `fakeDb`'s session had no `org` and its
 * `session_pages` read returned nothing, so `buildTree` produced no entity nodes, so the blanket
 * tenant-confinement test in session.test.ts had NOTHING TO CONFINE for entities. A fixture that
 * cannot reach a path silently exempts that path from every test that walks the recorded calls.
 *
 * Two assertions, because they fail for different reasons: the first pins that the path is
 * REACHED at all through the real `indexSession`, the second pins that the write is tenant-scoped
 * on the FILTER — the direct tests only ever asserted the update BODY's tenantId.
 */
test("ISS-154: a full indexSession run REACHES the entity writes (the fixture must not exempt them)", async () => {
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith() as never, db });
  const entityWrites = calls.filter((c) => ["topics", "orgs"].includes(c.coll) && c.op === "updateOne");
  assert.ok(entityWrites.some((c) => c.coll === "topics"), "the tree must yield a topic node, or nothing tests the topic write");
  assert.ok(entityWrites.some((c) => c.coll === "orgs"), "the session must carry an org, or nothing tests the org write");
});

test("ISS-154: every entity write is tenant-scoped ON THE FILTER, not merely in the body", async () => {
  // `scopedCollection` merges tenantId into the filter; a bare `db.collection()` handle would not,
  // and the body-only assertions could not tell the difference.
  const { db, calls } = fakeDb();
  await indexSession("t", "s1", { complete: completeWith() as never, db });
  const entityWrites = calls.filter((c) => ["topics", "orgs"].includes(c.coll) && c.op === "updateOne");
  assert.ok(entityWrites.length >= 2, "both entity collections must be written");
  for (const w of entityWrites) {
    assert.equal(w.filter?.tenantId, "t",
      `${w.coll}.updateOne filter lost its tenantId — a bare db.collection() handle would look exactly like this`);
  }
});

// ISS-155. Recorded reproduction: `backfill.mjs entities --dry-run` printed the BARE slug (`uk`) while
// the live path writes entityId(tenantId, slug) = `<tenant>:uk`. The preview must print the written id.
test("ISS-155: the dry-run preview prints the NAMESPACED id the live path writes, not the bare slug", async () => {
  const line = topicPreviewLine("toc", { _id: "uk", sessionRefs: ["s1", "s2"] });
  assert.equal(line, "topic toc:uk <- 2 session(s)");
  assert.ok(!/^topic uk /.test(line), "the bare slug must not be previewed");
  // The previewed id and the live write's _id agree for the same inputs.
  const live = fakeDb();
  await promoteAndPersistEntities("toc", "s1", treeRoot(), live.db, { tagClaims: false });
  const writtenId = (writes(live.calls, "topics")[0]!.filter as Record<string, unknown>)._id;
  assert.equal(writtenId, "toc:visa-rules");
  assert.equal(topicPreviewLine("toc", { _id: "visa-rules", sessionRefs: ["s1"] }).split(" ")[1], writtenId);
});
