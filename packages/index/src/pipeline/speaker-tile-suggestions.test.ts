/**
 * speaker-tile-suggestions.test.ts -- T-042 / D-160. Synthetic 4-panelist meeting (NOT a live capture): tile capture lines -> aligner -> fusion
 * -> speaker_suggestions rows. Pins: rows are SUGGESTED and kind "tile", never final; flag off changes nothing; hostile capture is inert.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SpeakerSuggestions } from "@lkb/core";
import { buildTileSuggestionDocs, parseTileCapture, storeTileSuggestions } from "./speaker-tile-suggestions.js";
import type { FusionTurn } from "./speaker-rules/speaker-tile-fusion.js";

const PANEL = ["Priya Nair", "Rahul Verma", "Asha Rao", "Kiran Shah"];
const FILLER = "We will look at the eligibility rules and the scholarship timeline next.";
// 4 labels, 3 turns each of 20 s, round robin: spk:0..3
const turns: FusionTurn[] = [];
for (let i = 0; i < 12; i++) turns.push({ id: `t${i}`, tStart: i * 20, tEnd: i * 20 + 20, speakerRef: `spk:${i % 4}`, text: FILLER });
const speakerAt = (t: number): number => Math.floor(t / 20) % 4;
/** Capture lines as the bot writes them: sampled every 2 s, the highlight lagging speech by 1 s. */
function capture(nameOf: (spk: number) => string | null = (s) => PANEL[s]!): string {
  const lines = [JSON.stringify({ kind: "meta", startedAtEpoch: 1000, source: "meet-dom" })];
  for (let t = 0; t < 240; t += 2) lines.push(JSON.stringify({ tSec: t, displayName: nameOf(speakerAt(Math.max(0, t - 1))), source: "meet-dom" }));
  return lines.join("\n") + "\n";
}
const NOW = new Date("2026-10-13T09:00:00.000Z");
const build = (jsonl: string, ts: FusionTurn[] = turns, enabled = true) => buildTileSuggestionDocs("tenant-A", "sess1", parseTileCapture(jsonl), ts, { enabled, now: NOW });

test("4 panelists on tiles -> 4 SUGGESTED rows of kind tile, none final, provenance carries the tile quote and turn ids", () => {
  const docs = build(capture());
  assert.deepEqual(docs.map((d) => [d.speakerRef, d.displayName, d.status]), PANEL.map((n, i) => [`spk:${i}`, n, "suggested"]));
  for (const d of docs) {
    assert.equal(d.provenance[0].evidenceKind, "tile");
    assert.match(d.provenance[0].evidenceQuote, /^Meet tile ".+" was highlighted while spk:\d spoke/u);
    assert.ok(d.evidence.every((e) => e.sessionId === "sess1"));
    assert.equal("finalProvenance" in d, false);
    assert.equal(d.decidedAt, undefined);
    assert.equal(d.tenantId, "tenant-A");
    assert.equal(d._id, `tenant-A-sess1-${d.speakerRef}-${d.personId}`);
  }
});

test("tile + a clean self-introduction that agrees is still only SUGGESTED (agree basis)", () => {
  const ts = turns.map((t) => (t.id === "t0" ? { ...t, text: "Hello everyone, my name is Priya Nair and I lead admissions." } : t));
  const d = build(capture(), ts).find((x) => x.speakerRef === "spk:0")!;
  assert.equal(d.status, "suggested");
  assert.equal(d.provenance[0].evidenceKind, "tile");
});

test("a self-introduction ONLY (no tile) is not re-suggested here: that is the existing floor's job", () => {
  const ts = turns.map((t) => (t.id === "t0" ? { ...t, text: "Hello everyone, my name is Priya Nair and I lead admissions." } : t));
  assert.deepEqual(build(capture(() => null), ts), []);
});

test("junk or contradicting tiles produce no row: org name, one name on two voices, tile vs introduction conflict", () => {
  assert.deepEqual(build(capture((s) => ["Vidysea Admissions", "Rahul Verma", "Asha Rao", "Kiran Shah"][s]!)).map((d) => d.displayName), ["Rahul Verma", "Asha Rao", "Kiran Shah"]);
  assert.deepEqual(build(capture((s) => (s < 2 ? "Priya Nair" : PANEL[s]!))).map((d) => d.displayName), ["Asha Rao", "Kiran Shah"]);
  const ts = turns.map((t) => (t.id === "t0" ? { ...t, text: "Hello everyone, my name is Rahul Verma and I lead admissions." } : t));
  assert.ok(!build(capture(), ts).some((d) => d.speakerRef === "spk:0"));
});

test("flag OFF (default and explicit): nothing is built, parsed-and-built to [], and the store is never called", async () => {
  let calls = 0;
  const insert = async () => { calls++; return 1; };
  assert.deepEqual(build(capture(), turns, false), []);
  assert.deepEqual(buildTileSuggestionDocs("t", "s", parseTileCapture(capture()), turns), []);
  assert.equal(await storeTileSuggestions("t", "s", capture(), turns, insert), 0);
  assert.equal(await storeTileSuggestions("t", "s", capture(), turns, insert, { enabled: false }), 0);
  assert.equal(calls, 0);
});

test("flag ON: the store receives only status=suggested rows of this session", async () => {
  const got: { tenantId: string; sessionId: string; docs: readonly SpeakerSuggestions[] }[] = [];
  const n = await storeTileSuggestions("tenant-A", "sess1", capture(), turns, async (tenantId, sessionId, docs) => { got.push({ tenantId, sessionId, docs }); return docs.length; }, { enabled: true, now: NOW });
  assert.equal(n, 4);
  assert.equal(got.length, 1);
  assert.ok(got[0]!.docs.every((d) => d.status === "suggested" && d.sessionId === "sess1" && d.provenance[0].evidenceKind === "tile"));
});

test("a misaligned or empty capture suggests nothing", async () => {
  assert.deepEqual(build(""), []);
  assert.deepEqual(build(capture(() => null)), []);
});

test("hostile capture lines are skipped, never thrown on", () => {
  const bad = ["not json", "[]", "null", '{"tSec":-1,"displayName":"A B"}', '{"tSec":"3","displayName":"A B"}', '{"tSec":3,"displayName":5}', "x".repeat(5000), '{"kind":"meta"}'].join("\n");
  assert.deepEqual(parseTileCapture(bad), []);
  assert.deepEqual(parseTileCapture(undefined), []);
  assert.deepEqual(parseTileCapture(42), []);
  assert.deepEqual(parseTileCapture('{"tSec":3,"displayName":null}\n{"tSec":4,"displayName":"A B","source":"meet-dom"}'), [{ tSec: 3, displayName: null }, { tSec: 4, displayName: "A B", source: "meet-dom" }]);
});
