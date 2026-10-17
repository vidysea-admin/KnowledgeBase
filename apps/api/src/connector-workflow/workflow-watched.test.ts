/** Watched-snapshot connector workflow tests, split from workflow.test.ts (pure relocation). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectorFixture } from "./fixtures.js";
import { createConnectorWatchVerifier } from "./watched.js";
import { createConnectorMongoStore } from "./mongo-store.js";
import { buildConnectorWorkflowDeps } from "./wiring.js";
import { createHash } from "node:crypto";
import { assertConnectorIndexConsumed } from "./types.js";

test("watched snapshot preserves provenance, indexes changes, and skips unchanged consumption", async () => {
  const f = connectorFixture(); f.watch(); f.watch("watch-b", "tenant-b");
  const first = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(first.status, 200); assert.equal(first.body.outcomes[0].status, "changed");
  const source = f.rows("sources")[0]!;
  assert.equal(source.sourceMeta.watchedSourceId, "watch-a");
  assert.equal(source.sourceMeta.fetchedAt, "2026-10-14T00:00:00.000Z");
  assert.equal(source.sourceMeta.diffFrom, null);
  assert.equal(source.sourceMeta.connectorIndex.complete, true);
  assert.equal(f.rows("sessions")[0]!.status.index, "done");
  assert.ok(f.rows("claims")[0]!.evidence[0].turnId);
  const firstHash = f.rows("watched_sources")[0]!.lastFetch.hash;
  assert.equal(f.rows("watched_sources")[1]!.lastFetch, undefined);
  f.setClock("2026-10-14T01:00:00.000Z");
  const same = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(same.body.outcomes[0].status, "unchanged"); assert.equal(f.counters().indexes, 1);
  f.setText("Visa policy changed. Check the official source."); f.setClock("2026-10-14T02:00:00.000Z");
  const changed = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(changed.body.outcomes[0].status, "changed"); assert.equal(f.counters().indexes, 2);
  assert.equal(f.rows("watched_sources")[0]!.lastFetch.diffFrom, firstHash);
  assert.equal(f.rows("sources")[1]!.sourceMeta.diffFrom, firstHash);
  assert.equal(f.rows("sessions").length, 2);
});

test("index failure leaves watched hash due; retry consumes deduped stored content before success", async () => {
  const f = connectorFixture(); f.watch(); f.failIndex(true);
  const failed = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(failed.body.outcomes[0].status, "failed"); assert.ok(failed.body.outcomes[0].gapId);
  assert.equal(f.rows("gaps")[0]!.watchedSourceRef, "watch-a");
  assert.equal(f.rows("watched_sources")[0]!.lastFetch, undefined);
  assert.equal(f.rows("sessions").length, 1); assert.equal(f.rows("claims").length, 0);
  assert.ok(!JSON.stringify(failed.body).includes("secret-token"));
  f.failIndex(false);
  const retry = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(retry.body.outcomes[0].status, "changed"); assert.equal(f.rows("sessions").length, 1);
  assert.equal(f.rows("sessions")[0]!.status.index, "done"); assert.ok(f.rows("claims").length);
  assert.equal(f.rows("gaps")[0]!.status, "received");
});

test("positive consumer receipt is required; legacy and contradictory chunk receipts are refused", () => {
  const positive = {
    sessionId: "s", summary: { degraded: null }, claims: { degraded: null }, chunks: { written: 1, skipped: null }, entities: null,
    completion: { version: 2, strict: false, complete: true, generation: "g", turnCount: 1, treeWritten: true },
  } as const;
  assertConnectorIndexConsumed(positive, "s");
  const { completion, ...legacy } = positive;
  assert.throws(() => assertConnectorIndexConsumed(legacy, "s"), /indexing_incomplete/);
  assert.throws(() => assertConnectorIndexConsumed({ ...positive, chunks: { written: 0, skipped: "embedding-failed" } }, "s"), /indexing_incomplete/);
  assert.throws(() => assertConnectorIndexConsumed({ ...positive, completion: { ...completion, treeWritten: false } }, "s"), /indexing_incomplete/);
});

test("nonthrowing partial watched consumer writes cannot create hash or cached consumption success", async () => {
  const f = connectorFixture(); f.watch();
  const realIndex = f.deps.watched!.indexSession;
  f.deps.watched!.indexSession = async (tenantId, sessionId) => {
    const result = await realIndex(tenantId, sessionId);
    return { ...result, completion: { ...result.completion!, complete: false } };
  };
  const failed = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(failed.body.outcomes[0].status, "failed"); assert.ok(f.rows("chunks").length);
  assert.equal(f.rows("watched_sources")[0]!.lastFetch, undefined);
  assert.equal(f.rows("sources")[0]!.sourceMeta.connectorIndex, undefined);
  assert.equal(await f.deps.store.hasConsumedSource("tenant-a", f.rows("sources")[0]!._id), false);
  f.deps.watched!.indexSession = realIndex;
  const retry = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(retry.body.outcomes[0].status, "changed"); assert.equal(f.rows("sessions").length, 1);
  assert.equal(f.rows("sources")[0]!.sourceMeta.connectorIndex.complete, true);
});

test("nonthrowing legacy public consumer result cannot skip the required retry", async () => {
  const f = connectorFixture();
  const realIndex = f.deps.indexSession!;
  f.deps.indexSession = async (tenantId, sessionId) => {
    const { completion: _completion, ...legacy } = await realIndex(tenantId, sessionId);
    return legacy;
  };
  const failed = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa" });
  assert.equal(failed.status, 502); assert.ok(f.rows("chunks").length);
  assert.equal(await f.deps.store.hasConsumedSource("tenant-a", f.rows("sources")[0]!._id), false);
  f.deps.indexSession = realIndex;
  const retry = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa" });
  assert.equal(retry.status, 200); assert.equal(f.counters().indexes, 2);
  assert.equal(f.rows("sources")[0]!.sourceMeta.connectorIndex.sessionId, retry.body.sessionId);
});

test("legacy hash-only watched check is not mistaken for a consumed source", async () => {
  const f = connectorFixture(); f.watch();
  const text = "A legacy unchanged page still needs its first pipeline consumption.";
  f.setText(text);
  const hash = createHash("sha256").update(text).digest("hex");
  f.rows("watched_sources")[0]!.lastFetch = { fetchedAt: "2026-10-13T00:00:00.000Z", hash, diffFrom: null };
  const result = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(result.body.outcomes[0].status, "unchanged");
  assert.ok(result.body.outcomes[0].sessionId);
  assert.equal(f.counters().indexes, 1); assert.ok(f.rows("claims").length);
  assert.equal(f.rows("watched_sources")[0]!.lastFetch.sourceRef, f.rows("sources")[0]!._id);
});

test("guarded HTML snapshot supplies visible paragraphs and each watched URL keeps receipt provenance", async () => {
  const f = connectorFixture(); f.watch("first"); f.watch("second");
  f.rows("watched_sources")[1]!.url = "https://public.example/second";
  f.setText('<!doctype html><html><head><title>Page</title><script>secretScript()</script></head><body><p>Visa &amp; study guidance.</p><p>Check current conditions.</p></body></html>');
  const result = await f.call("POST", "/connector-workflow/watched/verify");
  assert.deepEqual(result.body.outcomes.map((o: any) => o.status), ["changed", "changed"]);
  assert.equal(f.rows("sources").length, 1);
  assert.equal(f.counters().indexes, 1);
  assert.deepEqual(f.rows("turns").map((t) => t.text), ["Visa & study guidance.", "Check current conditions."]);
  for (const watch of f.rows("watched_sources")) {
    assert.equal(watch.lastFetch.sessionId, f.rows("sessions")[0]!._id);
    assert.equal(watch.lastFetch.sourceRef, f.rows("sources")[0]!._id);
  }
});

test("CAS/no persistence, gap-write failure, resource cap and corrupt tenant never fabricate success", async () => {
  const f = connectorFixture(); f.watch();
  f.deps.store.recordFetch = async () => false;
  const result = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(result.body.outcomes[0].status, "failed"); assert.equal(f.rows("watched_sources")[0]!.lastFetch, undefined);
  f.failTransport(true); f.deps.store.createGap = async () => { throw new Error("unavailable"); };
  const gapFail = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(gapFail.body.outcomes[0].code, "watched_failure_gap_write_failed");
  const capped = connectorFixture(); for (let i = 0; i < 27; i++) capped.watch(`w-${i}`);
  const capResult = await capped.call("POST", "/connector-workflow/watched/verify");
  assert.equal(capResult.body.remaining, 2); assert.equal(capped.counters().fetches, 25);
  const corrupt = connectorFixture(); corrupt.watch("other", "tenant-b");
  corrupt.deps.store.listWatched = async () => corrupt.rows("watched_sources") as never;
  assert.equal((await corrupt.call("POST", "/connector-workflow/watched/verify")).status, 503);
  assert.equal(corrupt.counters().fetches, 0);
});

test("disabled wiring, protected DBs and unguarded fetcher fail closed", async () => {
  const f = connectorFixture();
  assert.equal(buildConnectorWorkflowDeps({}, f.deps.indexSession!), undefined);
  for (const name of [undefined, "lkb", "LKB", "global_university_db", "lkb_staging"]) {
    await assert.rejects(createConnectorMongoStore({ MONGODB_DB: name }, f.db).listGaps("tenant-a"), /connector_database_unconfigured/);
  }
  f.deps.watched!.fetcher = (async () => "text") as never;
  await assert.rejects(createConnectorWatchVerifier(f.deps)("tenant-a"), /watched_unconfigured/);
});

test("protected database refusal precedes external intake, downstream writes and watched fetch", async () => {
  const f = connectorFixture(); f.watch();
  f.deps.store = createConnectorMongoStore({ MONGODB_DB: "lkb" }, f.db);
  assert.equal((await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa" })).status, 503);
  assert.equal((await f.call("POST", "/connector-workflow/watched/verify")).status, 503);
  assert.equal(f.counters().fetches, 0); assert.equal(f.counters().indexes, 0);
  assert.equal(f.rows("sources").length, 0); assert.equal(f.rows("gaps").length, 0);
});

test("unacknowledged gap insertion is not reported as a durable request creation", async () => {
  const f = connectorFixture(); f.acknowledgeWrites(false);
  const input = { description: "Missing recording", requestedFrom: "owner", requestId: "stable-request" };
  const result = await f.call("POST", "/connector-workflow/recording-requests", input);
  assert.equal(result.status, 503); assert.equal(result.body.error, "gap_write_unconfirmed");
  f.acknowledgeWrites(true);
  const retry = await f.call("POST", "/connector-workflow/recording-requests", input);
  assert.equal(retry.status, 200); assert.equal(retry.body.repeated, true); assert.equal(f.rows("gaps").length, 1);
  const conflict = await f.call("POST", "/connector-workflow/recording-requests", { ...input, requestedFrom: "different-owner" });
  assert.equal(conflict.status, 409);
  const otherTenant = await f.call("POST", "/connector-workflow/recording-requests", input, "b");
  assert.equal(otherTenant.status, 201); assert.notEqual(otherTenant.body.gap._id, retry.body.gap._id);
});
