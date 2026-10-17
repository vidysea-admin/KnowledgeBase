import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";
import { prepareCalibrationReview } from "./calibration-review.mjs";
import { validateHumanCalibrationInputs, evaluateHumanCalibration, runHumanCalibration, createHumanCalibrationTransport, validateHumanProviderOrder, assertHumanCalibrationSourcesCurrent, implementationBindings } from "./human-calibration.mjs";
register();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hash = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const actor = `api-key-sha256:${"a".repeat(64)}`;
// Authentic source inputs are private; the entered reference judgments are fictional test assertions.
const privateReviewEnabled = process.env.KB_T022_PRIVATE_REVIEW_TESTS === "1";
const privateTest = (name, check) => test(name, {
  skip: privateReviewEnabled ? false : "HOLD: authentic private review inputs require explicit KB_T022_PRIVATE_REVIEW_TESTS=1",
}, async context => {
  if (!privateReviewEnabled) return;
  return check(context);
});
async function synthetic() {
  assert.equal(privateReviewEnabled, true, "Authentic private source opt-in required before preparation");
  const neutral = await prepareCalibrationReview(ROOT), packet = structuredClone(neutral);
  for (const item of packet.items) item.humanReview = { score: 0.375, rationale: "Synthetic test only, not actual Umesh judgment", approvedBy: "Umesh", approvedAt: "2026-10-14T00:00:00.000Z" };
  const artifact = { format: "calibration-reviewed-export-v1", packet, packetSha256: hash(neutral), tenantId: packet.tenantId,
    humanGoldVerified: false, audit: packet.items.map(i => ({ revision: 1, tenantId: packet.tenantId, itemId: i.id, authenticatedActor: actor,
      identityBasis: "tenant-api-key; Umesh identity is asserted, not verified", inputSha256: i.inputSha256, before: null, after: i.humanReview, at: i.humanReview.approvedAt })) };
  const confirmations = { format: "calibration-human-confirmations-v1", tenantId: packet.tenantId, packetSha256: artifact.packetSha256,
    items: packet.items.map(i => ({ id: i.id, confirmedBy: "Umesh", inputSha256: i.inputSha256, score: i.humanReview.score,
      rationale: i.humanReview.rationale, revision: 1, authenticatedActor: actor,
      confirmedAt: "2026-10-14T00:00:01.000Z", evidenceReference: "owner-confirmation-record://review-receipt" })) };
  // Injected trusted proof is a synthetic test double, never operator configuration or actual owner evidence.
  const receipt = { format: "calibration-checked-human-confirmations-v1", verdict: "human-labels-verified", actualIndividualHumanReviews: 30,
    exportSha256: hash(artifact), confirmationsSha256: hash(confirmations), packetSha256: artifact.packetSha256, tenantId: artifact.tenantId,
    independentChecker: "injected-checker-proof", evidenceReference: "owner-confirmation-record://checked-receipt", checkedAt: "2026-10-14T00:00:02.000Z" };
  return { artifact, confirmations, verification: { receipt, trustedReceiptSha256: hash(receipt) } };
}
privateTest("real neutral packet has no labels and cannot reach a live judge", async () => {
  const packet = await prepareCalibrationReview(ROOT);
  assert.equal(packet.items.filter(i => i.humanReview.approvedBy !== null).length, 0);
  await assert.rejects(validateHumanCalibrationInputs({ format: "calibration-reviewed-export-v1", packet,
    packetSha256: hash(packet), tenantId: packet.tenantId, humanGoldVerified: false, audit: [] }, null), /pending\/invalid score/);
});
privateTest("explicit synthetic authenticated references feed real asynchronous MAE without changing scores", async () => {
  const { artifact, confirmations, verification } = await synthetic();
  const inputs = await validateHumanCalibrationInputs(artifact, confirmations, ROOT, verification);
  const { computeMAE } = await import("../../packages/ask/src/eval/calibration.ts");
  const report = await evaluateHumanCalibration(inputs, async pairs => ({ ...await computeMAE(pairs, async () => 0.5), notScored: 0, fallbackIds: [] }));
  assert.equal(report.referenceCount, 30); assert.equal(report.pairsScored, 30); assert.equal(report.mae, 0.125);
  assert.ok(report.details.every(d => d.reference === 0.375 && d.absError === 0.125));
  assert.equal(report.thresholdChanged, false); assert.match(report.humanAttribution, /independently verified/);
  const corpus = mkdtempSync(join(tmpdir(), "t022-current-corpus-"));
  try {
    for (const source of artifact.packet.sources) {
      const target = resolve(corpus, source.path); mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(ROOT, source.path), target);
    }
    assert.equal((await assertHumanCalibrationSourcesCurrent(inputs, artifact.packet, corpus)).length, 44);
    const copiedSource = resolve(corpus, artifact.packet.sources[0].path);
    writeFileSync(copiedSource, `${readFileSync(copiedSource, "utf8")}\n`);
    await assert.rejects(assertHumanCalibrationSourcesCurrent(inputs, artifact.packet, corpus), /changed|drift|mismatch/);
  } finally { if (corpus.startsWith(join(tmpdir(), "t022-current-corpus-"))) rmSync(corpus, { recursive: true, force: true }); }
});
privateTest("each missing human confirmation, forged score, audit actor, source and typed humanGold is refused", async () => {
  const { artifact, confirmations } = await synthetic();
  for (let index = 0; index < 30; index++) {
    const copy = structuredClone(confirmations); copy.items[index].evidenceReference = "";
    await assert.rejects(validateHumanCalibrationInputs(artifact, copy), /confirmation receipt required/);
  }
  const missing = structuredClone(confirmations); missing.items.pop();
  await assert.rejects(validateHumanCalibrationInputs(artifact, missing), /30 genuine/);
  const duplicate = structuredClone(confirmations); duplicate.items[1] = duplicate.items[0];
  await assert.rejects(validateHumanCalibrationInputs(artifact, duplicate), /duplicate/);
  const wrongScore = structuredClone(confirmations); wrongScore.items[0].score = 1;
  await assert.rejects(validateHumanCalibrationInputs(artifact, wrongScore), /confirmation receipt required/);
  const wrongActor = structuredClone(artifact); wrongActor.audit[0].authenticatedActor = "client-claimed-name";
  await assert.rejects(validateHumanCalibrationInputs(wrongActor, confirmations), /audit provenance invalid/);
  const wrongSource = structuredClone(artifact); wrongSource.packet.sources[0].sha256 = "0".repeat(64);
  await assert.rejects(validateHumanCalibrationInputs(wrongSource, confirmations), /binding mismatch/);
  await assert.rejects(validateHumanCalibrationInputs({ ...artifact, humanGoldVerified: true }, confirmations), /fabricated humanGold/);
});
privateTest("fallback and unscored results never become final calibration", async () => {
  const { artifact, confirmations, verification } = await synthetic(), inputs = await validateHumanCalibrationInputs(artifact, confirmations, ROOT, verification);
  const details = inputs.references.pairs.map(p => ({ id: p.id, predicted: 0.5, reference: p.referenceScore, absError: 0.125 }));
  const report = await evaluateHumanCalibration(inputs, async () => ({ n: 30, notScored: 0, mae: 0.125, details, fallbackIds: [details[0].id] }));
  assert.equal(report.status, "partial-or-fallback-not-final-calibration");
});
privateTest("typed confirmations cannot reach live calibration without independently operator-bound proof", async () => {
  const { artifact, confirmations, verification } = await synthetic();
  await assert.rejects(validateHumanCalibrationInputs(artifact, confirmations), /independently checked/);
  await assert.rejects(validateHumanCalibrationInputs(artifact, confirmations, ROOT, { ...verification, trustedReceiptSha256: "0".repeat(64) }), /does not match/);
  const syntheticMarker = structuredClone(confirmations); syntheticMarker.items[0].evidenceReference = "SYNTHETIC_TEST_ONLY";
  await assert.rejects(validateHumanCalibrationInputs(artifact, syntheticMarker, ROOT, verification), /confirmation receipt required/);
  const wrongExport = structuredClone(verification); wrongExport.receipt.exportSha256 = "0".repeat(64); wrongExport.trustedReceiptSha256 = hash(wrongExport.receipt);
  await assert.rejects(validateHumanCalibrationInputs(artifact, confirmations, ROOT, wrongExport), /operator-bound verification/);
});
test("existing evidence path is refused before any provider module or key access", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "t022-runner-test-")), out = join(temporary, "historical.json");
  try {
    writeFileSync(out, "preserved");
    await assert.rejects(runHumanCalibration(["--review-export", join(temporary, "absent.json"), "--human-confirmations", join(temporary, "absent-confirmations.json"), "--out", out]), /never overwrite/);
    assert.equal(readFileSync(out, "utf8"), "preserved");
  } finally { if (temporary.startsWith(join(tmpdir(), "t022-runner-test-"))) rmSync(temporary, { recursive: true, force: true }); }
});
test("physical transport refuses other origins and caps retries without forwarding credentials", async () => {
  let calls = 0, redirectMode;
  const budget = createHumanCalibrationTransport("ollama", "https://ollama.com", 1, async (_url, options) => {
    calls++; redirectMode = options.redirect; return { status: 200, text: async () => "{}" };
  });
  await assert.rejects(budget.transport({ kind: "http", url: "https://foreign.invalid/api/chat", headers: { authorization: "dummy-test-key" } }), /unapproved provider/);
  assert.equal(calls, 0);
  await budget.transport({ kind: "http", url: "https://ollama.com/api/chat", body: { query: "synthetic" } });
  assert.equal(calls, 1); assert.equal(redirectMode, "error"); assert.equal(budget.stats.requests, 1);
  await assert.rejects(budget.transport({ kind: "http", url: "https://ollama.com/api/chat" }), /cap reached/);
  assert.equal(calls, 1);
});
privateTest("D164 model ordering requires full same-human-corpus predecessor receipts, never legacy proxies", async () => {
  const { artifact, confirmations, verification } = await synthetic();
  const inputs = await validateHumanCalibrationInputs(artifact, confirmations, ROOT, verification);
  assert.deepEqual(validateHumanProviderOrder(inputs, "ollama", "glm-5.3-flash"), []);
  assert.throws(() => validateHumanProviderOrder(inputs, "ollama", "deepseek-v4.1-flash"), /predecessor required/);
  assert.throws(() => validateHumanProviderOrder(inputs, "gemini", "approved-final-model", [{ kind: "calibration", provider: "ollama", model: "glm-5.3-flash" }]), /predecessor required/);
  // Explicit synthetic complete receipt is a pure policy-test double; it is never an actual provider artifact.
  const details = inputs.references.pairs.map(p => ({ id: p.id, predicted: 0.5, reference: p.referenceScore, absError: 0.125 }));
  const glm = { kind: "human-reference-calibration", provider: "ollama", model: "glm-5.3-flash", status: "complete-provider-evidence-awaiting-independent-check",
    exportSha256: inputs.exportSha256, confirmationsSha256: inputs.confirmationsSha256, verifiedReceiptSha256: inputs.verifiedReceiptSha256,
    pairsScored: 30, pairsNotScored: 0, sourceDriftDetected: false, fallbackIds: [], details, mae: 0.125,
    calls: { failed: 0, heuristicFallbacks: 0 }, physicalTransport: { requests: 30, failed: 0, httpErrors: 0 },
    implementationBindings: implementationBindings(), bindingsAfterExecution: implementationBindings() };
  const bindings = validateHumanProviderOrder(inputs, "ollama", "deepseek-v4.1-flash", [glm]);
  const deepseek = { ...glm, model: "deepseek-v4.1-flash", predecessorBindings: bindings };
  assert.equal(validateHumanProviderOrder(inputs, "gemini", "approved-final-model", [glm, deepseek]).length, 2);
  assert.throws(() => validateHumanProviderOrder(inputs, "gemini", "approved-final-model", [glm, { ...deepseek, pairsScored: 29 }]), /predecessor required/);
});

test("executed provenance binds local router adapters parser barrel lock resolver and runtime", () => {
  const current = implementationBindings(), temporary = mkdtempSync(join(tmpdir(), "t022-provenance-"));
  try {
    for (const file of current.files) {
      const target = resolve(temporary, file.path); mkdirSync(dirname(target), { recursive: true }); copyFileSync(resolve(ROOT, file.path), target);
    }
    assert.deepEqual(implementationBindings(temporary, current.runtime), current);
    for (const path of ["packages/ai/src/router.ts", "packages/ai/src/providers/ollama.ts", "packages/ai/src/providers/gemini.ts",
      "packages/ai/src/json.ts", "packages/ai/src/index.ts", "pnpm-lock.yaml", "packages/ai/package.json", "tsconfig.base.json"]) {
      assert.ok(current.files.some(file => file.path === path), `missing ${path}`);
      const target = resolve(temporary, path), original = readFileSync(target);
      try {
        writeFileSync(target, Buffer.concat([original, Buffer.from("\n// fictional source drift\n")]));
        assert.notDeepEqual(implementationBindings(temporary, current.runtime), current, path);
      } finally { writeFileSync(target, original); }
    }
    assert.ok(current.runtime.executable && current.runtime.version && current.runtime.aiEntry);
    assert.match(current.runtime.tsxEntry.sha256, /^[a-f0-9]{64}$/);
    for (const key of ["execArgvSha256", "nodeOptionsSha256"]) assert.match(current.runtime[key], /^[a-f0-9]{64}$/);
    assert.notDeepEqual(implementationBindings(temporary, { ...current.runtime, version: "fictional-other-runtime" }), current);
    const added = resolve(temporary, "packages/ai/src/new-runtime.ts");
    writeFileSync(added, "export const added = true;\n");
    assert.notDeepEqual(implementationBindings(temporary, current.runtime), current);
    writeFileSync(added, "export const load = name => import(name);\n");
    assert.throws(() => implementationBindings(temporary, current.runtime), /unresolved dynamic AI dependency/);
    rmSync(added);
    rmSync(resolve(temporary, "packages/ai/src/index.ts"));
    assert.throws(() => implementationBindings(temporary, current.runtime), /missing evaluator AI entry/);
  } finally { if (temporary.startsWith(join(tmpdir(), "t022-provenance-"))) rmSync(temporary, { recursive: true, force: true }); }
});

test("executed provenance predecessor consumer refuses stale missing runtime or after-run bindings", () => {
  // Entirely fictional references and predictions; no private packet or assertion of actual human review.
  const current = implementationBindings(), pairs = Array.from({ length: 30 }, (_, i) => ({ id: `fictional-${i}`, referenceScore: 0.375 }));
  const inputs = { exportSha256: "fictional-export", confirmationsSha256: "fictional-confirmations", verifiedReceiptSha256: "fictional-receipt", references: { pairs } };
  const details = pairs.map(p => ({ id: p.id, reference: p.referenceScore, predicted: 0.5, absError: 0.125 }));
  const report = { kind: "human-reference-calibration", provider: "ollama", model: "glm-5.3-flash", status: "complete-provider-evidence-awaiting-independent-check",
    exportSha256: inputs.exportSha256, confirmationsSha256: inputs.confirmationsSha256, verifiedReceiptSha256: inputs.verifiedReceiptSha256,
    pairsScored: 30, pairsNotScored: 0, sourceDriftDetected: false, fallbackIds: [], details, mae: 0.125,
    calls: { failed: 0, heuristicFallbacks: 0 }, physicalTransport: { requests: 30, failed: 0, httpErrors: 0 },
    implementationBindings: current, bindingsAfterExecution: current };
  assert.equal(validateHumanProviderOrder(inputs, "ollama", "deepseek-v4.1-flash", [report], current).length, 1);
  for (const field of ["implementationBindings", "bindingsAfterExecution"]) {
    for (const value of [undefined, { ...current, runtime: { ...current.runtime, version: "fictional-old-runtime" } },
      { ...current, files: current.files.map(file => file.path === "packages/ai/src/router.ts" ? { ...file, sha256: "0".repeat(64) } : file) }]) {
      assert.throws(() => validateHumanProviderOrder(inputs, "ollama", "deepseek-v4.1-flash", [{ ...report, [field]: value }], current), /executed implementation mismatch/);
    }
  }
  const bindings = validateHumanProviderOrder(inputs, "ollama", "deepseek-v4.1-flash", [report], current);
  const deepseek = { ...report, model: "deepseek-v4.1-flash", predecessorBindings: bindings };
  assert.equal(validateHumanProviderOrder(inputs, "gemini", "fictional-final-model", [report, deepseek], current).length, 2);
  assert.throws(() => validateHumanProviderOrder(inputs, "gemini", "fictional-final-model", [report, { ...deepseek, bindingsAfterExecution: null }], current), /executed implementation mismatch/);
});
