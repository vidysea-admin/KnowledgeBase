import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const SCRIPTS='C:/Users/product/Desktop/KnowledgeBase/scripts';
const PKG='C:/Users/product/Desktop/KnowledgeBase/packages/ai/src/stt';
const {evaluateTranscriptQaGeneration}=await import(pathToFileURL(join(SCRIPTS,'webinar/validate/transcript-qa-binding.mjs')));
const {clampAndValidateTurns}=await import(pathToFileURL(join(PKG,'transcript-qa.ts')));

const stubSrc = `import {writeFileSync,readFileSync,appendFileSync} from 'node:fs';
export function spawn(){throw Error('unapproved spawn')}
export function execFileSync(cmd,args){
 if(cmd==='ffmpeg'){writeFileSync(args.at(-1),String(args[args.indexOf('-t')+1]));return '';}
 if(cmd==='ffprobe'){const p=args.at(-1);return p.includes('span-')?readFileSync(p,'utf8'):process.env.MEDIA_DURATION;}
 throw Error('unapproved child');
}`;
const geminiSrc = `import {appendFileSync,writeFileSync} from 'node:fs';
let n=0;
export async function uploadFile(bytes,mime,tr){await tr({method:'POST',url:'fixture:upload'});await tr({method:'PUT',url:'fixture:finalize'});return {fileUri:'f',name:'f'}}
export async function pollFileState(name,tr){await tr({method:'GET',url:'fixture:poll'});return 'ACTIVE'}
export async function transcribeUploadedAudio(uri,tr,key,model,dur){
 await tr({method:'POST',url:'fixture:model:generateContent'});const calls=JSON.parse(process.env.FAKE_CALLS);const c=calls[n++];
 appendFileSync(process.env.TRACE,JSON.stringify({call:n,model:model??null,dur})+'\\n');
 if(!c)throw Error('no fake call '+n);
 if(c.error)throw Error(c.error);
 if(process.env.MUTATE_AUDIO==='1')writeFileSync(process.env.AUDIO_FIXTURE_PATH,'changed-audio');
 const turns=c.turns??Array.from({length:Math.round(dur/20)},(_,i)=>({speakerRef:'spk:0',tStart:i*20,tEnd:(i+1)*20,text:'turn '+i+' of call '+n}));
 return {turns,usage:{inputTokens:1,outputTokens:1}};
}`;
function hookSource() {
  const real = (f) => pathToFileURL(join(PKG, f)).href;
  const mod = (s) => "data:text/javascript," + encodeURIComponent(s);
  return `import {registerHooks,syncBuiltinESMExports} from 'node:module';
import fs from 'node:fs';
const rename=fs.renameSync;
fs.renameSync=(a,b)=>{if(process.env.FAIL_QA_PUBLICATION==='1'&&b.endsWith('transcript-qa.json'))throw Error('fixture QA publication failure');return rename(a,b)};
syncBuiltinESMExports();
registerHooks({resolve(s,c,next){
 if(s.endsWith('real-upload-transport.mjs'))return {url:'data:text/javascript,export%20async%20function%20realUploadTransport()%7Breturn%20%7Bstatus%3A200%7D%7D',shortCircuit:true};
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
      env: { ...process.env, LKB_TRANSCRIPT_QA: "", LKB_SINGLE_CALL_PATH: "", GEMINI_STT_MODEL: "", GEMINI_API_KEY: "fixture", FAIL_QA_PUBLICATION: "", MUTATE_AUDIO: "", MEDIA_DURATION: String(media), FAKE_CALLS: JSON.stringify(calls), TRACE: trace, AUDIO_FIXTURE_PATH: join(root, "fixture.m4a"), ...env },
    });
    const calls_ = existsSync(trace) ? readFileSync(trace, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { r, calls: calls_ };
  };
  return { root, dir, run, turnsPath: join(dir, "turns.json") };
}

const outcomes=[];
for(const failed of [false,true]){
 const f=fixture();
 try{
  const calls=failed?[{error:'fixture-private-provider-secret'}, {}, {}]:[{}];
  const {r}=f.run(3600,calls,{LKB_SINGLE_CALL_PATH:'1',GEMINI_STT_MODEL:'gemini-3.8-flash',LKB_TRANSCRIPT_QA:'1'});
  assert.equal(r.status,0,r.stderr+r.stdout);
  const proof=JSON.parse(readFileSync(join(f.dir,'transcription-path.json')));
  const n=failed?3:1;
  assert.deepEqual(proof.protocolRequests,{upload:n*2,poll:n,generate:n});
  assert.equal(proof.singleAttempts,1);
  assert.equal(proof.actualPath,failed?'chunked':'single');
  assert.equal(JSON.stringify(proof).includes('fixture-private-provider-secret'),false);
  const bytes=readFileSync(f.turnsPath),turns=JSON.parse(bytes),qa=JSON.parse(readFileSync(join(f.dir,'transcript-qa.json')));
  assert.deepEqual(evaluateTranscriptQaGeneration({proof:qa,turnsBytes:bytes,turns,durationSec:3600,clamp:clampAndValidateTurns}).reasons,[]);
  const changed=Buffer.from(bytes.toString().replace('turn 0','independent changed 0'));
  assert.match(evaluateTranscriptQaGeneration({proof:qa,turnsBytes:changed,turns:JSON.parse(changed),durationSec:3600,clamp:clampAndValidateTurns}).reasons.join(';'),/hash mismatch/);
  outcomes.push({path:proof.actualPath,protocolRequests:proof.protocolRequests,turns:turns.length,consumer:'accepted exact bytes; refused changed same-count text'});
 }finally{rmSync(f.root,{recursive:true,force:true})}
}
console.log(JSON.stringify({pass:2,fail:0,network:false,outcomes},null,2));

