import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareWebinarIndexProof } from './index-proof.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'webinar-index-proof-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const speech = '[{"_id":"s-t1","text":"Speech"}]';
  const inputHash = createHash('sha256').update(speech).digest('hex');
  writeFileSync(join(dir, 'turns.json'), speech);
  writeFileSync(join(dir, 'validation.json'), JSON.stringify({ status: 'passed', transcriptValidated: true, turnsSha256: inputHash }));
  const result = { sessionId: 's', completion: { version: 2, strict: true, complete: true, treeWritten: true,
    generation: 'g', turnCount: 1 }, summary: { degraded: null }, claims: { degraded: null }, chunks: { written: 1, skipped: null } };
  return { dir, sessionId: 's', tenantId: 'tenant-a', inputArtifact: 'turns.json', selectedTurns: JSON.parse(speech), result };
}

const prove = f => prepareWebinarIndexProof(f)(f.result);

const vectorless = f => ({ ...f, retrievalMode: 'vectorless', result: { ...f.result,
  completion: { ...f.result.completion, retrievalMode: 'vectorless', lexicalWritten: true, provenanceValidated: true } } });

test('vectorless source emits explicit lexical/provenance proof without claiming semantic support', t => {
  const f = vectorless(fixture(t)), proof = prove(f);
  assert.equal(proof.version, 4);
  assert.equal(proof.retrievalMode, 'vectorless');
  assert.equal(proof.lexical, 'done');
  assert.equal(proof.provenance, 'passed');
  assert.equal(proof.semanticSupport, 'not-required');
  assert.equal(proof.generation, f.result.completion.generation);
  assert.equal(proof.inputHash, JSON.parse(readFileSync(join(f.dir, 'validation.json'))).turnsSha256);
  assert.equal(proof.tenantId, f.tenantId);
});

test('vectorless proof refuses missing readiness and never downgrades to legacy semantic completion', t => {
  const f = vectorless(fixture(t));
  for (const patch of [{ lexicalWritten: false }, { lexicalWritten: undefined },
    { provenanceValidated: false }, { provenanceValidated: undefined }, { retrievalMode: 'unknown' },
    { retrievalMode: undefined }, { retrievalMode: 'vector' }, { treeWritten: false }]) {
    assert.throws(() => prove({ ...f, result: { ...f.result, completion: { ...f.result.completion, ...patch } } }), /indexing incomplete/);
  }
  assert.throws(() => prove({ ...f, result: { ...f.result, chunks: { written: 0, skipped: null } } }), /indexing incomplete/);
  assert.throws(() => prepareWebinarIndexProof({ ...f, retrievalMode: 'unknown' }), /invalid webinar retrieval mode/);
  // Old vector completion cannot be promoted into the newly required publication contract.
  assert.throws(() => prepareWebinarIndexProof(f)(fixture(t).result), /indexing incomplete/);
});

test('vectorless proof preserves stale input and validation guards', t => {
  const f = vectorless(fixture(t)), finalize = prepareWebinarIndexProof(f);
  writeFileSync(join(f.dir, 'validation.json'), JSON.stringify({ status: 'failed' }));
  assert.throws(() => finalize(f.result), /changed during indexing/);
});

test('passed speech-only source emits a proof without a combined artifact', t => {
  const f = fixture(t), proof = prove(f);
  assert.equal(proof.inputArtifact, 'turns.json');
  assert.equal(proof.inputHash, JSON.parse(readFileSync(join(f.dir, 'validation.json'))).turnsSha256);
  assert.equal(proof.strict, true);
  assert.equal(proof.semanticSupport, 'passed');
});

test('selected combined input is hashed; stray combined bytes do not change a speech proof', t => {
  const f = fixture(t), before = prove(f);
  const bytes = '[{"_id":"screen-t1","text":"Slide"}]';
  writeFileSync(join(f.dir, 'knowledge-turns.json'), bytes);
  assert.deepEqual(prove(f), before);
  writeFileSync(join(f.dir, 'video-stage.json'), JSON.stringify({ status: 'done', outputs: { 'knowledge-turns.json': createHash('sha256').update(bytes).digest('hex') } }));
  const proof = prove({ ...f, inputArtifact: 'knowledge-turns.json', selectedTurns: JSON.parse(bytes) });
  assert.equal(proof.inputHash, createHash('sha256').update(bytes).digest('hex'));
  assert.notEqual(proof.inputHash, before.inputHash);
});

test('speech proof refuses failed, unvalidated, stale or missing validation', t => {
  const f = fixture(t), valid = JSON.parse(readFileSync(join(f.dir, 'validation.json')));
  for (const patch of [{ status: 'failed' }, { transcriptValidated: false }, { turnsSha256: '0'.repeat(64) }, { turnsSha256: undefined }]) {
    writeFileSync(join(f.dir, 'validation.json'), JSON.stringify({ ...valid, ...patch }));
    assert.throws(() => prove(f), /current passed transcript validation/);
  }
  rmSync(join(f.dir, 'validation.json'));
  assert.throws(() => prove(f), /ENOENT/);
});

test('no proof for an incomplete, degraded, empty or foreign-session index result', t => {
  const f = fixture(t);
  const rejected = [{ ...f.result, sessionId: 'foreign' }, { ...f.result, summary: { degraded: 'failed' } },
    { ...f.result, claims: { degraded: 'failed' } }, { ...f.result, chunks: { written: 0, skipped: null } },
    { ...f.result, chunks: { written: 1, skipped: 'embedding-failed' } }];
  for (const patch of [{ version: 1 }, { strict: false }, { complete: false }, { treeWritten: false }, { generation: '' }, { turnCount: 0 }, { turnCount: 2 }]) {
    rejected.push({ ...f.result, completion: { ...f.result.completion, ...patch } });
  }
  for (const result of rejected) assert.throws(() => prove({ ...f, result }), /indexing incomplete/);
  assert.throws(() => prove({ ...f, inputArtifact: '../turns.json' }), /invalid.*artifact/);
});

test('changed source or validation during indexing cannot certify stale database input', t => {
  const f = fixture(t), finalize = prepareWebinarIndexProof(f), path = join(f.dir, 'turns.json'), original = readFileSync(path);
  writeFileSync(path, '[{"_id":"s-t1","text":"Changed"}]');
  assert.throws(() => finalize(f.result), /changed during indexing/);
  writeFileSync(path, original);
  writeFileSync(join(f.dir, 'validation.json'), JSON.stringify({ status: 'failed' }));
  assert.throws(() => finalize(f.result), /changed during indexing/);
});

test('loader disagreement and stale combined-stage hashes are refused before indexing', t => {
  const f = fixture(t);
  assert.throws(() => prepareWebinarIndexProof({ ...f, selectedTurns: [] }), /differs from verified loader/);
  writeFileSync(join(f.dir, 'knowledge-turns.json'), JSON.stringify(f.selectedTurns));
  writeFileSync(join(f.dir, 'video-stage.json'), JSON.stringify({ status: 'done', outputs: { 'knowledge-turns.json': '0'.repeat(64) } }));
  assert.throws(() => prepareWebinarIndexProof({ ...f, inputArtifact: 'knowledge-turns.json' }), /current verified video stage/);
});

test('prepared turn count remains fixed when caller mutates its loader array', t => {
  const f = fixture(t), finalize = prepareWebinarIndexProof(f);
  f.selectedTurns.push({ _id: 's-t2', text: 'Caller-only extra turn' });
  assert.throws(() => finalize({ ...f.result, completion: { ...f.result.completion, turnCount: 2 } }), /indexing incomplete/);
  assert.equal(finalize(f.result).turnCount, 1);
});
