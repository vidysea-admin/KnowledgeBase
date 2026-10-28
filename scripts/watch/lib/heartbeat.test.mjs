/**
 * scripts/watch/lib/heartbeat.test.mjs — U4b/R2. The FIRST committed test for the five pure
 * heartbeat functions (ISS-360, the row at qa/issues.jsonl line 359; see that manifest section on
 * the duplicate ISS-360 id). Real functions, no mocking: they are pure, so every case here is the
 * function's actual arithmetic.
 *
 * D-015: the ledger's own recorded reproductions are the FLOOR of this suite, not a starting point.
 * ISS-360's `reproductions[0]` names six cases; each is a test below tagged `[ISS-360 repro]`, and
 * the three extra adversarial cases its `evidence` field records (negative intervalMs, intervalMs=0,
 * unparsable date) are tagged `[ISS-360 evidence]`. Cases beyond those are additions, not
 * substitutions — no case the ledger recorded was replaced by an easier one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  watchHeartbeatIntervalMs,
  isHeartbeatStale,
  findStaleHeartbeats,
  watchHeartbeatId,
  buildHeartbeatDoc,
} from "./heartbeat.mjs";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

// --- watchHeartbeatIntervalMs -------------------------------------------------------------

test("watchHeartbeatIntervalMs defaults to 1 hour — D-048's settled value, not U4b's 2h [ASSUMPTION]", () => {
  assert.equal(watchHeartbeatIntervalMs({}), HOUR);
  assert.equal(watchHeartbeatIntervalMs({}), 3_600_000);
  // The retired placeholder must NOT be what this returns. Named explicitly so a silent revert to
  // the assumption is a red test, not a number nobody re-checks.
  assert.notEqual(watchHeartbeatIntervalMs({}), 2 * HOUR);
});

test("watchHeartbeatIntervalMs reads WATCH_HEARTBEAT_INTERVAL_MS when it is a positive number", () => {
  assert.equal(watchHeartbeatIntervalMs({ WATCH_HEARTBEAT_INTERVAL_MS: "900000" }), 900_000);
  assert.equal(watchHeartbeatIntervalMs({ WATCH_HEARTBEAT_INTERVAL_MS: "1" }), 1);
});

test("watchHeartbeatIntervalMs falls back on junk rather than adopting it as the threshold", () => {
  // [ISS-360 evidence] negative and zero intervals. Neither is allowed to become the live
  // threshold: 0 makes EVERY heartbeat stale (alert storm) and a negative is meaningless.
  assert.equal(watchHeartbeatIntervalMs({ WATCH_HEARTBEAT_INTERVAL_MS: "0" }), HOUR);
  assert.equal(watchHeartbeatIntervalMs({ WATCH_HEARTBEAT_INTERVAL_MS: "-1" }), HOUR);
  assert.equal(watchHeartbeatIntervalMs({ WATCH_HEARTBEAT_INTERVAL_MS: "not-a-number" }), HOUR);
  assert.equal(watchHeartbeatIntervalMs({ WATCH_HEARTBEAT_INTERVAL_MS: "" }), HOUR);
  assert.equal(watchHeartbeatIntervalMs({ WATCH_HEARTBEAT_INTERVAL_MS: "Infinity" }), HOUR);
});

// --- isHeartbeatStale ---------------------------------------------------------------------

test("[ISS-360 repro] null / undefined / malformed lastHeartbeatAt all resolve to stale=true", () => {
  assert.equal(isHeartbeatStale(null, NOW, HOUR), true);
  assert.equal(isHeartbeatStale(undefined, NOW, HOUR), true);
  assert.equal(isHeartbeatStale("not-a-date", NOW, HOUR), true);
  // [ISS-360 evidence] the unparsable-date case, stated as its own assertion.
  assert.equal(isHeartbeatStale("2026-13-45T99:99:99Z", NOW, HOUR), true);
  // A source that has never proven it is alive gets NO benefit of the doubt: "" is falsy and must
  // not be read as a fresh heartbeat.
  assert.equal(isHeartbeatStale("", NOW, HOUR), true);
});

test("[ISS-360 repro] the exact boundary (now - last === intervalMs) is FRESH, not stale", () => {
  const exactly = new Date(NOW.getTime() - HOUR).toISOString();
  assert.equal(isHeartbeatStale(exactly, NOW, HOUR), false);
});

test("[ISS-360 repro] one millisecond past the interval IS stale", () => {
  const onePast = new Date(NOW.getTime() - HOUR - 1).toISOString();
  assert.equal(isHeartbeatStale(onePast, NOW, HOUR), true);
  // ...and one millisecond inside it is not — the boundary is a single ms wide, from both sides.
  const oneInside = new Date(NOW.getTime() - HOUR + 1).toISOString();
  assert.equal(isHeartbeatStale(oneInside, NOW, HOUR), false);
});

test("a future heartbeat (clock skew) is fresh, never stale", () => {
  const future = new Date(NOW.getTime() + 10 * HOUR).toISOString();
  assert.equal(isHeartbeatStale(future, NOW, HOUR), false);
});

test("a heartbeat far older than the interval is stale at the real 1h default", () => {
  const yesterday = new Date(NOW.getTime() - 25 * HOUR).toISOString();
  assert.equal(isHeartbeatStale(yesterday, NOW, watchHeartbeatIntervalMs({})), true);
  // Same row, a 48h interval: NOT stale. Proves the threshold is the injected interval and not a
  // hardcoded constant hiding inside the comparison.
  assert.equal(isHeartbeatStale(yesterday, NOW, 48 * HOUR), false);
});

// --- findStaleHeartbeats ------------------------------------------------------------------

test("[ISS-360 repro] over a 3-row fixture, only the fresh row is excluded", () => {
  const rows = [
    { _id: "toc:drive", tenantId: "toc", sourceType: "drive", lastHeartbeatAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() },
    { _id: "toc:gmail", tenantId: "toc", sourceType: "gmail", lastHeartbeatAt: new Date(NOW.getTime() - 5 * HOUR).toISOString() },
    { _id: "toc:calendar", tenantId: "toc", sourceType: "calendar", lastHeartbeatAt: null },
  ];
  const stale = findStaleHeartbeats(rows, NOW, HOUR);
  assert.deepEqual(stale.map((r) => r.sourceType), ["gmail", "calendar"]);
});

test("findStaleHeartbeats alerts on exactly the one stale source, not all of them (spec R2)", () => {
  const fresh = (t) => ({ tenantId: "toc", sourceType: t, lastHeartbeatAt: new Date(NOW.getTime() - 60_000).toISOString() });
  const rows = [fresh("drive"), { tenantId: "toc", sourceType: "gmail", lastHeartbeatAt: new Date(NOW.getTime() - 3 * HOUR).toISOString() }, fresh("calendar")];
  assert.deepEqual(findStaleHeartbeats(rows, NOW, HOUR).map((r) => r.sourceType), ["gmail"]);
});

test("findStaleHeartbeats returns [] for no rows and for all-fresh rows, and never mutates its input", () => {
  assert.deepEqual(findStaleHeartbeats([], NOW, HOUR), []);
  const rows = [{ tenantId: "toc", sourceType: "drive", lastHeartbeatAt: NOW.toISOString() }];
  const snapshot = JSON.stringify(rows);
  assert.deepEqual(findStaleHeartbeats(rows, NOW, HOUR), []);
  assert.equal(JSON.stringify(rows), snapshot);
});

test("findStaleHeartbeats does not conflate tenants — two tenants' rows are judged independently", () => {
  // The function itself is tenant-agnostic; this pins that it returns the row it was GIVEN rather
  // than collapsing by sourceType, which is what a cross-tenant leak through the detector would
  // look like at this layer. The real tenant boundary is scopedCollection() in
  // packages/db/src/collections/watch-heartbeat.ts — this is the pure-side complement, not a
  // substitute for it.
  const rows = [
    { tenantId: "toc", sourceType: "drive", lastHeartbeatAt: NOW.toISOString() },
    { tenantId: "other", sourceType: "drive", lastHeartbeatAt: new Date(NOW.getTime() - 9 * HOUR).toISOString() },
  ];
  const stale = findStaleHeartbeats(rows, NOW, HOUR);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].tenantId, "other");
});

// --- watchHeartbeatId / buildHeartbeatDoc -------------------------------------------------

test("watchHeartbeatId is the TWO-part key, deliberately unlike watch_state's three-part one", () => {
  assert.equal(watchHeartbeatId("toc", "drive"), "toc:drive");
  assert.equal(watchHeartbeatId("toc", "gmail"), "toc:gmail");
  // Two tenants polling the same source type must never collide on one row.
  assert.notEqual(watchHeartbeatId("toc", "drive"), watchHeartbeatId("other", "drive"));
  // Exactly one separator — a third segment would mean an item-level key, which R2 has no use for.
  assert.equal(watchHeartbeatId("toc", "drive").split(":").length, 2);
});

test("buildHeartbeatDoc produces exactly the schema's required row shape", () => {
  const at = "2026-09-28T11:59:00.000Z";
  const doc = buildHeartbeatDoc("toc", "drive", at);
  assert.deepEqual(doc, { _id: "toc:drive", tenantId: "toc", sourceType: "drive", lastHeartbeatAt: at });
  // Every field schema/watch_heartbeat.schema.json marks required is present, and nothing else is.
  assert.deepEqual(Object.keys(doc).sort(), ["_id", "lastHeartbeatAt", "sourceType", "tenantId"]);
  assert.equal(doc._id, watchHeartbeatId("toc", "drive"));
});

test("buildHeartbeatDoc carries the tenantId it was given into both _id and the field", () => {
  const doc = buildHeartbeatDoc("other", "calendar", "2026-09-28T00:00:00.000Z");
  assert.equal(doc.tenantId, "other");
  assert.equal(doc._id, "other:calendar");
  // A doc built for one tenant must never be writable as another's: the id is tenant-prefixed, so
  // an upsert by _id cannot land on a different tenant's row even if the filter were wrong.
  assert.notEqual(doc._id, buildHeartbeatDoc("toc", "calendar", "2026-09-28T00:00:00.000Z")._id);
});

// --- the round trip the writer and detector actually perform ------------------------------

test("a doc built now is fresh now, and stale one interval + 1ms later (writer -> detector round trip)", () => {
  const doc = buildHeartbeatDoc("toc", "drive", NOW.toISOString());
  assert.deepEqual(findStaleHeartbeats([doc], NOW, HOUR), []);
  const later = new Date(NOW.getTime() + HOUR + 1);
  assert.deepEqual(findStaleHeartbeats([doc], later, HOUR).map((r) => r._id), ["toc:drive"]);
});
