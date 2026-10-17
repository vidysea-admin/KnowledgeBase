import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { loadTrustedRecordingPrivacy as load, evaluateRecordingCoverage as coverage, parseSealedCaptureInput } from "./private-recording.mjs";
import { createPrivateRecordingFixture } from "../../../qa/evidence/t048-private-capture/fixture.mjs";
import { createHash } from "node:crypto";
import path from "node:path";
import { buildTranscriptQaGeneration } from "./transcript-qa-generation.mjs";
import { verifyTrustedRecordingPrivacyAdmission as admit } from "./private-recording.mjs";
const { clampAndValidateTurns } = await import("../../../packages/ai/src/stt/transcript-qa.ts");

test("actual durable receipt/current media guard invokes only bound public audio", async () => {
  const f = createPrivateRecordingFixture();
  try {
    const context = await load(f.options); let calls = 0;
    const result = await context.runProvider(async (file, proof) => { calls++; assert.equal(file, f.audioPath); assert.equal(proof.sha256, f.sealedInput.sha256); return readFileSync(file, "utf8"); });
    assert.equal(result, "public audio dummy"); assert.equal(calls, 1);
    assert.equal(context.publicIntervals[0].tEnd, 299.899999);
    assert.equal(context.publicIntervals[1].tStart, 600.100001);
  } finally { f.cleanup(); }
});
test("missing sealed input refuses actual captured provider, provided legacy source stays public", async () => {
  const f = createPrivateRecordingFixture();
  try {
    const context = await load({ ...f.options, sealedInput: undefined }); let calls = 0;
    await assert.rejects(context.runProvider(async () => { calls++; }), /sealed parent input/); assert.equal(calls, 0);
    assert.equal(await load({ source: { kind: "recording", tenantId: "provided" } }), null);
    for (const source of [{ captureMode: "silent" }, { privateWindows: [] }, { guardedPrivateWindows: {} }]) await assert.rejects(load({ source }), /lacks durable/);
  } finally { f.cleanup(); }
});
test("foreign owner, raw selection, forged locator/digest/generation make zero provider calls", async () => {
  const mutations = [
    f => ({ ...f.options, sealedInput: { ...f.sealedInput, tenantId: "foreign" } }),
    f => ({ ...f.options, audioPath: f.original }),
    f => ({ ...f.options, source: { ...f.source, captureConsent: { ...f.source.captureConsent, recordDir: "../outsider" } } }),
    f => ({ ...f.options, source: { ...f.source, captureConsent: { ...f.source.captureConsent, receiptSha256: "a".repeat(64) } } }),
    f => ({ ...f.options, sealedInput: { ...f.sealedInput, generation: "00000000-0000-4000-8000-000000000000" } }),
    f => ({ ...f.options, sealedInput: { ...f.sealedInput, sourceSha256: "a".repeat(64) } }),
  ];
  for (const mutate of mutations) {
    const f = createPrivateRecordingFixture(); let calls = 0;
    try { await assert.rejects(async () => { const ctx = await load(mutate(f)); await ctx.runProvider(async () => { calls++; }); }); assert.equal(calls, 0); }
    finally { f.cleanup(); }
  }
});
test("changed source/receipt/audio/video after guard construction refuse before provider", async () => {
  for (const mutate of [f => writeFileSync(f.sourcePath, JSON.stringify({ ...f.source, audioPath: "original.mp4" })),
    f => writeFileSync(f.audioPath, "raw substituted"), f => writeFileSync(f.videoPath, "raw substituted"),
    f => { const file = `${f.recordDir}/record-consent/owned/capture.json`; const row = JSON.parse(readFileSync(file)); row.privateWindows.push({ tStart: 650, tEnd: 700 }); writeFileSync(file, JSON.stringify(row)); }]) {
    const f = createPrivateRecordingFixture(); let calls = 0;
    try { const ctx = await load(f.options); mutate(f); await assert.rejects(ctx.runProvider(async () => { calls++; })); assert.equal(calls, 0); }
    finally { f.cleanup(); }
  }
});
test("privacy removes whole guarded overlaps while invalid/past-end timing stays in QA domain", async () => {
  const f = createPrivateRecordingFixture();
  try {
    const ctx = await load(f.options);
    const turns = [{ tStart: 0, tEnd: 100, text: "public" }, { tStart: 299.95, tEnd: 300, text: "private edge" },
      { tStart: 400, tEnd: 500, text: "private" }, { tStart: -1, tEnd: 500, text: "invalid" }, { tStart: 400, tEnd: 1000, text: "past end" }];
    const result = ctx.filterSpanTurns(turns, 0, 900);
    assert.deepEqual(result.privacy.excludedIndices, [1, 2]); assert.deepEqual(result.turns, [turns[0], turns[3], turns[4]]);
    const offset = ctx.filterSpanTurns([{ tStart: 0, tEnd: 50 }, { tStart: 200.2, tEnd: 250 }], 400, 500);
    assert.deepEqual(offset.privacy.excludedIndices, [0]);
  } finally { f.cleanup(); }
});
test("intentional silence excludes guard margins, genuine public gaps keep accumulated thresholds", () => {
  const privacy = { publicIntervals: [{ tStart: 0, tEnd: 299.899999 }, { tStart: 600.100001, tEnd: 900 }] };
  assert.equal(coverage({ privacy, turns: [{ tStart: 0, tEnd: 299.899999 }, { tStart: 600.100001, tEnd: 900 }], durationSeconds: 900 }).complete, true);
  const split = { publicIntervals: Array.from({ length: 10 }, (_, i) => ({ tStart: i * 20, tEnd: i * 20 + 10 })) };
  const missing = coverage({ privacy: split, turns: [{ tStart: 0, tEnd: 10 }], durationSeconds: 190 });
  assert.equal(missing.tailShortfall, 90); assert.equal(missing.complete, false);
  const internal = coverage({ privacy: split, turns: [{ tStart: 0, tEnd: 10 }, { tStart: 180, tEnd: 190 }], durationSeconds: 190 });
  assert.equal(internal.gaps[0].gapSeconds, 80); assert.equal(internal.complete, false);
  assert.throws(() => coverage({ privacy: { publicIntervals: [{ tStart: 0, tEnd: 20 }, { tStart: 10, tEnd: 30 }] }, turns: [], durationSeconds: 30 }), /Invalid trusted/);
});
test("sealed envelope parser bounds payload, exact fields and owner without echoing payload", () => {
  const f = createPrivateRecordingFixture();
  try {
    assert.deepEqual(parseSealedCaptureInput(Buffer.from(JSON.stringify(f.sealedInput)), f.owner), f.sealedInput);
    for (const bytes of [Buffer.alloc(8193), Buffer.from("secret invalid JSON"), Buffer.from(JSON.stringify({ ...f.sealedInput, tenantId: "foreign" })),
      Buffer.from(JSON.stringify({ ...f.sealedInput, extra: "secret" }))]) assert.throws(() => parseSealedCaptureInput(bytes, f.owner), /^Error: Invalid sealed capture input$/);
  } finally { f.cleanup(); }
});
test("synchronous actual admission rejects bound but contradictory QA duration/count summaries", async () => {
  const f = createPrivateRecordingFixture(), hash = bytes => createHash("sha256").update(bytes).digest("hex");
  try {
    const ctx = await load(f.options), turns = [{ tStart: 0, tEnd: 299.899999, text: "public before" }, { tStart: 600.100001, tEnd: 900, text: "public after" }];
    const bytes = Buffer.from(JSON.stringify(turns)); writeFileSync(path.join(f.dir, "turns.json"), bytes);
    const report = clampAndValidateTurns(turns, 900).report, ledger = ctx.filterSpanTurns(turns, 0, 900).privacy;
    const privacy = { receiptSha256: ctx.receiptSha256, sanitizedAudioSha256: ctx.sanitizedAudioSha256, publicIntervals: ctx.publicIntervals };
    const proof = buildTranscriptQaGeneration({ turnsBytes: bytes, durationSec: 900, spans: [{ id: "single", accepted: true, offsetSeconds: 0, report: structuredClone(report), providerReport: structuredClone(report), privacy: ledger }], merged: structuredClone(report), privacy });
    const validation = { status: "passed", transcriptValidated: true, sourceSha256: ctx.sourceSha256, turnsSha256: hash(bytes), privacy };
    const check = qa => { const qaBytes = Buffer.from(JSON.stringify(qa)); writeFileSync(path.join(f.dir, "transcript-qa.json"), qaBytes); return admit({ ...f.options, turns, validation: { ...validation, qaSha256: hash(qaBytes) } }); };
    assert.equal(check(proof).sourceSha256, ctx.sourceSha256);
    const wrongDuration = structuredClone(proof); wrongDuration.durationSec = 901; wrongDuration.merged.durationSec = 901;
    assert.throws(() => check(wrongDuration), /generation mismatch/);
    const wrongCount = structuredClone(proof); wrongCount.merged.inputCount++; wrongCount.merged.outputCount++;
    wrongCount.spans[0].report.inputCount++; wrongCount.spans[0].report.outputCount++;
    wrongCount.spans[0].providerReport.inputCount++; wrongCount.spans[0].providerReport.outputCount++;
    wrongCount.spans[0].privacy.inputCount++; wrongCount.spans[0].privacy.outputCount++;
    assert.throws(() => check(wrongCount), /generation mismatch/);
  } finally { f.cleanup(); }
});

// T-044 + T-011: the completeness retry in transcribe-long-session.mjs calls this predicate once per attempt and per
// recursive tail span. These cases pin its behaviour across several protected windows and at a span offset.
test("completeness retry predicate across protected windows: a missed public window is incomplete, private time is not", () => {
  const privacy = { publicIntervals: [{ tStart: 0, tEnd: 100 }, { tStart: 200, tEnd: 300 }, { tStart: 400, tEnd: 600 }] };
  const t = (tStart, tEnd) => ({ tStart, tEnd });
  const full = coverage({ privacy, turns: [t(0, 100), t(200, 300), t(400, 600)], durationSeconds: 600 });
  assert.equal(full.complete, true); assert.equal(full.expectedPublicSeconds, 400);
  const middle = coverage({ privacy, turns: [t(0, 100), t(400, 600)], durationSeconds: 600 });
  assert.equal(middle.complete, false); assert.equal(middle.gaps.length, 1); assert.equal(middle.gaps[0].gapSeconds, 100);
  const last = coverage({ privacy, turns: [t(0, 100), t(200, 300)], durationSeconds: 600 });
  assert.equal(last.complete, false); assert.equal(last.tailShortfall, 200);
  assert.equal(coverage({ privacy, turns: [], durationSeconds: 600 }).complete, false);
});
test("completeness retry predicate on a recursive tail span uses the span offset and never demands private time", () => {
  const privacy = { publicIntervals: [{ tStart: 0, tEnd: 100 }, { tStart: 200, tEnd: 300 }, { tStart: 400, tEnd: 600 }] };
  // Tail span [300,600): span-local turn 100..300 is absolute 400..600, the whole last public window.
  const ok = coverage({ privacy, turns: [{ tStart: 100, tEnd: 300 }], offsetSeconds: 300, durationSeconds: 300 });
  assert.equal(ok.complete, true); assert.equal(ok.expectedPublicSeconds, 200);
  // Span [100,200) is entirely protected: nothing is expected, so the driver returns [] without a provider call.
  assert.equal(coverage({ privacy, turns: [], offsetSeconds: 100, durationSeconds: 100 }).expectedPublicSeconds, 0);
  assert.equal(coverage({ privacy, turns: [], offsetSeconds: 100, durationSeconds: 100 }).complete, true);
  // Tail span where the provider only covered the first half of the last window stays incomplete.
  const half = coverage({ privacy, turns: [{ tStart: 100, tEnd: 180 }], offsetSeconds: 300, durationSeconds: 300 });
  assert.equal(half.complete, false); assert.equal(half.tailShortfall, 120);
});
test("a turn that straddles a protected window does not count as public coverage across the window", () => {
  const privacy = { publicIntervals: [{ tStart: 0, tEnd: 100 }, { tStart: 200, tEnd: 300 }] };
  const r = coverage({ privacy, turns: [{ tStart: 90, tEnd: 210 }], durationSeconds: 300 });
  assert.equal(r.coveredPublicSeconds, 20); assert.equal(r.complete, false);
});
