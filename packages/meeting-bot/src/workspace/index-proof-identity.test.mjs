import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateIndexProof } from '../capture/record-finalize.ts';
import { producedProofFixture } from './index-proof-fixture.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('matching rewritten hashes cannot admit foreign, duplicate or malformed selected rows', t => {
  const f = producedProofFixture(t), original = f.turns[0];
  const attacks = [[{ ...original, tenantId: 'foreign' }], [{ ...original, sessionId: 'foreign' }], [original, original],
    [{ ...original, tStart: 2, tEnd: 1 }], [{ ...original, tStart: null }], [{ ...original, text: '' }], [{ ...original, speakerRef: '' }]];
  for (const turns of attacks) {
    f.write('knowledge-turns.json', turns);
    const inputHash = sha(readFileSync(join(f.dir, 'knowledge-turns.json')));
    f.write('video-stage.json', { status: 'done', outputs: { 'knowledge-turns.json': inputHash } });
    f.write('index-proof.json', { ...f.proof, inputHash, turnCount: turns.length });
    assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), /strict index proof/);
  }
});

test('current combined and speech gates must remain passed and hash-bound', t => {
  const combined = producedProofFixture(t);
  for (const stage of [{ status: 'failed', outputs: { 'knowledge-turns.json': combined.proof.inputHash } },
    { status: 'done', outputs: { 'knowledge-turns.json': '0'.repeat(64) } }]) {
    combined.write('video-stage.json', stage);
    assert.throws(() => validateIndexProof(combined.dir, 'session-a', 'lkb_staging'), /strict index proof/);
  }
  const speech = producedProofFixture(t, 'turns.json');
  for (const validation of [{ status: 'failed', transcriptValidated: true, turnsSha256: speech.proof.inputHash },
    { status: 'passed', transcriptValidated: false, turnsSha256: speech.proof.inputHash },
    { status: 'passed', transcriptValidated: true, turnsSha256: '0'.repeat(64) }]) {
    speech.write('validation.json', validation);
    assert.throws(() => validateIndexProof(speech.dir, 'session-a', 'lkb_staging'), /strict index proof/);
  }
});

test('test-data source remains staging-only even when caller and proof agree on another database', t => {
  const f = producedProofFixture(t);
  f.write('source.json', { ...f.source, testData: true });
  f.write('index-proof.json', { ...f.proof, sourceHash: sha(readFileSync(join(f.dir, 'source.json'))), workDb: 'lkb_other' });
  assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_other'), /strict index proof/);
});

test('legacy v2 still refuses count mismatch and non-string generation', t => {
  const f = producedProofFixture(t);
  const { sourceId, sourceHash, workDb, inputArtifact, ...legacy } = f.proof;
  for (const patch of [{ turnCount: 2 }, { generation: 1 }, { generation: ' ' }]) {
    f.write('index-proof.json', { ...legacy, version: 2, ...patch });
    assert.throws(() => validateIndexProof(f.dir, 'session-a'), /strict index proof/);
  }
});
