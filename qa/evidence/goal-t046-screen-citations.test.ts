/** Independent T-046 C1/C2 probe: synthetic disposable data, actual proof/gather/evaluator, no execute or unlink. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { evaluatePurge } from "../../packages/ingest/src/retention/retention-purge.js";
import { REAL_IO } from "../../packages/ingest/src/retention/retention-report-media.js";
import { DAY, NOW, iso, snapshot, writeSession } from "../../packages/ingest/src/retention/retention-report.fixtures.js";
import { markSessionProcessedFromProof } from "../../packages/ingest/src/retention/production/retention-processed-proof.js";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const owned = mkdtempSync(join(tmpdir(), "t046-checker-screen-"));
  const root = join(owned, "state"), media = join(owned, "media"), operations = join(owned, "operations.json");
  mkdirSync(media); writeFileSync(operations, JSON.stringify({ version: 1, operations: {} }));
  const tenant = "toc", session = "screen-boundary";
  const dir = writeSession(root, media, { tenant, name: session, processedAt: iso(100 * DAY - 3_600_000),
    mediaMtimeMs: NOW - 100 * DAY, mediaBytes: 10 });
  const file = (name: string) => join(dir, name);
  const source = JSON.parse(readFileSync(file("source.json"), "utf8"));
  source.createdAt = iso(200 * DAY); source.testData = true;
  writeFileSync(file("source.json"), JSON.stringify(source));
  const state = JSON.parse(readFileSync(file("session.json"), "utf8"));
  state.sourceId = source._id; state.audit = { fixture: "preserve" };
  writeFileSync(file("session.json"), JSON.stringify(state));
  const speech = JSON.parse(readFileSync(file("turns.json"), "utf8"));
  const claims = JSON.parse(readFileSync(file("claims.json"), "utf8"));
  const screenId = `${session}-screen-row`;
  const opts = { tenant, dataRoot: root, mediaRoot: media, minAgeDays: 7, clipPaddingSeconds: 15,
    operationsState: operations, asOf: NOW };
  const evaluate = () => {
    const before = snapshot(owned);
    const result = evaluatePurge(opts, REAL_IO, NOW);
    assert.deepEqual(snapshot(owned), before, "actual evaluation must leave every fixture byte/size/mtime unchanged");
    assert.ok(result.ok, JSON.stringify(result));
    return result;
  };
  const addCombined = (screenStatus: "needs-review" | "verified") => {
    const combined = [...speech, { _id: screenId, tenantId: tenant, sessionId: session, speakerRef: "screen",
      tStart: 200, tEnd: 210, text: "[Screen OCR; unverified] synthetic fixture observation",
      screenEvidence: { frameId: "fixture-frame", file: "screen-frames/fixture/frame-1.jpg", hash: "1".repeat(64), tStart: 200 } }];
    writeFileSync(file("knowledge-turns.json"), JSON.stringify(combined));
    writeFileSync(file("claims.json"), JSON.stringify([...claims, { _id: `${session}-screen-claim`, tenantId: tenant,
      status: screenStatus, text: "synthetic screen-only claim", evidence: [{ turnId: screenId, sessionId: session }] }]));
    const binding = { tenantId: tenant, sessionId: session, sourceId: source._id, workDb: "lkb_staging",
      generation: "checker-screen-current-fixture", inputArtifact: "knowledge-turns.json" as const };
    const proof = { version: 3, ...binding, sourceHash: sha(readFileSync(file("source.json"))),
      inputHash: sha(readFileSync(file("knowledge-turns.json"))), status: "done", strict: true,
      turnCount: combined.length, semanticSupport: "passed", summary: "done", claims: "done", chunks: "done", tree: "done" };
    writeFileSync(file("index-proof.json"), JSON.stringify(proof));
    // These are explicitly synthetic proof assertions, never live index or human-verification receipts.
    const accepted = markSessionProcessedFromProof(dir, binding, NOW - 30 * DAY);
    assert.ok(accepted.ok, `actual proof consumer refused fixture: ${JSON.stringify(accepted)}`);
    assert.equal(JSON.parse(readFileSync(file("session.json"), "utf8")).audit.fixture, "preserve");
  };
  const cleanup = () => {
    const rel = relative(resolve(tmpdir()), resolve(owned));
    assert.ok(rel.startsWith("t046-checker-screen-") && !rel.includes(".."), "cleanup target must remain the generated temporary root");
    rmSync(owned, { recursive: true, force: true });
  };
  return { evaluate, addCombined, cleanup, screenId };
}

test("an unverified screen-only claim in the accepted combined generation blocks raw-media eligibility", () => {
  const f = fixture();
  try {
    assert.equal(f.evaluate().candidates.length, 1, "speech-only baseline proves unrelated vetoes do not mask the boundary");
    f.addCombined("needs-review");
    const result = f.evaluate();
    console.log(JSON.stringify({ probe: "unverified-screen", candidates: result.candidates.map(c => ({ key: c.key, windows: c.windows })),
      vetoes: [...result.vetoes], expected: "no candidates", realPurge: false }));
    assert.equal(result.candidates.length, 0, "a screen-only needs-review claim must not disappear from the raw recording's verification gate");
  } finally { f.cleanup(); }
});

test("an eligible all-verified combined generation retains the cited screen clip window, or conservatively keeps media", () => {
  const f = fixture();
  try {
    assert.equal(f.evaluate().candidates.length, 1, "speech-only baseline proves unrelated vetoes do not mask the boundary");
    f.addCombined("verified");
    const result = f.evaluate();
    console.log(JSON.stringify({ probe: "verified-screen-window", candidates: result.candidates.map(c => ({ key: c.key, windows: c.windows })),
      vetoes: [...result.vetoes], expectedScreen: { turnId: f.screenId, tStart: 185, tEnd: 225 }, realPurge: false }));
    for (const candidate of result.candidates) {
      assert.ok(candidate.windows.some(window => window.turnId === f.screenId && window.tStart === 185 && window.tEnd === 225),
        "eligible raw recording must retain the ±15-second screen citation window; conservative KEEP is also safe");
    }
  } finally { f.cleanup(); }
});
