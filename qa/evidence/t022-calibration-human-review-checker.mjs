import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { exportCalibrationReferences } from "../../scripts/eval/calibration-review.mjs";
import { computeMAE } from "../../packages/ask/src/eval/calibration.ts";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const packet = read("data/eval/calibration-human-review.json");
const golden = read("data/eval/golden-set.json");
const semantic = read("data/eval/golden-set-sibling-semantic.json");
assert.equal(packet.items.length, 30);
assert.deepEqual(packet.batches.map((batch) => batch.itemIds.length), [10, 10, 10]);
for (const source of packet.sources) {
  const bytes = readFileSync(resolve(root, source.path));
  assert.equal(bytes.length, source.bytes);
  assert.equal(digest(bytes), source.sha256);
}
const groups = new Map();
for (const item of packet.items) {
  const q = golden.find((q) => q.id === item.questionId);
  assert.equal(item.query, q.question);
  assert.equal(item.node.title, read(`data/toc-migrated/${item.sessionId}/session.json`).title);
  assert.equal(item.node.summary, read(`data/toc-migrated/${item.sessionId}/session_page.json`).summary);
  assert.deepEqual(item.humanReview, { score: null, rationale: null, approvedBy: null, approvedAt: null });
  assert.equal(digest(JSON.stringify({ query: item.query, title: item.node.title, summary: item.node.summary })), item.inputSha256);
  assert.equal(packet.batches[item.batch - 1].itemIds.includes(item.id), true);
  const members = groups.get(item.questionId) ?? [];
  members.push(item.sessionId); groups.set(item.questionId, members);
}
assert.equal(groups.size, 15);
for (const [id, members] of groups) {
  const q = golden.find((q) => q.id === id), rival = semantic.rows.find((q) => q.id === id);
  assert.deepEqual([...members].sort(), [q.expectedSessionId, rival.bestRival].sort());
}
await assert.rejects(exportCalibrationReferences(packet), /pending\/invalid score/);
const synthetic = structuredClone(packet);
for (const item of synthetic.items) item.humanReview = {
  score: 0.375, rationale: "CHECKER SYNTHETIC ONLY: no human approval asserted",
  approvedBy: "Umesh", approvedAt: "2026-10-14T08:00:00.000Z",
};
const references = await exportCalibrationReferences(synthetic);
assert.equal(references.pairs.length, 30);
assert.equal(references.provenance.includes("not authenticated"), true);
const mae = await computeMAE(references.pairs, async () => [0.5, "checker synthetic offset"]);
assert.equal(mae.n, 30); assert.equal(mae.mae, 0.125);
for (let i = 0; i < 30; i++) {
  const altered = structuredClone(synthetic);
  altered.items[i].humanReview.approvedBy = null;
  await assert.rejects(exportCalibrationReferences(altered), /individual Umesh review required/);
}
const forged = structuredClone(synthetic);
forged.items[0].inputSha256 = "0".repeat(64);
await assert.rejects(exportCalibrationReferences(forged), /packet or bound sources changed/);
const legacy = read("data/eval/evaluator-calibration-set.json");
const currentQueries = new Set(golden.map((q) => q.question));
const staleLegacy = legacy.filter((pair) => !currentQueries.has(pair.query)).length;
console.log(JSON.stringify({ inputPairs: 30, questions: 15, batches: [10, 10, 10], sourceHashes: packet.sources.length,
  neutralRatings: 30, missingIndividualApprovalsRefused: 30, tamperedBindingRefused: true,
  syntheticDownstream: { n: mae.n, mae: mae.mae }, staleLegacyQueries: staleLegacy, legacyPairs: legacy.length,
  syntheticApprovalsWrittenToDisk: 0, humanApprovals: 0 }));
