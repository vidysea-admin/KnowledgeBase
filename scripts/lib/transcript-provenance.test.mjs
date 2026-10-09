import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { immutableTranscriptTurns, writeTranscriptGeneration, bindDerivedArtifacts, assertDerivedArtifactsCurrent,
  requireWorkDatabase, assertTranscriptReplacementSafe } from "./transcript-provenance.mjs";
const turn = (text = "A supported fact") => ({speakerRef: "spk:0", tStart: 1, tEnd: 3, text});
const put = (dir, name, value) => writeFileSync(join(dir, name), JSON.stringify(value));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "lkb-provenance-"));
  put(dir, "source.json", {_id: "source1", tenantId: "tenant2"});
  put(dir, "session.json", {_id: "session1", tenantId: "tenant2"});
  return dir;
}
function generated(dir, turns) {
  const evidence = [{sessionId: "session1", turnId: turns[0]._id}];
  put(dir, "claims.json", [{_id: "c1", tenantId: "tenant2", text: turns[0].text, evidence}]);
  put(dir, "session_page.json", {_id: "page1", sessionId: "session1", tenantId: "tenant2", summary: turns[0].text, evidence});
}
test("immutable turn identities change with evidence and ownership, retain repeated tuples and rerun identity", () => {
  const a = immutableTranscriptTurns("tenant2", "session1", [turn(), turn()]);
  assert.notEqual(a[0]._id, a[1]._id);
  assert.deepEqual(a, immutableTranscriptTurns("tenant2", "session1", [turn(), turn()]));
  for (const changed of [{...turn(), text: "New meaning"}, {...turn(), tStart: 2}, {...turn(), speakerRef: "spk:1"}])
    assert.notEqual(a[0]._id, immutableTranscriptTurns("tenant2", "session1", [changed])[0]._id);
  assert.notEqual(a[0]._id, immutableTranscriptTurns("other", "session1", [turn()])[0]._id);
  assert.notEqual(a[0]._id, immutableTranscriptTurns("tenant2", "other", [turn()])[0]._id);
  assert.equal(a[0]._id, immutableTranscriptTurns("tenant2", "session1", [turn("Inserted"), turn()])[1]._id);
  for (const bad of [{...turn(), tEnd: 0}, {...turn(), tStart: NaN}, {...turn(), text: ""}])
    assert.throws(() => immutableTranscriptTurns("tenant2", "session1", [bad]), /invalid transcript/);
});
test("transcript replacement archives exact original bytes and leaves old derived artifacts stale", () => {
  const dir = fixture();
  try {
    const old = [{...turn("Old fact"), _id: "session1-t001", tenantId: "tenant2", sessionId: "session1"}];
    put(dir, "turns.json", old); generated(dir, old); bindDerivedArtifacts(dir);
    const original = readFileSync(join(dir, "turns.json")), claimBytes = readFileSync(join(dir, "claims.json"));
    const next = writeTranscriptGeneration(dir, "tenant2", "session1", [turn("New fact")]);
    assert.notEqual(next[0]._id, old[0]._id);
    const name = `${createHash("sha256").update(original).digest("hex")}.json`;
    assert.deepEqual(readFileSync(join(dir, ".transcript-history", name)), original);
    assert.deepEqual(readFileSync(join(dir, "claims.json")), claimBytes);
    assert.throws(() => assertDerivedArtifactsCurrent(dir), /derived evidence|provenance stale/);
    assert.deepEqual(writeTranscriptGeneration(dir, "tenant2", "session1", [turn("New fact")]), next);
    assert.equal(readdirSync(join(dir, ".transcript-history")).length, 1);
    generated(dir, next); bindDerivedArtifacts(dir); assert.equal(assertDerivedArtifactsCurrent(dir).tenantId, "tenant2");
  } finally {rmSync(dir, {recursive: true, force: true});}
});
test("unknown historical provenance and same-ID semantic changes refuse, including structurally valid citations", () => {
  const dir = fixture();
  try {
    const rows = [{...turn(), _id: "session1-t001", tenantId: "tenant2", sessionId: "session1"}];
    put(dir, "turns.json", rows); generated(dir, rows);
    assert.throws(() => assertDerivedArtifactsCurrent(dir), /provenance absent/);
    bindDerivedArtifacts(dir); put(dir, "turns.json", [{...rows[0], text: "Unrelated replacement"}]);
    assert.throws(() => assertDerivedArtifactsCurrent(dir), /provenance stale/);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
test("failure before stale marker preserves originals and failure after marker blocks knowledge reuse", () => {
  for (const failAt of [2, 3]) {
    const dir = fixture();
    try {
      const old = writeTranscriptGeneration(dir, "tenant2", "session1", [turn()]); generated(dir, old); bindDerivedArtifacts(dir);
      const original = readFileSync(join(dir, "turns.json")); let writes = 0;
      const fail = (path, value) => {if (++writes === failAt) throw new Error("fixture write failure"); writeFileSync(path, value);};
      assert.throws(() => writeTranscriptGeneration(dir, "tenant2", "session1", [turn("Changed")], fail), /fixture write failure/);
      assert.deepEqual(readFileSync(join(dir, "turns.json")), original);
      if (failAt === 2) assert.equal(assertDerivedArtifactsCurrent(dir).status, "current");
      else assert.throws(() => assertDerivedArtifactsCurrent(dir), /provenance stale/);
      assert.deepEqual(readFileSync(join(dir, ".transcript-history", readdirSync(join(dir, ".transcript-history"))[0])), original);
    } finally {rmSync(dir, {recursive: true, force: true});}
  }
});
test("work database refuses missing, production and conflicting targets without defaults", () => {
  const base = {MONGODB_URL: "mongodb://fixture.invalid", MONGO_WORK_DB: "lkb_work_fixture"};
  assert.deepEqual(requireWorkDatabase(base), {url: base.MONGODB_URL, dbName: base.MONGO_WORK_DB});
  for (const env of [{}, {...base, MONGO_WORK_DB: "lkb"}, {...base, MONGO_WORK_DB: "LKB"},
    {...base, MONGO_WORK_DB: "global_university_db"}, {...base, MONGODB_DB: "lkb"}, {...base, MONGODB_URL: undefined}])
    assert.throws(() => requireWorkDatabase(env), /isolated work database/);
});
test("live-sync preflight refuses changed transcript with derived knowledge before writes", async () => {
  const current = immutableTranscriptTurns("tenant2", "session1", [turn()]); let reads = 0;
  const db = {turns: tenant => {assert.equal(tenant, "tenant2"); return {find: () => ({toArray: async () => current})};},
    claims: () => ({findOne: async () => {reads++; return {_id: "c1"};}}), sessionPages: () => ({findOne: async () => null})};
  await assertTranscriptReplacementSafe(db, "tenant2", "session1", current); assert.equal(reads, 0);
  await assert.rejects(() => assertTranscriptReplacementSafe(db, "tenant2", "session1", [{...current[0], text: "Changed"}]), /existing derived knowledge/);
  db.claims = () => ({findOne: async () => null});
  await assertTranscriptReplacementSafe(db, "tenant2", "session1", [{...current[0], text: "Changed"}]);
});
test("real seed dry-run rejects unbound corpus before any database connection", () => {
  const script = resolve(import.meta.dirname, "../seed-toc.mjs");
  const r = spawnSync(process.execPath, [script, "--dry-run", "--sessions", "2026-05-22-uniaccess-xavier-university"],
    {encoding: "utf8", timeout: 20000, env: {...process.env, MONGODB_URL: "mongodb://127.0.0.1:1", MONGO_WORK_DB: ""}});
  assert.equal(r.status, 1); assert.match(r.stderr, /derived provenance absent/);
  assert.ok(!r.stdout.includes("Connecting to Mongo"));
});

import { copyFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { buildSessionFiles } from "../webinar/session-rows.mjs";
import { processVideo, validateTurns } from "../webinar/process-video.mjs";
import { buildAutoSessionSkeleton } from "../watch/lib/session-skeleton.mjs";
const NODE_HOOK = `import {registerHooks} from 'node:module';
const moduleURL = text => 'data:text/javascript,' + encodeURIComponent(text);
registerHooks({resolve(specifier,context,next){
 if (specifier==='dotenv/config') return {url:moduleURL('export {};'),shortCircuit:true};
 if (specifier==='tsx/esm/api') return {url:moduleURL('export function register() {}'),shortCircuit:true};
 if (specifier==='undici') return {url:moduleURL('export class Agent {} export function setGlobalDispatcher() {}'),shortCircuit:true};
 if (specifier==='node:child_process') return {url:moduleURL("import {writeFileSync} from 'node:fs';export function spawn(){throw Error('unapproved spawn')} export function execFileSync(cmd,args){if(cmd==='ffprobe')return '60';if(cmd==='ffmpeg'){writeFileSync(args.at(-1),'fixture');return ''; }throw Error('unapproved child');}"),shortCircuit:true};
 if (specifier.endsWith('gemini-file-upload.ts')) return {url:moduleURL("export async function uploadFile(){return {fileUri:'fixture',name:'fixture'}};export async function pollFileState(){return 'ACTIVE'};export async function transcribeUploadedAudio(){return {turns:[{speakerRef:'spk:0',tStart:0,tEnd:60,text:'Fresh exact transcript'}],usage:{inputTokens:0,outputTokens:0}}}"),shortCircuit:true};
 if (specifier.endsWith('chunk-audio.ts')) return {url:moduleURL("export function computeChunkBoundaries(){return [{start:0,end:60}]}export function mergeChunkedTurns(rows){return rows.flatMap(r=>r.turns)}export function findTimeGaps(){return []}"),shortCircuit:true};
 if (specifier.endsWith('/db/src/client.js')) return {url:moduleURL("import {appendFileSync} from 'node:fs';export async function connect(url,db){appendFileSync(process.env.PROVENANCE_TRACE,JSON.stringify({connect:true,url,db})+'\\\\n')}export async function close(){}"),shortCircuit:true};
 if (specifier.includes('/db/src/collections/')) {
  const name=specifier.split('/').at(-1).replace('.js',''), exported=name==='session-pages'?'sessionPages':name;
  return {url:moduleURL("import {appendFileSync} from 'node:fs'; const mark=(kind,tenant)=>appendFileSync(process.env.PROVENANCE_TRACE,JSON.stringify({kind,tenant})+'\\\\n');export const "+exported+"=tenant=>({find:()=>({toArray:async()=>JSON.parse(process.env.PROVENANCE_EXISTING||'[]')}),findOne:async()=>process.env.PROVENANCE_DERIVED==='1'?{_id:'old'}:null,countDocuments:async()=>0,deleteMany:async()=>{mark('delete',tenant);return {deletedCount:0}},insertOne:async()=>{mark('insert',tenant);return {}}});"),shortCircuit:true};
 }
 return next(specifier,context);
}});`;
function cliFixture(scriptName, hook = NODE_HOOK) {
  const root = mkdtempSync(join(tmpdir(), "lkb-provenance-cli-")), scripts = join(root, "scripts");
  mkdirSync(join(scripts, "lib"), {recursive: true}); mkdirSync(join(scripts, "webinar"), {recursive: true});
  for (const name of [scriptName, "lib/transcript-provenance.mjs", "lib/find-audio-file.mjs", "lib/real-upload-transport.mjs", "webinar/session-rows.mjs", "webinar/process-video.mjs"])
    copyFileSync(resolve(import.meta.dirname, "..", name), join(scripts, name));
  writeFileSync(join(root, "hook.mjs"), hook);
  const dir = join(root, "data", "toc-migrated", "session1"); mkdirSync(dir, {recursive: true});
  put(dir, "source.json", {_id: "source1", tenantId: "tenant2", audioPath: "fixture.m4a"});
  put(dir, "session.json", {_id: "session1", tenantId: "tenant2"}); writeFileSync(join(root, "fixture.m4a"), "fixture");
  const trace = join(root, "trace.jsonl");
  const run = (args = [], env = {}) => spawnSync(process.execPath, ["--import", pathToFileURL(join(root, "hook.mjs")).href, join(scripts, scriptName), ...args],
    {encoding: "utf8", timeout: 20000, env: {...process.env, GEMINI_API_KEY: "fixture-no-network", MONGODB_URL: "mongodb://fixture.invalid", MONGODB_DB: "lkb_work_fixture", MONGO_WORK_DB: "lkb_work_fixture", PROVENANCE_TRACE: trace, ...env}});
  return {root, dir, trace, run};
}

const SHORT_CAPTURE = "[00:00] spk:0: VDC controlled test. This generated voice is for an authorized private test. [00:08] The video shows a changing pattern and a frame counter. Test number one.";
const durationChildSource = `import {writeFileSync,appendFileSync} from 'node:fs';
const mark=row=>appendFileSync(process.env.PROVENANCE_TRACE,JSON.stringify(row)+'\\n');
export function spawn(){throw Error('unapproved spawn')}
export function execFileSync(cmd,args,opts){
 if(cmd==='ffprobe'){const span=args.at(-1).includes('span-');mark({kind:'probe',span,timeout:opts.timeout});return span?process.env.SPAN_DURATION:process.env.MEDIA_DURATION;}
 if(cmd==='ffmpeg'){writeFileSync(args.at(-1),'fixture');return '';}
 throw Error('unapproved child');
}`;
const durationTransportSource = `import {appendFileSync} from 'node:fs';
export async function realUploadTransport(req){
 appendFileSync(process.env.PROVENANCE_TRACE,JSON.stringify({kind:'provider',method:req.method})+'\\n');
 if(req.url.includes('generateContent'))return {status:200,headers:{},body:{candidates:[{content:{parts:[{text:process.env.CAPTURED_TRANSCRIPT}]},finishReason:'STOP'}]}};
 if(req.method==='PUT')return {status:200,headers:{},body:{file:{uri:'files/fixture',name:'files/fixture'}}};
 if(req.method==='GET')return {status:200,headers:{},body:{state:'ACTIVE'}};
 return {status:200,headers:{'x-goog-upload-url':'https://fixture.invalid/upload'}};
}`;
const DURATION_HOOK = NODE_HOOK
  .replace(/ if \(specifier==='node:child_process'\).*\n/, ` if (specifier==='node:child_process') return {url:moduleURL(${JSON.stringify(durationChildSource)}),shortCircuit:true};\n`)
  .replace(/ if \(specifier.endsWith\('gemini-file-upload.ts'\)\).*\n/, ` if (specifier.endsWith('gemini-file-upload.ts')) return {url:${JSON.stringify(new URL('../../packages/ai/src/stt/gemini-file-upload.ts', import.meta.url).href)},shortCircuit:true};\n`)
  .replace(/ if \(specifier.endsWith\('chunk-audio.ts'\)\).*\n/, ` if (specifier.endsWith('chunk-audio.ts')) return {url:${JSON.stringify(new URL('../../packages/ai/src/stt/chunk-audio.ts', import.meta.url).href)},shortCircuit:true};\n`)
  .replace(" if (specifier==='undici')", ` if (specifier.endsWith('/real-upload-transport.mjs')) return {url:moduleURL(${JSON.stringify(durationTransportSource)}),shortCircuit:true};\n if (specifier==='undici')`);

test("duration-bound actual long-session CLI probes original and extracted media and preserves provenance", () => {
  for (const spanDuration of [15, 12.650958, 17]) {
    const f = cliFixture('transcribe-long-session.mjs', DURATION_HOOK);
    try {
      const old = writeTranscriptGeneration(f.dir, 'tenant2', 'session1', [turn('Old cited fact')]);
      generated(f.dir, old); bindDerivedArtifacts(f.dir);
      const before = readFileSync(join(f.dir, 'turns.json'));
      const r = f.run(['session1'], {MEDIA_DURATION:'15',SPAN_DURATION:String(spanDuration),CAPTURED_TRANSCRIPT:SHORT_CAPTURE});
      assert.equal(r.status, 0, r.stderr);
      const next = JSON.parse(readFileSync(join(f.dir, 'turns.json')));
      assert.equal(next[0].tEnd, Math.min(15, spanDuration));
      assert.equal(next[0].speakerRef, 'spk:0'); assert.equal(next[0].text, SHORT_CAPTURE.slice('[00:00] spk:0: '.length));
      validateTurns(next, 15, {tenantId:'tenant2',sessionId:'session1'});
      assert.deepEqual(next, immutableTranscriptTurns('tenant2','session1',next));
      assert.deepEqual(readFileSync(join(f.dir,'.transcript-history',createHash('sha256').update(before).digest('hex')+'.json')),before);
      assert.equal(JSON.parse(readFileSync(join(f.dir,'derivation-provenance.json'))).status,'stale');
      const trace=readFileSync(f.trace,'utf8').trim().split('\n').map(JSON.parse);
      assert.deepEqual(trace.filter(x=>x.kind==='probe').map(x=>[x.span,x.timeout]),[[false,15000],[true,15000]]);
      assert.equal(trace.filter(x=>x.kind==='provider').length,4);
    } finally {rmSync(f.root,{recursive:true,force:true});}
  }
});

test("duration-bound CLI refuses invalid original or span probes and late starts without transcript writes", () => {
  const invalid = ['NaN','Infinity','0','-1'];
  const cases = [...invalid.map(value=>({MEDIA_DURATION:value,SPAN_DURATION:'15'})),
    ...invalid.map(value=>({MEDIA_DURATION:'15',SPAN_DURATION:value})),
    ...[15,16].map(start=>({MEDIA_DURATION:'15',SPAN_DURATION:'15',CAPTURED_TRANSCRIPT:`[00:${start}] spk:0: late`}))];
  for (const values of cases) {
    const f=cliFixture('transcribe-long-session.mjs',DURATION_HOOK);
    try {
      const old=writeTranscriptGeneration(f.dir,'tenant2','session1',[turn()]); generated(f.dir,old);bindDerivedArtifacts(f.dir);
      const before=readFileSync(join(f.dir,'turns.json'));
      const r=f.run(['session1'],{CAPTURED_TRANSCRIPT:SHORT_CAPTURE,...values});
      assert.equal(r.status,1,r.stderr);
      assert.deepEqual(readFileSync(join(f.dir,'turns.json')),before);
      assert.equal(assertDerivedArtifactsCurrent(f.dir).status,'current');
      const trace=readFileSync(f.trace,'utf8').trim().split('\n').map(JSON.parse);
      if(!values.CAPTURED_TRANSCRIPT)assert.equal(trace.filter(x=>x.kind==='provider').length,0);
    } finally {rmSync(f.root,{recursive:true,force:true});}
  }
});
test("both actual transcription CLIs invalidate prior derivations and preserve original bytes on stubbed provider path", () => {
  for (const script of ["transcribe-toc-session.mjs", "transcribe-long-session.mjs"]) {
    const f = cliFixture(script);
    try {
      const old = [{...turn("Old cited fact"), _id: "session1-t001", tenantId: "tenant2", sessionId: "session1"}];
      put(f.dir, "turns.json", old); generated(f.dir, old); bindDerivedArtifacts(f.dir);
      const before = readFileSync(join(f.dir, "turns.json")), r = f.run(["session1"]);
      assert.equal(r.status, 0, r.stderr); const next = JSON.parse(readFileSync(join(f.dir, "turns.json")));
      assert.equal(next[0].tenantId, "tenant2"); assert.notEqual(next[0]._id, old[0]._id);
      assert.equal(next[0].text, "Fresh exact transcript"); assert.equal(JSON.parse(readFileSync(join(f.dir, "derivation-provenance.json"))).status, "stale");
      assert.deepEqual(readFileSync(join(f.dir, ".transcript-history", readdirSync(join(f.dir, ".transcript-history"))[0])), before);
    } finally {rmSync(f.root, {recursive: true, force: true});}
  }
});
test("actual seed CLI imports only bound fresh artifacts into explicit source-owned work target", () => {
  const f = cliFixture("seed-toc.mjs");
  try {
    const current = writeTranscriptGeneration(f.dir, "tenant2", "session1", [turn()]); generated(f.dir, current); bindDerivedArtifacts(f.dir);
    const dry = f.run(["--dry-run", "--sessions", "session1"]); assert.equal(dry.status, 0, dry.stderr); assert.equal(readdirSync(f.root).includes("trace.jsonl"), false);
    const refuse = f.run(["--sessions", "session1"], {MONGO_WORK_DB: "lkb"}); assert.equal(refuse.status, 1); assert.match(refuse.stderr, /production writes refused/);
    assert.equal(readdirSync(f.root).includes("trace.jsonl"), false);
    const live = f.run(["--sessions", "session1"]); assert.equal(live.status, 0, live.stderr);
    const calls = readFileSync(f.trace, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(calls[0].db, "lkb_work_fixture"); assert.ok(calls.slice(1).every(c => c.tenant === "tenant2"));
  } finally {rmSync(f.root, {recursive: true, force: true});}
});
test("actual live sync CLI refuses changed derived transcript before its first delete or insert", () => {
  const f = cliFixture("sync-real-turns.mjs");
  try {
    const old = [{...turn(), _id: "session1-t001", tenantId: "tenant2", sessionId: "session1"}];
    put(f.dir, "turns.json", [{...old[0], text: "Changed text reuses old ID"}]);
    const r = f.run([], {PROVENANCE_EXISTING: JSON.stringify(old), PROVENANCE_DERIVED: "1"});
    assert.equal(r.status, 1); assert.match(r.stderr, /existing derived knowledge/);
    const calls = readFileSync(f.trace, "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(calls.map(c => c.connect ? "connect" : c.kind), ["connect"]);
  } finally {rmSync(f.root, {recursive: true, force: true});}
});
test("real watcher and webinar file generators bind only their fresh current-turn artifacts", () => {
  for (const generator of ["watcher", "webinar"]) {
    const dir = fixture();
    try {
      const turns = writeTranscriptGeneration(dir, "tenant2", "session1", [turn()]);
      const f = generator === "watcher" ? buildAutoSessionSkeleton({sessionId: "session1", tenantId: "tenant2", title: "Current", date: "2026-10-09", driveFileId: "fixture", audioPath: "fixture.m4a", turns}) :
        buildSessionFiles({sessionId: "session1", tenantId: "tenant2", sessionDoc: {sourceId: "source1", title: "Current", date: "2026-10-09", status: {index: "pending", transcribe: "done"}}, meta: {title: "Current", date: "2026-10-09", hostOrg: "Fixture", orgs: [], people: [], capturedBy: {via: "fixture"}}, turns});
      if (f.source) put(dir, "source.json", f.source);
      put(dir, "session.json", f.session); put(dir, "session_page.json", f.sessionPage); put(dir, "claims.json", f.claims);
      bindDerivedArtifacts(dir); assert.equal(assertDerivedArtifactsCurrent(dir).sessionId, "session1");
    } finally {rmSync(dir, {recursive: true, force: true});}
  }
});

test("validated snapshot consumes exact hashed bytes despite concurrent disk replacement", () => {
  const dir = fixture();
  try {
    const current = writeTranscriptGeneration(dir, "tenant2", "session1", [turn()]); generated(dir, current); bindDerivedArtifacts(dir);
    let changed = false;
    const read = path => {
      const value = readFileSync(path);
      if (path.endsWith("claims.json") && !changed) {changed = true; put(dir, "turns.json", [{...current[0], text: "Concurrent new meaning"}]);}
      return value;
    };
    const snapshot = assertDerivedArtifactsCurrent(dir, read);
    assert.equal(changed, true); assert.equal(snapshot.documents.turns[0].text, current[0].text);
    assert.equal(snapshot.documents.claims[0].text, current[0].text);
    assert.notEqual(JSON.parse(readFileSync(join(dir, "turns.json")))[0].text, snapshot.documents.turns[0].text);
    assert.throws(() => assertDerivedArtifactsCurrent(dir), /provenance stale/);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
test("explicit strict combined generation includes screen turns and refuses changed or removed screen artifacts", async () => {
  const root = mkdtempSync(join(tmpdir(), "lkb-screen-provenance-")), dir = join(root, "data", "toc-migrated", "session1");
  mkdirSync(dir, {recursive: true});
  try {
    put(dir, "source.json", {_id: "source1", tenantId: "tenant2", title: "Current", createdAt: "2026-10-09T00:00:00Z", captureMode: "provided"});
    put(dir, "session.json", {_id: "session1", tenantId: "tenant2"});
    const turns = writeTranscriptGeneration(dir, "tenant2", "session1", [turn()]);
    writeFileSync(join(root, "recording.webm"), "media");
    await processVideo({root, sessionId: "session1", tenantId: "tenant2", recording: "recording.webm",
      command: async (cmd, args) => {if (cmd === "ffprobe") return {stdout: JSON.stringify({format: {duration: 3}, streams: [{codec_type: "video"}]})};
        const out = args.at(-1); writeFileSync(join(out.slice(0, Math.max(out.lastIndexOf("/"), out.lastIndexOf("\\"))), "frame-000001.jpg"), "pixels"); return {stderr: "n:0 pts_time:2"};},
      vision: async () => ({readable: true, ocrText: "Exact slide evidence", visualDescription: ""})});
    const combined = JSON.parse(readFileSync(join(dir, "knowledge-turns.json"))), screen = combined.find(t => t.speakerRef === "screen");
    put(dir, "claims.json", []); put(dir, "session_page.json", {tenantId: "tenant2", sessionId: "session1", evidence: [{sessionId: "session1", turnId: screen._id}]});
    assert.throws(() => bindDerivedArtifacts(dir), /invalid derived evidence/);
    bindDerivedArtifacts(dir, {turnArtifact: "knowledge-turns.json"});
    const snapshot = assertDerivedArtifactsCurrent(dir); assert.equal(snapshot.documents.turns.length, combined.length);
    assert.ok(snapshot.documents.turns.some(t => t._id === screen._id));
    const evidence = JSON.parse(readFileSync(join(dir, "screen-evidence.json"))), frame = join(dir, evidence.frames[0].file), original = readFileSync(frame);
    writeFileSync(frame, "wrong pixels"); assert.throws(() => assertDerivedArtifactsCurrent(dir), /frame byte hash mismatch/); writeFileSync(frame, original);
    put(dir, "meta.json", {tenantId: "tenant2", title: "Current", t0: "2026-10-09T00:00:00Z", date: "2026-10-09", people: [], orgs: []});
    bindDerivedArtifacts(dir, {turnArtifact: "knowledge-turns.json"}); rmSync(join(dir, "meta.json"));
    assert.throws(() => assertDerivedArtifactsCurrent(dir), /provenance stale/);
    // Raw selection does not adopt an unrelated leftover combined artifact.
    generated(dir, turns); bindDerivedArtifacts(dir); put(dir, "knowledge-turns.json", []);
    assert.equal(assertDerivedArtifactsCurrent(dir).documents.turns.length, turns.length);
  } finally {rmSync(root, {recursive: true, force: true});}
});
