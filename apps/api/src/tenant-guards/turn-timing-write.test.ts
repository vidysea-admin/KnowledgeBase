/**
 * Lane badturns: write-time turn timing validation in the API turn writer (ingest-store). Fakes only (BlindDb, no network).
 * /ask refuses the WHOLE request on one invalid turn row, so such a row must be refused before ANY write, never repaired.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BlindDb, bindDb } from "../ask/tenant-test-kit.js";
import { createMongoIngestDeps } from "../ingest-store.js";
import { assertTurnTimings, turnTimingProblem } from "../turn-timing.js";

const T = "tA";
const fresh = () => { const db = new BlindDb({ sources: [], sessions: [], turns: [] }); bindDb(db); return db; };
const fakeUrlSource = (turns: unknown[]) => ({
  fetch: async () => ({ source: { _id: "src-1", tenantId: T, kind: "url", hash: "h1", path: "https://example.com/p", title: "p" }, media: [] }),
  toTurns: async () => turns,
}) as never;
const good = { speakerRef: "a", tStart: 0, tEnd: 5, text: "ok" };

test("assertTurnTimings: valid turns pass through untouched", () => {
  const turns = [{ _id: "x", tStart: 0, tEnd: 0 }, { _id: "y", tStart: 3, tEnd: 9 }];
  assert.equal(assertTurnTimings(turns, "s"), turns);
  assert.deepEqual(turns, [{ _id: "x", tStart: 0, tEnd: 0 }, { _id: "y", tStart: 3, tEnd: 9 }]);
});
for (const [name, t, re] of [
  ["tEnd before tStart", { tStart: 2008, tEnd: 213 }, /tEnd 213 is before tStart 2008/],
  ["negative tStart", { tStart: -1, tEnd: 4 }, /tStart -1 is negative/],
  ["NaN tEnd", { tStart: 1, tEnd: NaN }, /tEnd is not a finite number/],
  ["string tStart", { tStart: "1", tEnd: 2 }, /tStart is not a finite number/],
  ["missing tEnd", { tStart: 1 }, /tEnd is not a finite number/],
] as const) {
  test(`turnTimingProblem flags ${name}`, () => assert.match(turnTimingProblem(t) ?? "", re));
}
test("assertTurnTimings reports EVERY bad turn, naming session and turn, and does not mutate", () => {
  const turns = [{ _id: "s9-t141", sessionId: "s9", tStart: 2008, tEnd: 213 }, { _id: "s9-t142", sessionId: "s9", tStart: 1, tEnd: 2 }, { _id: "s9-t143", sessionId: "s9", tStart: 5, tEnd: 4 }];
  assert.throws(() => assertTurnTimings(turns, "s9"), (e: Error) => /session s9 turn s9-t141: tEnd 213 is before tStart 2008/.test(e.message)
    && /session s9 turn s9-t143/.test(e.message) && !/s9-t142/.test(e.message) && /2 turn\(s\)/.test(e.message));
  assert.deepEqual(turns.map((t) => [t.tStart, t.tEnd]), [[2008, 213], [1, 2], [5, 4]]);
});

test("ingestUrl refuses a tEnd<tStart turn BEFORE any write; error names the session and turn", async () => {
  const db = fresh();
  const deps = createMongoIngestDeps(undefined, { urlSource: fakeUrlSource([good, { ...good, tStart: 50, tEnd: 10 }]) });
  await assert.rejects(() => deps.ingestUrl(T, "https://example.com/p"),
    (e: Error) => /invalid turn timing, write refused/.test(e.message) && /session [0-9a-f-]{36} turn [0-9a-f-]{36}-t002: tEnd 10 is before tStart 50/.test(e.message));
  assert.deepEqual([db.all("sources"), db.all("sessions"), db.all("turns")], [[], [], []], "nothing written, nothing repaired");
});
test("ingestUrl positive control: valid turns are written with their original timing", async () => {
  const db = fresh();
  const res = await createMongoIngestDeps(undefined, { urlSource: fakeUrlSource([good, { ...good, tStart: 5, tEnd: 9 }]) }).ingestUrl(T, "https://example.com/p");
  assert.equal(res.turnCount, 2);
  assert.deepEqual(db.all("turns").map((r) => [r.tStart, r.tEnd]), [[0, 5], [5, 9]]);
  assert.equal(db.all("sources").length, 1);
});
test("ISS-BADTURNS-003: the API writer check also refuses NaN/Infinity tStart and tEnd", () => {
  for (const [s, e, re] of [[NaN, 5, /tStart is not a finite number/], [Infinity, 9, /tStart is not a finite number/], [0, NaN, /tEnd is not a finite number/], [0, Infinity, /tEnd is not a finite number/]] as const) {
    assert.match(turnTimingProblem({ tStart: s, tEnd: e }) ?? "", re);
  }
});
