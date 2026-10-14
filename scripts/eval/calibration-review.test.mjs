import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareCalibrationReview, exportCalibrationReferences, runCalibrationReview } from "./calibration-review.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "lkb-calibration-review-"));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("lkb-calibration-review-"));
    rmSync(root, { recursive: true, force: true });
  });
  const put = (path, content) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), typeof content === "string" ? content : JSON.stringify(content)); };
  const golden = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, question: `Student question ${i}?`, expectedSessionId: i % 2 ? "session-a" : "session-b" }));
  put("data/eval/golden-set.json", golden);
  put("data/eval/golden-set-sibling-semantic.json", { rows: golden.map((q) => ({ ...q, bestRival: q.expectedSessionId === "session-a" ? "session-b" : "session-a" })) });
  for (const id of ["session-a", "session-b"]) {
    put(`data/toc-migrated/${id}/session.json`, { _id: id, title: `Title ${id}`, tenantId: "fixture", date: "2026-10-14", status: {} });
    put(`data/toc-migrated/${id}/session_page.json`, { sessionId: id, tenantId: "fixture", summary: `Actual summary ${id}`, keyInsights: [], evidence: [] });
  }
  put("packages/index/src/tree/build.ts", "fixture builder binding");
  put("apps/api/src/score.ts", "fixture scorer binding");
  return { root, put, golden };
}
function approve(packet) {
  for (const [i, item] of packet.items.entries())
    item.humanReview = { score: (i % 3) / 2, rationale: "Synthetic test approval only", approvedBy: "Umesh", approvedAt: "2026-10-14T09:00:00.000Z" };
  return packet;
}

test("real thirty-item review artifact matches current sources and cannot yet export", async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const saved = JSON.parse(readFileSync(join(root, "data/eval/calibration-human-review.json"), "utf8"));
  assert.deepEqual(saved, await prepareCalibrationReview(root));
  assert.equal(saved.tenantId, "toc");
  assert.equal(saved.items.length, 30);
  await assert.rejects(exportCalibrationReferences(saved, root), /pending\/invalid score/);
});

test("deterministic neutral 30-pair packet uses diverse current queries and batches of ten", async (t) => {
  const { root, golden } = fixture(t);
  const packet = await prepareCalibrationReview(root);
  assert.deepEqual(packet, await prepareCalibrationReview(root));
  assert.equal(packet.items.length, 30);
  assert.equal(new Set(packet.items.map((i) => i.id)).size, 30);
  assert.equal(new Set(packet.items.map((i) => i.questionId)).size, 15);
  assert.deepEqual(packet.batches.map((b) => b.itemIds.length), [10, 10, 10]);
  assert.ok(packet.items.some((i) => i.questionId === golden.at(-1).id));
  for (const item of packet.items) {
    assert.equal(item.query, golden.find((q) => q.id === item.questionId).question);
    assert.equal(item.node.summary, `Actual summary ${item.sessionId}`);
    assert.equal(item.node.title, `Title ${item.sessionId}`);
    assert.equal(item.node.evidence.sessionRef, item.sessionId);
    assert.deepEqual(item.node.children, []);
    assert.deepEqual(Object.values(item.humanReview), [null, null, null, null]);
    assert.equal("referenceScore" in item, false);
  }
});

test("pending individual approvals refuse downstream export", async (t) => {
  const { root } = fixture(t);
  await assert.rejects(exportCalibrationReferences(await prepareCalibrationReview(root), root), /pending\/invalid score/);
  const packet = approve(await prepareCalibrationReview(root));
  packet.items[29].humanReview.approvedBy = null;
  await assert.rejects(exportCalibrationReferences(packet, root), /individual Umesh review required: review-030/);
});

test("separate references preserve fractional human scores and feed the real MAE seam", async (t) => {
  const { root } = fixture(t);
  const packet = approve(await prepareCalibrationReview(root));
  const report = await exportCalibrationReferences(packet, root);
  assert.equal(report.pairs.length, 30);
  assert.equal(report.pairs[1].referenceScore, 0.5);
  assert.equal(report.provenance.includes("not authenticated"), true);
  const { computeMAE } = await import("../../packages/ask/src/eval/calibration.ts");
  const scores = new Map(report.pairs.map((p) => [`${p.query}\0${p.node.node_id}`, p.referenceScore]));
  const result = await computeMAE(report.pairs, (query, node) => [scores.get(`${query}\0${node.node_id}`), "synthetic exact scorer"]);
  assert.equal(result.n, 30);
  assert.equal(result.mae, 0);
});

test("edited title, query, duplicate IDs or batch membership cannot reuse approvals", async (t) => {
  const { root } = fixture(t);
  for (const mutate of [
    (p) => { p.items[0].node.title = "invented title"; },
    (p) => { p.items[0].query = "replacement question"; },
    (p) => { p.items[1].id = p.items[0].id; },
    (p) => { p.batches[0].itemIds.pop(); },
  ]) {
    const packet = approve(await prepareCalibrationReview(root)); mutate(packet);
    await assert.rejects(exportCalibrationReferences(packet, root), /packet or bound sources changed/);
  }
});

test("even whitespace-only source drift invalidates existing approvals", async (t) => {
  const { root } = fixture(t);
  const packet = approve(await prepareCalibrationReview(root));
  const path = join(root, "data/toc-migrated/session-a/session_page.json");
  writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
  await assert.rejects(exportCalibrationReferences(packet, root), /packet or bound sources changed/);
});

test("invalid numeric scores, reviewer assertions and dates refuse", async (t) => {
  const { root } = fixture(t);
  for (const score of [-0.01, 1.01, NaN, Infinity, "0.5", null]) {
    const packet = approve(await prepareCalibrationReview(root)); packet.items[0].humanReview.score = score;
    await assert.rejects(exportCalibrationReferences(packet, root), /pending\/invalid score/);
  }
  for (const fields of [{ approvedBy: "AI" }, { rationale: " " }, { approvedAt: "yesterday" }, { approvedAt: "2026-02-30T09:00:00.000Z" }]) {
    const packet = approve(await prepareCalibrationReview(root)); Object.assign(packet.items[0].humanReview, fields);
    await assert.rejects(exportCalibrationReferences(packet, root), /review required|approval time/);
  }
});

test("stale rival question, traversal, and cross-tenant source are rejected before preparation", async (t) => {
  const { root, put, golden } = fixture(t);
  const rows = golden.map((q) => ({ ...q, bestRival: q.expectedSessionId === "session-a" ? "session-b" : "session-a" }));
  rows[0].question = "old factual query";
  put("data/eval/golden-set-sibling-semantic.json", { rows });
  await assert.rejects(prepareCalibrationReview(root), /stale semantic query/);
  rows[0].question = golden[0].question; rows[0].bestRival = "../outside";
  put("data/eval/golden-set-sibling-semantic.json", { rows });
  await assert.rejects(prepareCalibrationReview(root), /invalid rival/);
  rows[0].bestRival = "session-a"; put("data/eval/golden-set-sibling-semantic.json", { rows });
  put("data/toc-migrated/session-a/session.json", { _id: "session-a", title: "A", tenantId: "outsider", date: "2026-10-14" });
  put("data/toc-migrated/session-a/session_page.json", { sessionId: "session-a", tenantId: "outsider", summary: "A", keyInsights: [] });
  await assert.rejects(prepareCalibrationReview(root), /cross-tenant/);
});

test("CLI never overwrites review or reference files and pending review creates no output", async (t) => {
  const { root } = fixture(t);
  const review = join(root, "review.json"), references = join(root, "references.json");
  await runCalibrationReview(["prepare", "--out", review], root);
  const original = readFileSync(review);
  await assert.rejects(runCalibrationReview(["prepare", "--out", review], root), /EEXIST/);
  assert.deepEqual(readFileSync(review), original);
  await assert.rejects(runCalibrationReview(["export", "--packet", review, "--out", references], root), /pending\/invalid score/);
  assert.equal(existsSync(references), false);
  writeFileSync(review, JSON.stringify(approve(JSON.parse(original.toString()))));
  await runCalibrationReview(["export", "--packet", review, "--out", references], root);
  const approvedOutput = readFileSync(references);
  assert.equal(JSON.parse(approvedOutput).pairs.length, 30);
  await assert.rejects(runCalibrationReview(["export", "--packet", review, "--out", references], root), /EEXIST/);
  assert.deepEqual(readFileSync(references), approvedOutput);
});
