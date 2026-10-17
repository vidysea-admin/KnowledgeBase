import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchRecordingTranscription as dispatch } from "./recording-dispatch.mjs";

const chunks = [{ start: 0, end: 2400 }, { start: 2400, end: 3600 }];
const plan = { kind: "single", fallback: { chunks } };
const turn = { speakerRef: "spk:0", tStart: 0, tEnd: 3600, text: "whole" };
function input(overrides = {}) {
  return { plan, durationSeconds: 3600, chunkedBoundaries: chunks, complete: t => t.length > 0 && t[0].tEnd === 3600,
    singleAttempt: async () => [turn], chunkAttempt: async (start, end) => [{ ...turn, tEnd: end - start, text: "fallback" }], ...overrides };
}
test("accepted single makes one attempt and no chunks", async () => {
  let count = 0;
  const result = await dispatch(input({ singleAttempt: async () => { count++; return [turn]; }, chunkAttempt: () => assert.fail("chunked") }));
  assert.equal(count, 1);
  assert.deepEqual(result.results, [{ offsetSeconds: 0, turns: [turn] }]);
  assert.equal(result.provenance.actualPath, "single");
});
test("incomplete or failed single is discarded before offset chunk consumption", async () => {
  for (const singleAttempt of [async () => [], async () => [{ ...turn, tEnd: 600 }], async () => { throw Error("secret-key"); }]) {
    let calls = 0; const logs = [];
    const result = await dispatch(input({ singleAttempt: async () => { calls++; return singleAttempt(); }, log: x => logs.push(x) }));
    assert.equal(calls, 1);
    assert.deepEqual(result.results.map(r => r.offsetSeconds), [0, 2400]);
    assert.ok(result.results.every(r => r.turns.every(t => t.text === "fallback")));
    assert.equal(result.provenance.actualPath, "chunked");
    assert.ok(!JSON.stringify([result.provenance, logs]).includes("secret-key"));
  }
});
test("chunk provider failure propagates without a partial successful result", async () => {
  await assert.rejects(dispatch(input({ singleAttempt: async () => [], chunkAttempt: async () => { throw Error("chunk-refused"); } })), /chunk-refused/);
});
test("unknown, empty or invalid fallback boundaries cannot become success", async () => {
  for (const chunkedBoundaries of [[], [{ start: 0, end: Infinity }], [{ start: 1, end: 0 }]]) {
    await assert.rejects(dispatch(input({ plan: null, chunkedBoundaries })), /invalid recording chunk boundaries/);
  }
});
