/**
 * T-054 persistence + routes over the REAL scoped store and REAL requireAuth, on an in-memory Db (no Mongo, no network
 * beyond loopback). Pins: auth/scope, tenant isolation (cross-tenant read/write/history/refresh), If-Match/ETag
 * preconditions, the revision receipt shape the web client requires, original turns never written, append-only history,
 * atomic compare-and-set under a race, history healing, and honest refresh state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, SESSION, turn } from "./persist.testkit.js";

const REASON = "Fix transcription error";
const fix = (id: string, text: string) => ({ reason: REASON, corrections: [{ turnId: id, text }] });
const A0 = `tenant-A-${SESSION}-t0`;
const B0 = `tenant-B-${SESSION}-t0`;

test("auth: no key 401, wrong scope 403, nothing written", async () => {
  const h = await boot();
  try {
    const { body } = await h.get("key-a");
    for (const key of [null, "key-noscope"] as const) {
      const want = key === null ? 401 : 403;
      assert.equal((await h.call("GET", `/sessions/${SESSION}/transcript-review`, key)).status, want);
      assert.equal((await h.post(key, body.revision, fix(A0, "x"))).status, want);
      assert.equal((await h.call("GET", `/sessions/${SESSION}/transcript-review/history`, key)).status, want);
      assert.equal((await h.call("POST", `/sessions/${SESSION}/transcript-review/refresh`, key, {})).status, want);
    }
    assert.deepEqual(h.m.writes, []);
  } finally { await h.close(); }
});

test("GET serves the effective transcript with a strong ETag = revision, no-store, no tenant field", async () => {
  const h = await boot();
  try {
    const { res, body } = await h.get("key-a");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("etag"), `"${body.revision}"`);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.match(body.revision, /^base-[0-9a-f]{48}$/);
    assert.equal(body.refresh, "complete");
    assert.deepEqual(body.turns.map((t) => t._id), [0, 1, 2, 3].map((i) => `tenant-A-${SESSION}-t${i}`));
    assert.equal(JSON.stringify(body).includes("tenant-A\""), false, "tenantId must not be served");
    assert.equal(JSON.stringify(body).includes("Bravo"), false);
    assert.equal(h.m.writes.length, 0, "a GET writes nothing");
  } finally { await h.close(); }
});

test("POST commits durably: receipt shape, new ETag, original turns untouched, overlay served, history row with before/after", async () => {
  const h = await boot();
  try {
    const turnsBefore = structuredClone(h.m.rows("turns"));
    const { body: loaded } = await h.get("key-a");
    const res = await h.post("key-a", loaded.revision, {
      reason: REASON, corrections: [{ turnId: A0, text: "Alpha corrected 0" }],
      mapping: { turnIds: [`tenant-A-${SESSION}-t2`, `tenant-A-${SESSION}-t3`], speakerRef: "person:rashi", speakerLabel: "Rashi Sharma" },
    });
    assert.equal(res.status, 200);
    const receipt = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(receipt).sort(), ["commit", "refresh", "revision", "sessionId"]);
    assert.equal(receipt.commit, "committed");
    assert.equal(receipt.refresh, "pending", "a commit is not a completed refresh");
    assert.notEqual(receipt.revision, loaded.revision);
    assert.equal(res.headers.get("etag"), `"${receipt.revision as string}"`);

    assert.deepEqual(h.m.rows("turns"), turnsBefore, "original turns are immutable");
    assert.equal(h.m.writes.some((w) => w.collection === "turns"), false);

    const { body: after } = await h.get("key-a");
    assert.equal(after.revision, receipt.revision);
    assert.equal(after.refresh, "pending");
    assert.equal(after.turns[0]!.text, "Alpha corrected 0");
    assert.equal(after.turns[2]!.speakerRef, "person:rashi");
    assert.equal(after.turns[3]!.speakerLabel, "Rashi Sharma");
    assert.equal(after.turns[1]!.text, "Alpha original 1");

    const hist = (await (await h.call("GET", `/sessions/${SESSION}/transcript-review/history`, "key-a")).json()) as { revisions: { revision: string; parentRevision: string; actorRef: string; reason: string; changes: { turnId: string; before: { text: string }; after: { text: string } }[] }[] };
    assert.equal(hist.revisions.length, 1);
    const [row] = hist.revisions;
    assert.equal(row!.revision, receipt.revision);
    assert.equal(row!.parentRevision, loaded.revision);
    assert.equal(row!.actorRef, "apikey:tenant-A");
    assert.equal(row!.reason, REASON);
    const c0 = row!.changes.find((c) => c.turnId === A0)!;
    assert.equal(c0.before.text, "Alpha original 0");
    assert.equal(c0.after.text, "Alpha corrected 0");
  } finally { await h.close(); }
});

test("history is append-only across revisions and the chain links parent to child", async () => {
  const h = await boot();
  try {
    const r0 = (await h.get("key-a")).body.revision;
    const r1 = ((await (await h.post("key-a", r0, fix(A0, "v1"))).json()) as { revision: string }).revision;
    const r2 = ((await (await h.post("key-a", r1, fix(A0, "v2"))).json()) as { revision: string }).revision;
    const hist = (await (await h.call("GET", `/sessions/${SESSION}/transcript-review/history`, "key-a")).json()) as { revisions: { revision: string; parentRevision: string; changes: { before: { text: string }; after: { text: string } }[] }[] };
    assert.deepEqual(hist.revisions.map((r) => [r.parentRevision, r.revision]), [[r0, r1], [r1, r2]]);
    assert.deepEqual(hist.revisions[1]!.changes[0]!.before.text, "v1", "the earlier correction is preserved in history, not overwritten");
    assert.equal(h.m.rows("transcript_review_revisions").length, 2);
    assert.equal(h.m.rows("transcript_reviews").length, 1, "one head row per session");
  } finally { await h.close(); }
});

test("preconditions: missing If-Match 428; malformed or body-mismatched 400; stale 412; nothing written on any", async () => {
  const h = await boot();
  try {
    const r0 = (await h.get("key-a")).body.revision;
    const path = `/sessions/${SESSION}/transcript-review`;
    const body = { expectedRevision: r0, ...fix(A0, "x") };
    assert.equal((await h.call("POST", path, "key-a", body)).status, 428);
    for (const bad of [r0, `W/"${r0}"`, `"${r0}", "other"`, "*", `"${r0}`]) {
      assert.equal((await h.call("POST", path, "key-a", body, { "if-match": bad })).status, 400, `If-Match ${bad}`);
    }
    assert.equal((await h.post("key-a", r0, fix(A0, "x"), SESSION, '"some-other-revision"')).status, 400, "header differs from body.expectedRevision");
    assert.deepEqual(h.m.writes, []);

    const ok = await h.post("key-a", r0, fix(A0, "first"));
    assert.equal(ok.status, 200);
    const writes = h.m.writes.length;
    const stale = await h.post("key-a", r0, fix(A0, "second"));
    assert.equal(stale.status, 412);
    const sb = (await stale.json()) as { error: string; currentRevision: string };
    assert.equal(sb.error, "precondition_failed");
    assert.equal(stale.headers.get("etag"), `"${sb.currentRevision}"`);
    assert.equal(h.m.writes.length, writes, "a stale save writes nothing");
    assert.equal((await h.get("key-a")).body.turns[0]!.text, "first");
  } finally { await h.close(); }
});

test("tenant isolation: cross-tenant read, write, history and refresh all answer 404; the owner's data is unchanged", async () => {
  const h = await boot({ refresh: async () => {} });
  try {
    const a = (await h.get("key-a", "only-a")).body;
    for (const [method, suffix, body] of [["GET", "", undefined], ["GET", "/history", undefined], ["POST", "/refresh", {}]] as const) {
      const res = await h.call(method, `/sessions/only-a/transcript-review${suffix}`, "key-b", body);
      assert.equal(res.status, 404, `${method} ${suffix}`);
      assert.equal((await res.text()).includes("Only A secret"), false);
    }
    const before = JSON.stringify(h.m.rows("transcript_reviews"));
    const res = await h.post("key-b", a.revision, fix(`tenant-A-only-a-t0`, "hijack"), "only-a");
    assert.equal(res.status, 404);
    assert.equal(JSON.stringify(h.m.rows("transcript_reviews")), before);
    assert.equal(h.m.writes.length, 0);
    assert.equal((await h.get("key-a", "only-a")).body.turns[0]!.text, "Only A secret");
  } finally { await h.close(); }
});

test("same session id in two tenants stays separate; a tenant cannot name A's turn ids or smuggle a tenant/actor/time", async () => {
  const h = await boot();
  try {
    const a0 = (await h.get("key-a")).body.revision;
    const b0 = (await h.get("key-b")).body.revision;
    assert.notEqual(a0, b0);
    assert.equal((await h.post("key-b", b0, fix(A0, "cross"))).status, 422, "A's turn id does not exist in B's session");
    assert.equal((await h.post("key-b", a0, fix(B0, "wrong revision"))).status, 412, "A's revision is not B's");
    for (const extra of [{ tenantId: "tenant-A" }, { actorRef: "root" }, { reviewedAt: "2000-01-01T00:00:00Z" }, { refresh: "complete" }]) {
      assert.equal((await h.post("key-b", b0, { ...fix(B0, "x"), ...extra })).status, 400, JSON.stringify(extra));
    }
    assert.deepEqual(h.m.writes, []);
    assert.equal((await h.post("key-b", b0, fix(B0, "Bravo corrected"))).status, 200);
    assert.equal((await h.get("key-a")).body.revision, a0, "B's commit does not move A's revision");
    assert.equal((await h.get("key-a")).body.turns[0]!.text, "Alpha original 0");
    const heads = h.m.rows("transcript_reviews");
    assert.equal(heads.length, 1);
    assert.equal(heads[0]!.tenantId, "tenant-B");
  } finally { await h.close(); }
});

test("invalid requests: bad body 400, unknown turn / no-op 422, bad session id 400; nothing written", async () => {
  const h = await boot();
  try {
    const r0 = (await h.get("key-a")).body.revision;
    assert.equal((await h.post("key-a", r0, { reason: "", corrections: [] })).status, 400);
    assert.equal((await h.post("key-a", r0, { reason: REASON, corrections: "no" })).status, 400);
    assert.equal((await h.post("key-a", r0, fix("nope", "x"))).status, 422);
    assert.equal((await h.post("key-a", r0, fix(A0, "Alpha original 0"))).status, 422, "no-op review");
    assert.equal((await h.call("GET", "/sessions/bad%20id/transcript-review", "key-a")).status, 400);
    assert.equal((await h.call("GET", "/sessions/missing/transcript-review", "key-a")).status, 404);
    assert.deepEqual(h.m.writes, []);
  } finally { await h.close(); }
});

test("atomic: two saves racing on one ETag - exactly one commits, the loser is 409/412, one head, no lost update", async () => {
  {
    for (let round = 0; round < 20; round++) {
      const hh = await boot();
      try {
        // Odd rounds race the FIRST commit (insertHead duplicate key); even rounds race a later one (replaceHead compare-and-set).
        let base = (await hh.get("key-a")).body.revision;
        if (round % 2 === 0) base = ((await (await hh.post("key-a", base, fix(A0, "seed"))).json()) as { revision: string }).revision;
        const results = await Promise.all([hh.post("key-a", base, fix(A0, "writer one")), hh.post("key-a", base, fix(A0, "writer two"))]);
        const statuses = results.map((r) => r.status).sort();
        assert.equal(statuses[0], 200, `round ${round}`);
        assert.ok(statuses[1] === 409 || statuses[1] === 412, `round ${round}: ${statuses.join(",")}`);
        assert.equal(hh.m.rows("transcript_reviews").length, 1);
        assert.equal(hh.m.rows("transcript_review_revisions").length, round % 2 === 0 ? 2 : 1);
        const text = (await hh.get("key-a")).body.turns[0]!.text;
        assert.ok(text === "writer one" || text === "writer two");
      } finally { await hh.close(); }
    }
  }
});

test("a failed history write does not turn a durable commit into an error, and the next commit heals the gap", async () => {
  const h = await boot();
  try {
    const r0 = (await h.get("key-a")).body.revision;
    h.m.failNext("transcript_review_revisions", "updateOne");
    const first = await h.post("key-a", r0, fix(A0, "v1"));
    assert.equal(first.status, 200, "commit truth is preserved");
    const r1 = ((await first.json()) as { revision: string }).revision;
    assert.equal(h.m.rows("transcript_review_revisions").length, 0, "history row missing right after the injected failure");
    assert.equal((await h.get("key-a")).body.revision, r1);
    assert.equal((await h.post("key-a", r1, fix(A0, "v2"))).status, 200);
    assert.equal(h.m.rows("transcript_review_revisions").length, 2, "revision 1 was recovered from the head's audit entry");
  } finally { await h.close(); }
});

test("a store failure answers 503 with no internal message and no partial write", async () => {
  const h = await boot();
  try {
    const r0 = (await h.get("key-a")).body.revision;
    h.m.failNext("transcript_reviews", "insertOne");
    const res = await h.post("key-a", r0, fix(A0, "x"));
    assert.equal(res.status, 503);
    assert.equal((await res.text()).includes("injected"), false);
    assert.equal(h.m.rows("transcript_reviews").length, 0);
    assert.equal((await h.get("key-a")).body.revision, r0);
  } finally { await h.close(); }
});

test("sample sanity: helper turn() carries extra fields that survive, uncorrected, through an overlay", async () => {
  const h = await boot();
  try {
    const r0 = (await h.get("key-a")).body.revision;
    await h.post("key-a", r0, fix(A0, "v1"));
    const orig = h.m.rows("turns").find((t) => t._id === A0)!;
    assert.deepEqual(orig, turn("tenant-A", SESSION, 0, "Alpha original 0"));
  } finally { await h.close(); }
});
