/**
 * packages/meeting-bot/src/capture/reconnect-gaps.test.ts — T-029. No browser/OBS/ffmpeg: pure
 * mapping (gapsForSourceDoc) and event-collection (collectGapEvent) logic only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { collectGapEvent, gapsForSourceDoc, type GapWindow } from "./reconnect-gaps.js";

test("gapsForSourceDoc converts epoch-second windows to ISO timestamps, keeping reason/recovered", () => {
  const gaps: GapWindow[] = [
    { start: 1_700_000_000, end: 1_700_000_025, reason: "banner", recovered: true },
    { start: 1_700_000_100, end: 1_700_000_140, reason: "offline", recovered: false },
  ];
  const out = gapsForSourceDoc(gaps);
  assert.deepEqual(out, [
    { start: new Date(1_700_000_000 * 1000).toISOString(), end: new Date(1_700_000_025 * 1000).toISOString(), reason: "banner", recovered: true },
    { start: new Date(1_700_000_100 * 1000).toISOString(), end: new Date(1_700_000_140 * 1000).toISOString(), reason: "offline", recovered: false },
  ]);
});

test("gapsForSourceDoc on an empty run is an empty array", () => {
  assert.deepEqual(gapsForSourceDoc([]), []);
});

test("collectGapEvent pushes a well-formed gap event", () => {
  const gaps: GapWindow[] = [];
  collectGapEvent(gaps, { event: "gap", t: 1, start: 10, end: 35, reason: "banner", recovered: true });
  assert.deepEqual(gaps, [{ start: 10, end: 35, reason: "banner", recovered: true }]);
});

test("collectGapEvent ignores every non-gap event (heartbeat, clicked, ended, reconnect-reload)", () => {
  const gaps: GapWindow[] = [];
  for (const event of ["heartbeat", "clicked", "ended", "reconnect-reload", "reconnect-giveup", "opened"]) {
    collectGapEvent(gaps, { event, t: 1 });
  }
  assert.deepEqual(gaps, []);
});

test("collectGapEvent defaults a missing reason/recovered rather than throwing", () => {
  const gaps: GapWindow[] = [];
  collectGapEvent(gaps, { event: "gap", t: 1, start: 5, end: 9 });
  assert.deepEqual(gaps, [{ start: 5, end: 9, reason: "unknown", recovered: false }]);
});

test("collectGapEvent accumulates multiple gaps across a run in order", () => {
  const gaps: GapWindow[] = [];
  collectGapEvent(gaps, { event: "gap", t: 1, start: 0, end: 25, reason: "banner", recovered: true });
  collectGapEvent(gaps, { event: "heartbeat", t: 2 });
  collectGapEvent(gaps, { event: "gap", t: 3, start: 200, end: 400, reason: "offline", recovered: false });
  assert.equal(gaps.length, 2);
  assert.equal(gaps.at(1)?.reason, "offline");
  assert.equal(gaps.at(1)?.recovered, false);
});
