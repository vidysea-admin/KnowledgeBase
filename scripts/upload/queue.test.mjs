import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, link } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import 'dotenv/config';
import { operation, connectQueue, createQueueTransport } from './queue.mjs';
import { hash, identity, pinnedBytes, tenantSegment, validateJob } from './security.mjs';
import { publishTranscript } from './submit.mjs';
import { loadWebinarSession } from '../webinar/session-rows.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const tempRoot = join(ROOT, '.cache', 'upload-worker-tests');
const python = join(ROOT, '.venv', 'Scripts', 'python.exe');
async function temporary() { await mkdir(tempRoot, { recursive: true }); return mkdtemp(join(tempRoot, 'case-')); }
async function cleanup(path) {
  assert.ok(resolve(path).startsWith(`${resolve(tempRoot)}${process.platform === 'win32' ? '\\' : '/'}`));
  await rm(path, { recursive: true, force: true });
}
const startRequest = () => ({ method: 'POST', url: 'https://generativelanguage.googleapis.com/upload/v1beta/files?key=never-persist-this',
  headers: { 'Content-Type': 'application/json', 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
    'X-Goog-Upload-Header-Content-Length': '1', 'X-Goog-Upload-Header-Content-Type': 'audio/mp4' }, body: { file: { display_name: 'test' } } });
const validTurn = { speakerRef: 'spk:0', tStart: 0, tEnd: 12, text: 'Lifecycle fixture; not real STT proof.' };
const SHORT_CAPTURE = '[00:00] spk:0: VDC controlled test. This generated voice is for an authorized private test. [00:08] The video shows a changing pattern and a frame counter. Test number one.';

test('actual recording submission passes measured duration through production STT and downstream publication', async () => {
  const dir=await temporary();
  try {
    for(const name of ['input','spool','output'])await mkdir(join(dir,name));
    const audio=Buffer.alloc(44+15*8000*2);
    audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);
    audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(8000,24);audio.writeUInt32LE(16000,28);
    audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(audio.length-44,40);
    await writeFile(join(dir,'input','fixture.wav'),audio);
    const queueStub=`export async function connectQueue(env){return {tenantId:env.UPLOAD_TENANT_ID,actor:env.UPLOAD_ACTOR,scope:q=>({...q,tenantId:env.UPLOAD_TENANT_ID}),jobs:{updateOne:async()=>({})},close:async()=>{}}}
export async function createQueueTransport(){return async req=>{globalThis.fixtureCalls.push(req.method);
 if(req.url.includes('generateContent'))return {status:200,headers:{},body:{candidates:[{content:{parts:[{text:process.env.FIXTURE_TRANSCRIPT}]} } ]}};
 if(req.method==='PUT')return {status:200,headers:{},body:{file:{uri:'files/fixture',name:'files/fixture'}}};
 if(req.method==='GET')return {status:200,headers:{},body:{state:'ACTIVE'}};
 return {status:200,headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=fixture'}};
}}`;
    const spawnStub=`import {spawn as realSpawn} from 'node:child_process';import {EventEmitter} from 'node:events';
export function spawn(binary,args,options){if(binary!=='fixture-measured-ffprobe')return realSpawn(binary,args,options);
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
 child.stdin={end(){queueMicrotask(()=>{child.stdout.emit('data',Buffer.from(process.env.FIXTURE_DURATION));child.emit('close',0);});}};return child;
}`;
    const script=`import {registerHooks} from 'node:module';
const moduleURL=text=>'data:text/javascript,'+encodeURIComponent(text);globalThis.fixtureCalls=[];
registerHooks({resolve(specifier,context,next){
 if(specifier==='dotenv/config')return {url:moduleURL('export {};'),shortCircuit:true};
 if(specifier.endsWith('/queue.mjs')||specifier==='./queue.mjs')return {url:moduleURL(${JSON.stringify(queueStub)}),shortCircuit:true};
 if(specifier==='node:child_process'&&!context.parentURL?.startsWith('data:'))return {url:moduleURL(${JSON.stringify(spawnStub)}),shortCircuit:true};
 return next(specifier,context);
}});
const {submitRecording}=await import(${JSON.stringify(new URL('./submit.mjs',import.meta.url).href)});
try{const result=await submitRecording('fixture.wav',process.env.FIXTURE_SESSION,{env:process.env});console.log(JSON.stringify({ok:true,path:result.path,duration:result.duration,turns:result.rows,calls:globalThis.fixtureCalls}));}
catch(error){console.log(JSON.stringify({ok:false,error:error.message,calls:globalThis.fixtureCalls}));}`;
    const run=(session,extra={})=>{
      const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:20000,windowsHide:true,
        env:{...process.env,UPLOAD_INPUT_ROOT:join(dir,'input'),UPLOAD_SPOOL_ROOT:join(dir,'spool'),UPLOAD_OUTPUT_ROOT:join(dir,'output'),
          UPLOAD_TENANT_ID:'duration-fixture',UPLOAD_ACTOR:'fixture-operator',GEMINI_STT_MODEL:'',FIXTURE_SESSION:session,FIXTURE_TRANSCRIPT:SHORT_CAPTURE,...extra}});
      assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim());
    };
    const result=run('measured');assert.equal(result.ok,true,result.error);assert.equal(result.duration,15);
    assert.equal(result.turns[0].tEnd,15);assert.equal(result.turns[0].speakerRef,'spk:0');
    assert.equal(result.turns[0].text,SHORT_CAPTURE.slice('[00:00] spk:0: '.length));
    assert.deepEqual(result.calls,['POST','PUT','GET','POST']);
    const consumed=loadWebinarSession(join(dir,'output',tenantSegment('duration-fixture'),'measured'),'measured');
    assert.deepEqual(consumed.rawTurns,result.turns);
    for(const value of ['NaN','Infinity','0','-1']){
      const invalid=run('invalid',{UPLOAD_FFPROBE:'fixture-measured-ffprobe',FIXTURE_DURATION:value});
      assert.equal(invalid.ok,false);assert.match(invalid.error,/recording duration unavailable/);assert.deepEqual(invalid.calls,[]);
    }
    for(const start of [15,16]){
      const late=run(`late-${start}`,{FIXTURE_TRANSCRIPT:`[00:${start}] spk:0: late`});
      assert.equal(late.ok,false);assert.match(late.error,/timestamp outside recording/);
      await assert.rejects(readFile(join(dir,'output',tenantSegment('duration-fixture'),`late-${start}`,'turns.json')), {code:'ENOENT'});
    }
  } finally {await cleanup(dir);}
});

test('provider operation boundary removes key and rejects SSRF and credential headers', () => {
  const req = startRequest(); assert.equal(operation(req).url, 'https://generativelanguage.googleapis.com/upload/v1beta/files');
  for (const url of ['http://generativelanguage.googleapis.com/upload/v1beta/files', 'https://localhost/upload/v1beta/files',
    'https://generativelanguage.googleapis.com:8443/upload/v1beta/files', 'https://user:pass@generativelanguage.googleapis.com/upload/v1beta/files',
    'https://generativelanguage.googleapis.com/upload/v1beta/files?access_token=secret', 'https://generativelanguage.googleapis.com/unknown']) assert.throws(() => operation({ ...req, url }));
  assert.throws(() => operation({ ...req, headers: { Authorization: 'secret' } }));
  assert.throws(() => operation({ ...req, headers: { 'X-Goog-Api-Key': 'secret' } }));
  assert.throws(() => operation({ ...req, method: 'DELETE' }));
  assert.throws(() => identity({ UPLOAD_TENANT_ID: 'a' }));
});

test('shared jobs schema rejects missing tenant, unknown status, invalid date and nonfinite number', () => {
  const row = { _id: 'a', tenantId: 'a', kind: 'transcribe.rpc', status: 'pending', createdAt: new Date().toISOString() };
  validateJob(row);
  for (const changed of [{ tenantId: '' }, { status: 'cancelled' }, { createdAt: 'invalid' }, { maxCost: Infinity }]) assert.throws(() => validateJob({ ...row, ...changed }));
});

test('input pinning refuses traversal, hard links, escaping link and parent link', async () => {
  const dir = await temporary();
  try {
    const inside = join(dir, 'inside'), outside = join(dir, 'outside'); await mkdir(inside); await mkdir(outside);
    await writeFile(join(inside, 'audio.wav'), 'a'); await writeFile(join(outside, 'foreign.wav'), 'foreign');
    assert.equal((await pinnedBytes(inside, join(inside, 'audio.wav'))).toString(), 'a');
    await assert.rejects(pinnedBytes(inside, join(outside, 'foreign.wav')));
    await link(join(inside, 'audio.wav'), join(inside, 'hard.wav'));
    await assert.rejects(pinnedBytes(inside, join(inside, 'audio.wav')));
    await symlink(outside, join(inside, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(pinnedBytes(inside, join(inside, 'linked', 'foreign.wav')));
    await assert.rejects(pinnedBytes(join(inside, 'linked'), join(inside, 'linked', 'foreign.wav')));
  } finally { await cleanup(dir); }
});

test('existing consumer validates schema-valid publication; invalid bounds preserve prior bytes', async () => {
  const dir = await temporary(), tenantId = 'fixture-tenant', sessionId = 'fixture-session';
  const source = { _id: hash('audio'), tenantId, kind: 'recording', hash: hash('audio'), captureMode: 'provided',
    consent: { given: true, recordedBy: 'test-operator' }, createdAt: new Date().toISOString(), title: sessionId };
  try {
    const options = { outputRoot: dir, tenantId, sessionId, source, duration: 12.650958, turns: [validTurn] };
    const result = await publishTranscript(options), prior = await readFile(result.path);
    assert.equal(loadWebinarSession(join(dir, tenantSegment(tenantId), sessionId), sessionId).rawTurns.length, 1);
    assert.equal((await publishTranscript(options)).reused, true);
    await assert.rejects(publishTranscript({ ...options, turns: [{ ...validTurn, tEnd: 30 }] }), /timestamp outside recording/);
    await assert.rejects(publishTranscript({ ...options, turns: [] }));
    await assert.rejects(publishTranscript({ ...options, turns: [{ ...validTurn, text: 'different transcript' }] }), /replacement refused/);
    assert.deepEqual(await readFile(result.path), prior);
    const foreign = join(dir, 'foreign'); await mkdir(foreign);
    await symlink(foreign, join(dir, tenantSegment('foreign-tenant')), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(publishTranscript({ ...options, tenantId: 'foreign-tenant', source: { ...source, tenantId: 'foreign-tenant' } }));
  } finally { await cleanup(dir); }
});

test('actual Python background worker consumes real Mongo operation; missing key fails without outbound call', { timeout: 30000 }, async () => {
  const dir = await temporary(), db = `upload_queue_${randomUUID().replaceAll('-', '')}`;
  const env = { ...process.env, UPLOAD_QUEUE_DB: db, UPLOAD_TENANT_ID: 'process-tenant', UPLOAD_ACTOR: 'test-operator',
    UPLOAD_SPOOL_ROOT: dir, MONGODB_URL: process.env.MONGODB_URL ?? 'mongodb://127.0.0.1:27017', GEMINI_API_KEY: '' };
  const queue = await connectQueue(env); let child, stdout = '';
  try {
    child = spawn(python, [join(ROOT, 'workers', 'transcribe', 'src', 'worker.py')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', () => {});
    const transport = await createQueueTransport(queue, { spoolRoot: dir, runId: hash('process-proof'), timeoutMs: 15000, pollMs: 20 });
    await assert.rejects(transport(startRequest()), /worker-provider-key-missing/);
    const row = await queue.jobs.findOne(queue.scope({ kind: 'transcribe.rpc' }));
    assert.equal(row.status, 'failed'); assert.equal(row.attempts, 1); assert.equal(row.error, 'worker-provider-key-missing');
    assert.equal(JSON.stringify(row).includes('never-persist-this'), false);
    assert.equal(row.request.url.includes('?'), false);
    assert.ok(stdout.includes('operation processed=1'));
  } finally {
    if (child && child.exitCode === null) { const ended = new Promise(r => child.once('exit', r)); child.kill(); await ended; }
    assert.match(db, /^upload_queue_[a-f0-9]{32}$/); await queue.client.db(db).dropDatabase(); await queue.close(); await cleanup(dir);
  }
});

test('producer cancellation and timeout are durable; foreign tenant result cannot be read', { timeout: 15000 }, async () => {
  const dir = await temporary(), db = `upload_queue_${randomUUID().replaceAll('-', '')}`;
  const env = { ...process.env, UPLOAD_QUEUE_DB: db, UPLOAD_TENANT_ID: 'a', UPLOAD_ACTOR: 'operator', MONGODB_URL: process.env.MONGODB_URL ?? 'mongodb://127.0.0.1:27017' };
  const queue = await connectQueue(env);
  try {
    const abort = new AbortController(), transport = await createQueueTransport(queue, { spoolRoot: dir, runId: hash('cancel'), timeoutMs: 2000, signal: abort.signal, pollMs: 10 });
    const pending = transport(startRequest()); setTimeout(() => abort.abort(), 100);
    await assert.rejects(pending, /cancelled/);
    const row = await queue.jobs.findOne(queue.scope({ runId: hash('cancel') }));
    assert.equal(row.status, 'failed'); assert.ok(row.cancelledAt);
    const timeout = await createQueueTransport(queue, { spoolRoot: dir, runId: hash('timeout'), timeoutMs: 50, pollMs: 10 });
    await assert.rejects(timeout(startRequest()), /timeout/);
    const credentials = await createQueueTransport(queue, { spoolRoot: dir, runId: hash('credential'), timeoutMs: 100 });
    await assert.rejects(credentials({ ...startRequest(), body: { apiKey: 'body-secret' } }), /credential field/);
    assert.equal(await queue.jobs.countDocuments(queue.scope({ runId: hash('credential') })), 0);
    const foreign = await createQueueTransport(queue, { spoolRoot: dir, runId: hash('foreign'), timeoutMs: 2000, pollMs: 10 });
    const request = foreign(startRequest());
    let existing;
    for (let n = 0; n < 100 && !existing; n++) { existing = await queue.jobs.findOne(queue.scope({ runId: hash('foreign') })); if (!existing) await new Promise(r => setTimeout(r, 10)); }
    assert.ok(existing); await queue.jobs.deleteOne(queue.scope({ _id: existing._id }));
    await queue.jobs.insertOne({ ...existing, tenantId: 'foreign', status: 'done', response: { status: 200, headers: {}, body: { foreign: true } } });
    await assert.rejects(request, /operation missing/);
    assert.equal((await queue.jobs.findOne({ _id: existing._id, tenantId: 'foreign' })).status, 'done');
  } finally { assert.match(db, /^upload_queue_[a-f0-9]{32}$/); await queue.client.db(db).dropDatabase(); await queue.close(); await cleanup(dir); }
});
