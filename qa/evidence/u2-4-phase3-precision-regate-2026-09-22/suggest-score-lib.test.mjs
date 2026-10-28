import test from "node:test";
import assert from "node:assert/strict";
import { personMatch, indexGold, judgeEntry, scoreSession } from "./suggest-score-lib.mjs";
const turns = [0, 1, 2, 3, 4].map((i) => ({ _id: `t${i}`, speakerRef: ["spk:0", "spk:1", "spk:0", "Named", "spk:1"][i] }));
// blocks: 1 spk:0 [0], 2 spk:1 [1], 3 spk:0 [2], 4 spk:1 [4]
const gold = { session: "s", blocks: [{ block: 1, person: "Rashi" }, { block: 2, person: "Kshitij" }, { block: 3, person: "Rashi" }, { block: 4, person: null }] };
const ix = indexGold(gold, turns);
test("personMatch subsequence both ways, never unrelated", () => {
  assert.ok(personMatch("Jubin", "Jubin Thakkar") && personMatch("Jubin Thakkar", "Jubin") && !personMatch("Sonal", "Nikhil") && !personMatch("", "x"));
});
test("block-order drift throws; reorder keeping the label sequence is accepted", () => {
  const swapped = [turns[1], turns[0], turns[2], turns[3], turns[4]];
  assert.throws(() => indexGold(gold, swapped, turns), /order drift/);
  assert.doesNotThrow(() => indexGold(gold, [{ ...turns[0] }, ...turns.slice(1)], turns));
});
test("block-count drift throws", () => assert.throws(() => indexGold({ session: "s", blocks: [] }, turns), /drift/));
test("block-scoped claims are judged per block", () => {
  assert.ok(judgeEntry(ix, { speakerRef: "spk:0", displayName: "Rashi", blocks: [{ startTurnIndex: 0, endTurnIndex: 0 }] }).correct);
  assert.ok(!judgeEntry(ix, { speakerRef: "spk:0", displayName: "Kshitij", blocks: [{ startTurnIndex: 0, endTurnIndex: 0 }] }).correct);
  assert.ok(!judgeEntry(ix, { speakerRef: "spk:1", displayName: "Rashi", blocks: [{ startTurnIndex: 3, endTurnIndex: 3 }] }).correct, "turn 3 is not a block start");
  assert.ok(!judgeEntry(ix, { speakerRef: "spk:1", displayName: "Kshitij", blocks: [{ startTurnIndex: 4, endTurnIndex: 4 }] }).correct, "gold-unnamed block is wrong");
});
test("label-wide claim must hold on every block of the label", () => {
  assert.ok(judgeEntry(ix, { speakerRef: "spk:0", displayName: "Rashi" }).correct === false, "label-wide is always flagged");
  assert.ok(judgeEntry(ix, { speakerRef: "spk:0", displayName: "Rashi" }).reasons.length === 1);
  assert.ok(judgeEntry(ix, { speakerRef: "spk:1", displayName: "Kshitij" }).reasons.length === 2, "block 4 unnamed contradicts");
});
test("recall counts only CORRECT outputs", () => {
  const r = scoreSession(ix, [{ speakerRef: "spk:0", displayName: "Rashi", blocks: [{ startTurnIndex: 0 }, { startTurnIndex: 2 }] }, { speakerRef: "spk:1", displayName: "Sonal", blocks: [{ startTurnIndex: 1 }] }]);
  assert.deepEqual(r.gold.map((g) => [g.person, g.recovered]), [["Rashi", true], ["Kshitij", false]]);
  assert.deepEqual(r.judged.map((j) => j.correct), [true, false]);
});
