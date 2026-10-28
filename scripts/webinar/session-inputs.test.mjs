import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, unlinkSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadWebinarSession, buildSessionFiles } from './session-rows.mjs';
import { screenEvidenceTurns } from './process-video.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function screenGeneration({dir, put, turns}) {
  const file = 'screen-frames/run-fixture/frame-000001.jpg', tStart = 0.5, hash = sha('real-frame-bytes');
  mkdirSync(join(dir, 'screen-frames', 'run-fixture'), {recursive:true});
  writeFileSync(join(dir, file), 'real-frame-bytes');
  const frame = { id:`session-frame-${sha(`${hash}|${tStart}`).slice(0,32)}`, file, hash, tStart,
    analysis:{readable:true,ocrText:'Visa fees',visualDescription:'A two-bar chart'} };
  const evidence = {sessionId:'session',tenantId:'tenant-a',duration:1,frames:[frame]};
  const outputs = {'knowledge-turns.json':[...turns,...screenEvidenceTurns('session','tenant-a',evidence)],
    'screen-evidence.json':evidence,'notes.json':{sessionId:'session',notes:[]}};
  const emit = () => {
    const hashes = {};
    for (const [name,value] of Object.entries(outputs)) { put(name,value); hashes[name] = sha(JSON.stringify(value)); }
    put('video-stage.json',{status:'done',sessionId:'session',outputs:hashes});
  };
  emit();
  return {frame,outputs,emit};
}

function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'webinar-inputs-'));
  const put = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value));
  const source = { _id: 'session-src', tenantId: 'tenant-a', title: 'Visa webinar', createdAt: '2026-09-30T10:00:00Z' };
  const turns = [{ _id: 'turn-a', tenantId: 'tenant-a', sessionId: 'session', speakerRef: 'spk:0', tStart: 0, tEnd: 1, text: 'Visa information' }];
  put('source.json', source); put('turns.json', turns);
  try { run({dir, put, source, turns}); } finally { rmSync(dir, {recursive:true, force:true}); }
}
test('unattended recording gets metadata without invented speakers', () => fixture(({dir}) => {
  const loaded = loadWebinarSession(dir, 'session');
  assert.equal(loaded.meta.tenantId, 'tenant-a');
  assert.deepEqual(loaded.meta.people, []);
  assert.equal(loaded.meta.title, 'Visa webinar');
  const files = buildSessionFiles({sessionId:'session',tenantId:'tenant-a',sessionDoc:{sourceId:'session-src',title:loaded.meta.title,date:loaded.meta.date,status:{transcribe:'done',index:'pending'}},meta:loaded.meta,turns:loaded.rawTurns});
  assert.equal(files.sessionPage.evidence[0].turnId,'turn-a');
}));
test('foreign tenant/session and failed transcript cannot enter index', () => fixture(({dir, put, turns}) => {
  put('turns.json', [{...turns[0], tenantId:'tenant-b'}]);
  assert.throws(() => loadWebinarSession(dir, 'session'), /identity mismatch/);
  put('turns.json', turns); put('validation.json', { status:'failed', stage:'transcript' });
  assert.throws(() => loadWebinarSession(dir, 'session'), /validation/);
}));
test('screen generation hashes verified before combined speech/screen downstream consumption', () => fixture(({dir, put, turns}) => {
  screenGeneration({dir,put,turns});
  assert.equal(loadWebinarSession(dir,'session').rawTurns[1].speakerRef,'screen');
  put('knowledge-turns.json',turns);
  assert.throws(() => loadWebinarSession(dir,'session'), /hash mismatch/);
}));
test('missing or corrupt physical frames prevent downstream indexing', () => fixture((f) => {
  const {frame} = screenGeneration(f);
  writeFileSync(join(f.dir,frame.file),'corrupt');
  assert.throws(() => loadWebinarSession(f.dir,'session'), /frame byte hash/);
  unlinkSync(join(f.dir,frame.file));
  assert.throws(() => loadWebinarSession(f.dir,'session'), /ENOENT/);
}));
test('rehashing artifacts cannot reassign screen citations, timestamps, text or tenant', () => fixture((f) => {
  const {outputs,emit} = screenGeneration(f);
  const turn = outputs['knowledge-turns.json'][1];
  for (const [key,value] of [['frameId','other-frame'],['file','screen-frames/run-fixture/frame-000002.jpg'],['hash','f'.repeat(64)],['tStart',0.9]]) {
    const previous = turn.screenEvidence[key]; turn.screenEvidence[key] = value; emit();
    assert.throws(() => loadWebinarSession(f.dir,'session'), /reference mismatch/);
    turn.screenEvidence[key] = previous;
  }
  for (const [key,value] of [['tenantId','tenant-b'],['sessionId','foreign'],['text','Invented fact'],['tStart',0.9],['_id','other-screen-turn']]) {
    const previous = turn[key]; turn[key] = value; emit();
    assert.throws(() => loadWebinarSession(f.dir,'session'), /reference mismatch/); turn[key] = previous;
  }
  emit(); assert.equal(loadWebinarSession(f.dir,'session').rawTurns.length,3);
}));
test('frame paths cannot escape the session through traversal or a directory junction', () => fixture((f) => {
  const {outputs,emit,frame} = screenGeneration(f);
  const previous = frame.file;
  frame.file = '../outside.jpg'; emit();
  assert.throws(() => loadWebinarSession(f.dir,'session'), /invalid screen frame/);
  frame.file = previous;
  const outside = mkdtempSync(join(tmpdir(),'webinar-outside-'));
  try {
    writeFileSync(join(outside,'frame-000001.jpg'),'real-frame-bytes');
    symlinkSync(outside,join(f.dir,'screen-frames','outside-link'),process.platform === 'win32' ? 'junction' : 'dir');
    frame.file = 'screen-frames/outside-link/frame-000001.jpg';
    outputs['knowledge-turns.json'] = [...f.turns,...screenEvidenceTurns('session','tenant-a',outputs['screen-evidence.json'])];
    emit(); assert.throws(() => loadWebinarSession(f.dir,'session'), /outside session directory/);
  } finally { rmSync(outside,{recursive:true,force:true}); }
}));
test('incomplete screen stages never fall back silently to speech-only ready', () => fixture(({dir,put}) => {
  put('video-stage.json',{status:'failed'});
  assert.throws(() => loadWebinarSession(dir,'session'), /incomplete/);
}));

test('combined knowledge must preserve every current raw speech field exactly', () => fixture((f) => {
  const {outputs,emit} = screenGeneration(f);
  for (const field of ['text','speakerRef','tStart','tEnd','tenantId','sessionId']) {
    const changed = {...f.turns[0], [field]: typeof f.turns[0][field] === 'number' ? 0.2 : 'changed'};
    f.put('turns.json',[changed]);
    assert.throws(() => loadWebinarSession(f.dir,'session'), /current raw speech/);
  }
  f.put('turns.json',f.turns);
  const original = outputs['knowledge-turns.json'][0];
  outputs['knowledge-turns.json'][0] = {...original,text:'Reassigned but rehashed'}; emit();
  assert.throws(() => loadWebinarSession(f.dir,'session'), /current raw speech/);
  outputs['knowledge-turns.json'][0] = original; emit();
  f.put('turns.json',[]);
  assert.throws(() => loadWebinarSession(f.dir,'session'), /current raw speech/);
  f.put('turns.json',[...f.turns,{...original,_id:'new-speech'}]);
  assert.throws(() => loadWebinarSession(f.dir,'session'), /current raw speech/);
  outputs['knowledge-turns.json'].push(original); emit(); f.put('turns.json',f.turns);
  assert.throws(() => loadWebinarSession(f.dir,'session'), /current raw speech/);
}));

test('raw speech property and row ordering do not change its provenance', () => fixture((f) => {
  const second = {...f.turns[0],_id:'turn-b',text:'Second speech'};
  f.put('turns.json',[second,...f.turns]);
  screenGeneration({...f,turns:[...f.turns,second]});
  f.put('turns.json',[Object.fromEntries(Object.entries(second).reverse()),...f.turns]);
  assert.equal(loadWebinarSession(f.dir,'session').rawTurns.filter(t=>t.speakerRef!=='screen').length,2);
}));

test('captured media cannot bypass validation or exceed measured duration at sync', () => fixture((f) => {
  f.put('source.json',{...f.source,captureMode:'silent'});
  assert.throws(() => loadWebinarSession(f.dir,'session'), /requires passed/);
  for (const durationSec of [0,-1,null,'1']) {
    f.put('validation.json',{status:'passed',transcriptValidated:true,durationSec});
    assert.throws(() => loadWebinarSession(f.dir,'session'), /requires passed/);
  }
  f.put('validation.json',{status:'passed',transcriptValidated:true,durationSec:1});
  assert.equal(loadWebinarSession(f.dir,'session').rawTurns[0].tEnd,1);
  f.put('turns.json',[{...f.turns[0],tEnd:1.01}]);
  assert.throws(() => loadWebinarSession(f.dir,'session'), /invalid turns/);
}));

test('duplicate or non-string turn identifiers cannot silently overwrite index rows', () => fixture((f) => {
  f.put('turns.json',[...f.turns,...f.turns]);
  assert.throws(() => loadWebinarSession(f.dir,'session'), /invalid turns/);
  for (const id of [42,' ']) {
    f.put('turns.json',[{...f.turns[0],_id:id}]);
    assert.throws(() => loadWebinarSession(f.dir,'session'), /invalid turns/);
  }
}));
