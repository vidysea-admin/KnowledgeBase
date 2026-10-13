/**
 * Lane badturns: seed-toc / sync-session refuse invalid turn timing at write time (fakes: temp dirs only, no DB).
 * Origin: T-043 live run, visa-blueprint t141 (tStart 2008, tEnd 213) and ucas t114 (1883 > 1868) made /ask answer 503 for the whole tree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSessionArtifacts, bindDerivedArtifacts } from "./transcript-provenance.mjs";
import { loadWebinarSession } from "../webinar/session-rows.mjs";
import { assertTurnTimings, turnTimingProblem } from "./turn-timing.mjs";
const put = (dir, name, value) => writeFileSync(join(dir, name), JSON.stringify(value));
const turn = (n, tStart, tEnd) => ({_id: `s1-t${n}`, tenantId: "t", sessionId: "s1", speakerRef: "spk:0", tStart, tEnd, text: "A fact " + n});
function fixture(turns) {
  const dir = mkdtempSync(join(tmpdir(), "lkb-turntiming-"));
  const evidence = [{sessionId: "s1", turnId: turns[0]._id}];
  put(dir, "source.json", {_id: "src", tenantId: "t", title: "T"}); put(dir, "session.json", {_id: "s1", tenantId: "t"});
  put(dir, "turns.json", turns); put(dir, "claims.json", [{_id: "c1", tenantId: "t", text: "A fact", evidence}]);
  put(dir, "session_page.json", {_id: "p1", sessionId: "s1", tenantId: "t", evidence});
  return dir;
}
const BAD = /invalid turn timing, write refused \(1 turn\(s\)\): session s1 turn s1-t2: tEnd 213 is before tStart 2008/;
test("seed loader (--legacy-unbound) refuses a tEnd<tStart turn; message names session and turn", () => {
  const dir = fixture([turn(1, 0, 5), turn(2, 2008, 213)]);
  try { assert.throws(() => loadSessionArtifacts(dir, {legacyUnbound: true}), BAD); } finally { rmSync(dir, {recursive: true, force: true}); }
});
test("a bad turn can never be BOUND (bindDerivedArtifacts refuses it)", () => {
  const dir = fixture([turn(1, 0, 5), turn(2, 2008, 213)]);
  try { assert.throws(() => bindDerivedArtifacts(dir), BAD); } finally { rmSync(dir, {recursive: true, force: true}); }
});
test("seed loader refuses negative tStart and non-finite values; zero-length turn (tEnd == tStart) is valid", () => {
  for (const [s, e] of [[-1, 3], [0, null], ["1", 2]]) {
    const dir = fixture([turn(1, s, e)]);
    try { assert.throws(() => loadSessionArtifacts(dir, {legacyUnbound: true}), /invalid turn timing, write refused \(1 turn\(s\)\): session s1 turn s1-t1/); } finally { rmSync(dir, {recursive: true, force: true}); }
  }
  const dir = fixture([turn(1, 4, 4)]);
  try { assert.equal(loadSessionArtifacts(dir, {legacyUnbound: true}).documents.turns[0].tEnd, 4); } finally { rmSync(dir, {recursive: true, force: true}); }
});
test("seed loader positive control: valid turns load with timing unchanged (nothing swapped)", () => {
  const dir = fixture([turn(1, 0, 5), turn(2, 5, 9)]);
  try { assert.deepEqual(loadSessionArtifacts(dir, {legacyUnbound: true}).documents.turns.map((t) => [t.tStart, t.tEnd]), [[0, 5], [5, 9]]); } finally { rmSync(dir, {recursive: true, force: true}); }
});
test("sync-session loader (loadWebinarSession) refuses it with a message naming session and turn", () => {
  const dir = fixture([turn(1, 0, 5), turn(2, 2008, 213)]);
  try { assert.throws(() => loadWebinarSession(dir, "s1"), BAD); } finally { rmSync(dir, {recursive: true, force: true}); }
});
test("lib: assertTurnTimings lists every bad turn and returns valid input untouched", () => {
  const ok = [turn(1, 0, 1)];
  assert.equal(assertTurnTimings(ok, "s1"), ok);
  assert.throws(() => assertTurnTimings([turn(1, 5, 1), turn(2, 0, 1), turn(3, 9, 2)], "s1"), /\(2 turn\(s\)\).*s1-t1.*s1-t3/);
  assert.equal(turnTimingProblem(turn(1, 1, 1)), null);
});
test("ISS-BADTURNS-003: NaN and Infinity are refused for tStart AND tEnd (typeof number is not enough)", () => {
  for (const [s, e, re] of [[NaN, 5, /tStart is not a finite number/], [Infinity, Infinity, /tStart is not a finite number/], [0, NaN, /tEnd is not a finite number/], [0, Infinity, /tEnd is not a finite number/], [-Infinity, 1, /tStart is not a finite number/]]) {
    assert.match(turnTimingProblem(turn(1, s, e)), re);
    assert.throws(() => assertTurnTimings([turn(1, s, e)], "s1"), /invalid turn timing, write refused/);
  }
});
