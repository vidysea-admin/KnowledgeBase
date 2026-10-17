/** Actual production CLI and receipt/provider guards; only media commands and provider transport are fake. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createPrivateRecordingFixture } from "../../../qa/evidence/t048-private-capture/fixture.mjs";
import { validateSession } from "../../webinar/validate/validate-session.mjs";
import { loadWebinarSession } from "../../webinar/session-rows.mjs";
const ROOT = path.resolve(import.meta.dirname, "../../.."), SCRIPTS = path.join(ROOT, "scripts");
const dataModule = text => "data:text/javascript," + encodeURIComponent(text);
function copyClosure(root, name, seen = new Set()) {
  if (seen.has(name)) return; seen.add(name);
  const source = readFileSync(path.join(SCRIPTS, name), "utf8"), target = path.join(root, "scripts", name);
  mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(path.join(SCRIPTS, name), target);
  for (const m of source.matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s+["'](\.\.?\/[^"']+\.mjs)["']/gm)) {
    const rel = path.normalize(path.join(path.dirname(name), m[1]));
    if (!rel.startsWith("..") && existsSync(path.join(SCRIPTS, rel))) copyClosure(root, rel, seen);
  }
}
function copyTypedClosure(root, rel, seen = new Set()) {
  rel = path.normalize(rel); if (seen.has(rel) || rel.startsWith("..")) return; seen.add(rel);
  const from = path.join(ROOT, rel); if (!existsSync(from)) return;
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); copyFileSync(from, path.join(root, rel));
  for (const m of readFileSync(from, "utf8").matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s+["'](\.\.?\/[^"']+)\.js["']/gm)) copyTypedClosure(root, path.join(path.dirname(rel), `${m[1]}.ts`), seen);
}
function hookSource(f) {
  const media = `import{writeFileSync,readFileSync}from'node:fs';export function execFileSync(cmd,args){if(cmd==='ffprobe')return args.at(-1).includes('span-')?readFileSync(args.at(-1),'utf8'):'900';if(cmd==='ffmpeg'){writeFileSync(args.at(-1),args[args.indexOf('-t')+1]);return '';}throw Error('unapproved media command');}`;
  const provider = `import{appendFileSync}from'node:fs';import{createHash}from'node:crypto';
export async function uploadFile(bytes,mime,tr){appendFileSync(process.env.TRACE,JSON.stringify({sha256:createHash('sha256').update(bytes).digest('hex')})+'\\n');await tr({method:'POST',url:'https://fixture.invalid/upload'});await tr({method:'PUT',url:'https://fixture.invalid/finalize'});return{fileUri:'fixture',name:'fixture'}}
export async function pollFileState(name,tr){await tr({method:'GET',url:'https://fixture.invalid/state'});return'ACTIVE'}
export async function transcribeUploadedAudio(uri,tr,key,model,duration){await tr({method:'POST',url:'https://fixture.invalid/model:generateContent'});return{turns:[{speakerRef:'spk:0',tStart:0,tEnd:299.899999,text:'public before'},{speakerRef:'spk:0',tStart:320,tEnd:330,text:'SECRET PRIVATE'},{speakerRef:'spk:0',tStart:600.100001,tEnd:900,text:'public after'}],usage:{inputTokens:1,outputTokens:1}}}`;
  const stt = path.join(ROOT, "packages/ai/src/stt");
  return `import fs from'node:fs';import{registerHooks,syncBuiltinESMExports}from'node:module';
const originalCopy=fs.copyFileSync;fs.copyFileSync=(a,b)=>{originalCopy(a,b);if(b.endsWith('recording.m4a')){
 if(process.env.MUTATE_CAPTURE==='source'){const p=${JSON.stringify(f.sourcePath)};const row=JSON.parse(fs.readFileSync(p));row.audioPath='original.mp4';fs.writeFileSync(p,JSON.stringify(row));}
 if(process.env.MUTATE_CAPTURE==='audio')fs.writeFileSync(${JSON.stringify(f.audioPath)},'raw substituted');
 if(process.env.MUTATE_CAPTURE==='receipt'){const p=${JSON.stringify(path.join(f.recordDir, "record-consent/owned/capture.json"))};const row=JSON.parse(fs.readFileSync(p));row.privateWindows.push({tStart:650,tEnd:700});fs.writeFileSync(p,JSON.stringify(row));}
}};syncBuiltinESMExports();
registerHooks({resolve(s,c,next){
 if(s==='tsx/esm/api')return{url:${JSON.stringify(import.meta.resolve("tsx/esm/api"))},shortCircuit:true};
 if(s==='dotenv/config')return{url:${JSON.stringify(dataModule("export {};"))},shortCircuit:true};
 if(s==='undici')return{url:${JSON.stringify(dataModule("export class Agent{}export function setGlobalDispatcher(){}"))},shortCircuit:true};
 if(s==='node:child_process'&&c.parentURL?.endsWith('/transcribe-long-session.mjs'))return{url:${JSON.stringify(dataModule(media))},shortCircuit:true};
 if(s.endsWith('real-upload-transport.mjs'))return{url:${JSON.stringify(dataModule("export async function realUploadTransport(){return{status:200,headers:{},body:{}}}"))},shortCircuit:true};
 if(s.endsWith('gemini-file-upload.ts'))return{url:${JSON.stringify(dataModule(provider))},shortCircuit:true};
 for(const file of['chunk-audio.ts','transcription-plan.ts','transcript-qa.ts'])if(s.endsWith(file))return{url:new URL(file,${JSON.stringify(pathToFileURL(`${stt}${path.sep}`).href)}).href,shortCircuit:true};
 return next(s,c);
}});`;
}
function run(f, { sealed = f.sealedInput, noSeal = false, mutate = "", qa = "1" } = {}) {
  copyClosure(f.root, "transcribe-long-session.mjs");
  const typedDir = "packages/meeting-bot/src/capture/record-consent";
  mkdirSync(path.join(f.root, typedDir), { recursive: true });
  copyTypedClosure(f.root, path.join(typedDir, "provider-input.ts"));
  for (const file of ["receipt-store.ts", "context.ts", "coverage.ts"]) copyTypedClosure(f.root, path.join(typedDir, file));
  const hook = path.join(f.root, "hook.mjs"), trace = path.join(f.root, "upload-trace.jsonl"); writeFileSync(hook, hookSource(f));
  const args = ["--import", pathToFileURL(hook).href, path.join(f.root, "scripts/transcribe-long-session.mjs"), "capture", ...(noSeal ? [] : ["--capture-input-fd", "0"])];
  const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 240000, input: noSeal ? "" : JSON.stringify(sealed), cwd: ROOT,
    env: { ...process.env, NODE_PATH: [path.join(ROOT, "node_modules"), path.join(ROOT, "packages/meeting-bot/node_modules")].join(path.delimiter),
      GEMINI_API_KEY: "fixture", LKB_SINGLE_CALL_PATH: "1", GEMINI_STT_MODEL: "gemini-3.8-flash", LKB_TRANSCRIPT_QA: qa, TRACE: trace, MUTATE_CAPTURE: mutate } });
  return { result, uploads: existsSync(trace) ? readFileSync(trace, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [] };
}
test("actual child consumes sealed public bytes, excludes private turns before QA, ignores intentional silence", async () => {
  const f = createPrivateRecordingFixture();
  try {
    const { result, uploads } = run(f); assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(uploads, [{ sha256: f.sealedInput.sha256 }], "one actual mock upload of exactly sealed public input");
    const turns = readFileSync(path.join(f.dir, "turns.json"), "utf8"), proof = JSON.parse(readFileSync(path.join(f.dir, "transcript-qa.json")));
    assert.equal(JSON.parse(turns).length, 2); assert.ok(!turns.includes("SECRET PRIVATE"));
    assert.equal(proof.spans[0].providerReport.inputCount, 3); assert.equal(proof.spans[0].report.inputCount, 2);
    assert.deepEqual(proof.spans[0].privacy.excludedIndices, [1]); assert.equal(proof.privacy.receiptSha256, f.sealedInput.receiptSha256);
    const validation = await validateSession({ root: f.root, sessionId: f.owner.sessionId, durationSec: 900, env: { LKB_TRANSCRIPT_QA: "1" } });
    assert.equal(validation.report.status, "passed", JSON.stringify(validation)); assert.equal(validation.gate, "accepts");
    assert.equal(loadWebinarSession(f.dir, f.owner.sessionId).rawTurns.length, 2);
  } finally { f.cleanup(); }
});
test("actual recovery child refuses missing seal, foreign owner/raw reselection and captured QA-off with zero uploads", () => {
  for (const options of [{ noSeal: true }, { qa: "" }, { foreign: true }, { raw: true }]) {
    const f = createPrivateRecordingFixture();
    try {
      const sealed = { ...f.sealedInput, ...(options.foreign ? { tenantId: "foreign" } : {}), ...(options.raw ? { audioPath: f.original } : {}) };
      const { result, uploads } = run(f, { ...options, sealed }); assert.equal(result.status, 1, result.stderr); assert.deepEqual(uploads, []);
      const expected = options.noSeal ? /Captured transcription requires sealed parent input/ : options.foreign ? /Invalid sealed capture input/ : options.raw ? /Provider audio differs from capture binding/ : /Captured transcription requires explicit LKB_TRANSCRIPT_QA=1/;
      assert.match(result.stderr, expected, "refusal must reach the actual production guard");
      assert.equal(existsSync(path.join(f.dir, "turns.json")), false);
    } finally { f.cleanup(); }
  }
});
test("actual child source/audio/receipt mutation after snapshot makes zero provider uploads", () => {
  for (const mutate of ["source", "audio", "receipt"]) {
    const f = createPrivateRecordingFixture();
    try { const { result, uploads } = run(f, { mutate }); assert.equal(result.status, 1, result.stderr); assert.match(result.stdout, /single call failed -- falling back to chunked/, `${mutate}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /chunk provider attempts exhausted; publication refused/); assert.deepEqual(uploads, []); assert.equal(existsSync(path.join(f.dir, "turns.json")), false); }
    finally { f.cleanup(); }
  }
});
