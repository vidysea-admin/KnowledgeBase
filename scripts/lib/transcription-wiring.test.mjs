import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  SINGLE_CALL_FLAG, TRANSCRIPT_QA_FLAG, applyTranscriptQa, boundariesForPlan, flagOn, isSingleCallComplete,
  planTranscriptionPath, selectTranscriber, summariseQaReport,
} from "./transcription-wiring.mjs";
import { clampAndValidateTurns } from "../../packages/ai/src/stt/transcript-qa.ts";
import { chooseTranscriptionPath, T048_THRESHOLDS } from "../../packages/ai/src/stt/transcription-plan.ts";

const SCRIPTS = resolve(import.meta.dirname, "..");
const PKG = resolve(import.meta.dirname, "..", "..", "packages", "ai", "src", "stt");
const t = (a, b, text = "x") => ({ speakerRef: "spk:0", tStart: a, tEnd: b, text });

test("flagOn is true only for the exact string 1", () => {
  assert.equal(flagOn({ [TRANSCRIPT_QA_FLAG]: "1" }, TRANSCRIPT_QA_FLAG), true);
  for (const v of [undefined, "", "0", "true", "yes", "11", " 1"]) assert.equal(flagOn({ [SINGLE_CALL_FLAG]: v }, SINGLE_CALL_FLAG), false);
  assert.equal(flagOn(undefined, SINGLE_CALL_FLAG), false);
});

test("applyTranscriptQa disabled: same array object, no report, clamp never called", () => {
  const turns = [t(0, 500)];
  let called = 0;
  const r = applyTranscriptQa({ enabled: false, turns, durationSeconds: 10, clamp: () => { called++; } });
  assert.equal(r.turns, turns);
  assert.equal(r.report, null);
  assert.equal(called, 0);
});

test("applyTranscriptQa enabled: the recorded 223 s of turns on 186 s of audio never exceeds the audio", () => {
  const turns = Array.from({ length: 10 }, (_, i) => t(i * 22.3, (i + 1) * 22.3));
  const r = applyTranscriptQa({ enabled: true, turns, durationSeconds: 186, clamp: clampAndValidateTurns });
  assert.equal(r.report.totalTurnSec.toFixed(1), "223.0");
  assert.equal(Math.round(r.report.overshootSec), 37);
  assert.ok(r.turns.length > 0 && r.turns.length < 10);
  for (const x of r.turns) assert.ok(x.tStart >= 0 && x.tStart <= x.tEnd && x.tEnd <= 186, JSON.stringify(x));
  assert.match(summariseQaReport(r.report), /in=10 out=\d+ clamped=1 dropped=\d+ overshoot=37\.0s/);
  assert.equal(turns[9].tEnd, 10 * 22.3, "input not mutated");
});

test("applyTranscriptQa enabled: a clamp that returns an out-of-range turn, or an invalid duration, throws", () => {
  const bad = () => ({ turns: [t(0, 99)], report: { durationValid: true } });
  assert.throws(() => applyTranscriptQa({ enabled: true, turns: [], durationSeconds: 10, clamp: bad }), /outside \[0, 10\]/);
  assert.throws(() => applyTranscriptQa({ enabled: true, turns: [t(0, 1)], durationSeconds: NaN, clamp: clampAndValidateTurns }), /invalid audio duration/);
});

test("planTranscriptionPath: disabled is null; enabled follows the T-048 chooser", () => {
  const base = { enabled: true, fileBytes: 1, choose: chooseTranscriptionPath, thresholds: T048_THRESHOLDS };
  assert.equal(planTranscriptionPath({ ...base, enabled: false, durationSeconds: 100, modelId: "gemini-3.8-flash" }), null);
  const kind = (durationSeconds, modelId) => planTranscriptionPath({ ...base, durationSeconds, modelId });
  assert.equal(kind(5400, "gemini-3.8-flash").kind, "single");
  assert.equal(kind(5400.5, "gemini-3.8-flash").reason, "duration-over-limit");
  assert.equal(kind(3000, "").reason, "model-not-single-call");
  assert.equal(kind(3000, "gemini-3.5-flash").kind, "chunked");
  assert.equal(kind(null, "gemini-3.8-flash").reason, "invalid-duration");
});

test("boundariesForPlan: single -> one whole-file span, otherwise the chunked list untouched", () => {
  const chunked = [{ start: 0, end: 2400 }, { start: 2400, end: 3000 }];
  const single = chooseTranscriptionPath({ durationSeconds: 3000, modelId: "gemini-3.8-flash", thresholds: T048_THRESHOLDS });
  assert.deepEqual(boundariesForPlan(single, 3000, chunked), [{ start: 0, end: 3000 }]);
  assert.equal(boundariesForPlan(null, 3000, chunked), chunked);
  assert.equal(boundariesForPlan(single.fallback, 3000, chunked), chunked);
});

test("isSingleCallComplete: needs turns, no gaps, tail within the shortfall", () => {
  const ok = { turns: [t(0, 100)], durationSeconds: 120, gaps: [], shortfallThresholdSeconds: 45 };
  assert.equal(isSingleCallComplete(ok), true);
  assert.equal(isSingleCallComplete({ ...ok, turns: [] }), false);
  assert.equal(isSingleCallComplete({ ...ok, gaps: [{}] }), false);
  assert.equal(isSingleCallComplete({ ...ok, durationSeconds: 146 }), false);
  assert.equal(isSingleCallComplete({ ...ok, durationSeconds: 145 }), true);
});

test("selectTranscriber: no plan reproduces the existing duration rule exactly; a single plan uses the long driver", () => {
  const old = (d) => (d !== null && d > 2400 ? "transcribe-long-session.mjs" : "transcribe-toc-session.mjs");
  for (const d of [null, 0, 60, 2399, 2400, 2400.1, 2939.6, 5400, 7200]) {
    assert.equal(selectTranscriber({ durationSeconds: d, longThresholdSeconds: 2400, plan: null }), old(d), String(d));
  }
  const single = chooseTranscriptionPath({ durationSeconds: 1800, modelId: "gemini-3.8-flash", thresholds: T048_THRESHOLDS });
  assert.equal(selectTranscriber({ durationSeconds: 1800, longThresholdSeconds: 2400, plan: single }), "transcribe-long-session.mjs");
  const chunked = chooseTranscriptionPath({ durationSeconds: 1800, modelId: "", thresholds: T048_THRESHOLDS });
  assert.equal(selectTranscriber({ durationSeconds: 1800, longThresholdSeconds: 2400, plan: chunked }), "transcribe-toc-session.mjs");
});

// ---- driver CLI: fakes only (no ffmpeg/ffprobe, no network, no Mongo, no real Gemini) ----
const stubSrc = `import {writeFileSync,readFileSync,appendFileSync} from 'node:fs';
export function spawn(){throw Error('unapproved spawn')}
export function execFileSync(cmd,args){
 if(cmd==='ffmpeg'){writeFileSync(args.at(-1),String(args[args.indexOf('-t')+1]));return '';}
 if(cmd==='ffprobe'){const p=args.at(-1);return p.includes('span-')?readFileSync(p,'utf8'):process.env.MEDIA_DURATION;}
 throw Error('unapproved child');
}`;
const geminiSrc = `import {appendFileSync} from 'node:fs';
let n=0;
export async function uploadFile(){return {fileUri:'f',name:'f'}}
export async function pollFileState(){return 'ACTIVE'}
export async function transcribeUploadedAudio(uri,tr,key,model,dur){
 const calls=JSON.parse(process.env.FAKE_CALLS);const c=calls[n++];
 appendFileSync(process.env.TRACE,JSON.stringify({call:n,model:model??null,dur})+'\\n');
 if(!c)throw Error('no fake call '+n);
 if(c.error)throw Error(c.error);
 const turns=c.turns??Array.from({length:Math.round(dur/20)},(_,i)=>({speakerRef:'spk:0',tStart:i*20,tEnd:(i+1)*20,text:'turn '+i+' of call '+n}));
 return {turns,usage:{inputTokens:1,outputTokens:1}};
}`;
function hookSource() {
  const real = (f) => pathToFileURL(join(PKG, f)).href;
  const mod = (s) => "data:text/javascript," + encodeURIComponent(s);
  return `import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){
 if(s==='dotenv/config')return {url:${JSON.stringify(mod("export {};"))},shortCircuit:true};
 if(s==='tsx/esm/api')return {url:${JSON.stringify(mod("export function register(){}"))},shortCircuit:true};
 if(s==='undici')return {url:${JSON.stringify(mod("export class Agent{} export function setGlobalDispatcher(){}"))},shortCircuit:true};
 if(s==='node:child_process')return {url:${JSON.stringify(mod(stubSrc))},shortCircuit:true};
 if(s.endsWith('gemini-file-upload.ts'))return {url:${JSON.stringify(mod(geminiSrc))},shortCircuit:true};
 if(s.endsWith('chunk-audio.ts'))return {url:${JSON.stringify(real("chunk-audio.ts"))},shortCircuit:true};
 if(s.endsWith('transcript-qa.ts'))return {url:${JSON.stringify(real("transcript-qa.ts"))},shortCircuit:true};
 if(s.endsWith('transcription-plan.ts'))return {url:${JSON.stringify(real("transcription-plan.ts"))},shortCircuit:true};
 return next(s,c);
}});`;
}
function copyClosure(seed) {
  const out = new Set();
  const visit = (name) => {
    if (out.has(name)) return;
    out.add(name);
    const src = readFileSync(join(SCRIPTS, name), "utf8");
    for (const m of src.matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s+["'](\.\.?\/[^"']+\.mjs)["']/gm)) {
      const rel = join(dirname(name), m[1]).replaceAll("\\", "/");
      if (!rel.startsWith("..") && existsSync(join(SCRIPTS, rel))) visit(rel);
    }
  };
  seed.forEach(visit);
  return [...out];
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lkb-t044t048-"));
  for (const name of copyClosure(["transcribe-long-session.mjs", "lib/transcription-wiring.mjs"])) {
    mkdirSync(dirname(join(root, "scripts", name)), { recursive: true });
    copyFileSync(join(SCRIPTS, name), join(root, "scripts", name));
  }
  writeFileSync(join(root, "hook.mjs"), hookSource());
  const dir = join(root, "data", "toc-migrated", "session1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "source.json"), JSON.stringify({ _id: "source1", tenantId: "tenant2", audioPath: "fixture.m4a" }));
  writeFileSync(join(dir, "session.json"), JSON.stringify({ _id: "session1", tenantId: "tenant2" }));
  writeFileSync(join(root, "fixture.m4a"), "fixture-audio-bytes");
  const trace = join(root, "trace.jsonl");
  const run = (media, calls, env = {}) => {
    const r = spawnSync(process.execPath, ["--import", pathToFileURL(join(root, "hook.mjs")).href, join(root, "scripts", "transcribe-long-session.mjs"), "session1"], {
      encoding: "utf8", timeout: 30000,
      env: { ...process.env, LKB_TRANSCRIPT_QA: "", LKB_SINGLE_CALL_PATH: "", GEMINI_STT_MODEL: "", GEMINI_API_KEY: "fixture", MEDIA_DURATION: String(media), FAKE_CALLS: JSON.stringify(calls), TRACE: trace, ...env },
    });
    const calls_ = existsSync(trace) ? readFileSync(trace, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { r, calls: calls_ };
  };
  return { root, dir, run, turnsPath: join(dir, "turns.json") };
}
const ok = (r) => assert.equal(r.status, 0, r.stderr + r.stdout);
const drift = () => ({ turns: Array.from({ length: 10 }, (_, i) => ({ speakerRef: "spk:0", tStart: i * 22.3, tEnd: (i + 1) * 22.3, text: "drift " + i })) });

test("driver, flags off: 223 s of turns on 186 s of audio is refused exactly as before and nothing is written", () => {
  const f = fixture();
  try {
    const { r } = f.run(186, [drift(), drift(), drift()]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /timestamp outside recording/);
    assert.equal(existsSync(f.turnsPath), false);
    assert.equal(existsSync(join(f.dir, "transcript-qa.json")), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("driver, LKB_TRANSCRIPT_QA=1: the same drift is clamped, no turn ends past 186 s, report written", () => {
  const f = fixture();
  try {
    const { r, calls } = f.run(186, [drift()], { LKB_TRANSCRIPT_QA: "1" });
    ok(r);
    assert.equal(calls.length, 1);
    const turns = JSON.parse(readFileSync(f.turnsPath, "utf8"));
    assert.ok(turns.length > 0);
    for (const x of turns) assert.ok(x.tEnd <= 186 && x.tStart <= x.tEnd, JSON.stringify(x));
    assert.match(r.stdout, /transcript QA: in=\d+ out=\d+ clamped=1/);
    const rep = JSON.parse(readFileSync(join(f.dir, "transcript-qa.json"), "utf8"));
    assert.equal(rep.spans.length, 1);
    assert.equal(Math.round(rep.spans[0].report.overshootSec), 37);
    assert.equal(rep.spans[0].report.durationSec, 186);
    assert.ok(rep.merged.outputCount > 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("driver, flags off: output is identical with or without the new code paths (chunked 3600 s, 2 calls)", () => {
  const a = fixture(), b = fixture();
  try {
    const ra = a.run(3600, [{}, {}]);
    ok(ra.r);
    assert.equal(ra.calls.length, 2);
    // QA on over data that does not overshoot must also leave the turns untouched.
    const rb = b.run(3600, [{}, {}], { LKB_TRANSCRIPT_QA: "1" });
    ok(rb.r);
    const strip = (p) => JSON.parse(readFileSync(p, "utf8")).map(({ _id, ...rest }) => rest);
    assert.deepEqual(strip(b.turnsPath), strip(a.turnsPath));
    assert.doesNotMatch(ra.r.stdout, /single-call plan|transcript QA/);
  } finally { rmSync(a.root, { recursive: true, force: true }); rmSync(b.root, { recursive: true, force: true }); }
});

test("driver, LKB_SINGLE_CALL_PATH=1 + gemini-3.8-flash on 3600 s: exactly one provider call, whole-file span", () => {
  const f = fixture();
  try {
    const { r, calls } = f.run(3600, [{}], { LKB_SINGLE_CALL_PATH: "1", GEMINI_STT_MODEL: "gemini-3.8-flash" });
    ok(r);
    assert.match(r.stdout, /single-call plan: single/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, "gemini-3.8-flash");
    assert.equal(calls[0].dur, 3600);
    assert.equal(JSON.parse(readFileSync(f.turnsPath, "utf8")).length, 180);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("driver, single call fails: falls back to the chunked plan (1 failed + 2 chunk calls)", () => {
  const f = fixture();
  try {
    const { r, calls } = f.run(3600, [{ error: "provider 500" }, {}, {}], { LKB_SINGLE_CALL_PATH: "1", GEMINI_STT_MODEL: "gemini-3.8-flash" });
    ok(r);
    assert.match(r.stdout, /single call failed \(provider 500\) -- falling back to chunked/);
    assert.deepEqual(calls.map((c) => c.dur), [3600, 2400, 1200]);
    assert.equal(JSON.parse(readFileSync(f.turnsPath, "utf8")).length, 180);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("driver, single call returns an incomplete transcript on every attempt: falls back to chunks", () => {
  const f = fixture();
  try {
    const short = { turns: [{ speakerRef: "spk:0", tStart: 0, tEnd: 600, text: "stops early" }] };
    // 3 attempts at depth 0 + 9 more across the 3 recursive tail splits (all empty), then the 2 chunked-fallback calls.
    const empty = { turns: [] };
    const { r } = f.run(3600, [short, short, short, ...Array(9).fill(empty), {}, {}], { LKB_SINGLE_CALL_PATH: "1", GEMINI_STT_MODEL: "gemini-3.8-flash" });
    ok(r);
    assert.match(r.stdout, /single call incomplete/);
    assert.match(r.stdout, /chunked fallback: 2 chunk\(s\)/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("driver, LKB_SINGLE_CALL_PATH=1 but model unset or over 90 min: chunked exactly as today", () => {
  for (const [media, env, chunks] of [[3600, {}, 2], [6000, { GEMINI_STT_MODEL: "gemini-3.8-flash" }, 3]]) {
    const f = fixture();
    try {
      const { r, calls } = f.run(media, [{}, {}, {}], { LKB_SINGLE_CALL_PATH: "1", ...env });
      ok(r);
      assert.match(r.stdout, /single-call plan: chunked/);
      assert.equal(calls.length, chunks);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});
