import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateIndexProof } from '../capture/record-finalize.ts';
import { producedProofFixture } from './index-proof-fixture.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
const R = /strict index proof/;
// rewrite turns + all matching hashes so only the row guards can refuse
function rewriteTurns(f, art, turns) {
  f.write(art, turns);
  const h = sha(readFileSync(join(f.dir, art)));
  if (art === 'turns.json') f.write('validation.json', { status: 'passed', transcriptValidated: true, turnsSha256: h });
  else f.write('video-stage.json', { status: 'done', outputs: { [art]: h } });
  f.write('index-proof.json', { ...f.proof, inputHash: h, turnCount: turns.length });
}
for (const art of ['turns.json', 'knowledge-turns.json']) {
  test('v4 hostile rows ' + art, t => {
    const f = producedProofFixture(t, art);
    assert.equal(f.proof.version, 4);
    const base = f.turns[0];
    const bad = [ { ...base, tenantId: 'foreign' }, { ...base, sessionId: 'other' }, { ...base, speakerRef: '' }, { ...base, text: '  ' },
      { ...base, tStart: -1 }, { ...base, tStart: 5, tEnd: 4 }, { ...base, tStart: null }, { ...base, _id: '' } ];
    for (const b of bad) { rewriteTurns(f, art, [b]); assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), R, JSON.stringify(b)); }
    rewriteTurns(f, art, [base, { ...base }]); assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), R, 'dup');
    rewriteTurns(f, art, [base]); assert.equal(validateIndexProof(f.dir, 'session-a', 'lkb_staging').version, 4); // control
  });
}
test('v4 db binding: production lkb, mismatch, undefined expected, testData', t => {
  const f = producedProofFixture(t);
  for (const db of ['lkb', 'lkb_other', undefined, '']) assert.throws(() => validateIndexProof(f.dir, 'session-a', db), R, String(db));
  // testData source must stay staging: rewrite source+hash, proof workDb to other db, caller agrees on other db
  const src = { ...f.source, testData: true }; f.write('source.json', src);
  const sh = sha(readFileSync(join(f.dir, 'source.json')));
  f.write('index-proof.json', { ...f.proof, sourceHash: sh, workDb: 'lkb_other' });
  assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_other'), R, 'testData');
  f.write('index-proof.json', { ...f.proof, sourceHash: sh, workDb: 'lkb_staging' });
  assert.equal(validateIndexProof(f.dir, 'session-a', 'lkb_other').version, 4); // testData forces lkb_staging
});
test('v4 session/gate/artifact attacks', t => {
  const f = producedProofFixture(t, 'turns.json');
  f.write('index-proof.json', { ...f.proof, inputArtifact: 'knowledge-turns.json' }); assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), R, 'artifact swap');
  f.write('index-proof.json', f.proof);
  f.write('session.json', { _id: 'session-a', tenantId: 'tenant-a', sourceId: 'foreign', status: { transcribe: 'done', index: 'done' } });
  assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), R, 'session source');
  f.write('session.json', { _id: 'session-a', tenantId: 'tenant-a', sourceId: 'source-a', status: { transcribe: 'done', index: 'pending' } });
  assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), R, 'index status');
});
