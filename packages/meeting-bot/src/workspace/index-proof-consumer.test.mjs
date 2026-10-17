import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateIndexProof } from '../capture/record-finalize.ts';
import { producedProofFixture } from './index-proof-fixture.mjs';

test('legacy sync v3 producer output is consumed by the actual finalizer', t => {
  const f = producedProofFixture(t, 'knowledge-turns.json', 'legacy');
  assert.equal(f.proof.version, 3, 'actual producer must emit v3; never relabel v2 to disguise incompatibility');
  assert.equal(validateIndexProof(f.dir, 'session-a', 'lkb_staging').generation, 'current-generation');
});

test('actual v4 selected speech-only producer input is consumed with its current passed validation', t => {
  const f = producedProofFixture(t, 'turns.json');
  assert.equal(validateIndexProof(f.dir, 'session-a', 'lkb_staging').inputArtifact, 'turns.json');
});

test('legacy v2 combined proof remains supported with its existing core guarantees', t => {
  const f = producedProofFixture(t, 'knowledge-turns.json', 'legacy');
  const { sourceId, sourceHash, workDb, inputArtifact, ...legacy } = f.proof;
  f.write('index-proof.json', { ...legacy, version: 2 });
  assert.equal(validateIndexProof(f.dir, 'session-a').generation, 'current-generation');
});

test('v3 refuses wrong source, database, bytes, generation, selected count and stage status', t => {
  const f = producedProofFixture(t, 'knowledge-turns.json', 'legacy');
  const attacks = [{ sourceId: 'foreign' }, { sourceHash: '0'.repeat(64) }, { workDb: 'lkb_other' },
    { inputHash: '0'.repeat(64) }, { inputArtifact: '../knowledge-turns.json' }, { generation: 1 }, { generation: '' },
    { turnCount: 2 }, { status: 'processing' }, { strict: false }, { semanticSupport: 'failed' }, { tree: 'pending' },
    { sessionId: 'other' }, { tenantId: 'foreign' }, { version: 4 }];
  for (const patch of attacks) {
    f.write('index-proof.json', { ...f.proof, ...patch });
    assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), /strict index proof/, JSON.stringify(patch));
  }
});

test('v3 refuses changed source/session metadata and foreign selected turns', t => {
  const f = producedProofFixture(t, 'knowledge-turns.json', 'legacy');
  const originalSource = readFileSync(join(f.dir, 'source.json'));
  f.write('source.json', { ...f.source, _id: 'foreign-source' });
  assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), /strict index proof/);
  writeFileSync(join(f.dir, 'source.json'), originalSource);
  for (const session of [ { _id: 'other', tenantId: 'tenant-a', sourceId: 'source-a', status: { transcribe: 'done', index: 'done' } },
    { _id: 'session-a', tenantId: 'foreign', sourceId: 'source-a', status: { transcribe: 'done', index: 'done' } },
    { _id: 'session-a', tenantId: 'tenant-a', sourceId: 'source-a', status: { transcribe: 'done', index: 'failed' } } ]) {
    f.write('session.json', session);
    assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), /strict index proof/);
  }
});

test('v3 database binding is independently expected and test-data sources remain staging only', t => {
  const f = producedProofFixture(t, 'knowledge-turns.json', 'legacy');
  assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_other'), /strict index proof/);
  assert.throws(() => validateIndexProof(f.dir, 'session-a', ''), /strict index proof/);
});

test('actual sync v4 vectorless producer reaches finalizer without semantic/vector proof', t => {
  const f = producedProofFixture(t);
  assert.equal(f.proof.version, 4);
  const proof = validateIndexProof(f.dir, 'session-a', 'lkb_staging');
  assert.equal(proof.retrievalMode, 'vectorless');
  assert.equal(proof.lexical, 'done');
  assert.equal(proof.provenance, 'passed');
  assert.equal(proof.semanticSupport, 'not-required');
});

test('v4 refuses missing mode, incomplete readiness and identity/input downgrade attacks', t => {
  const f = producedProofFixture(t);
  const attacks = [{ retrievalMode: undefined }, { retrievalMode: 'vector' }, { lexical: undefined }, { lexical: 'pending' },
    { provenance: undefined }, { provenance: 'failed' }, { semanticSupport: 'passed' }, { semanticSupport: undefined },
    { version: 3 }, { version: 2 }, { sourceHash: '0'.repeat(64) }, { sourceId: 'foreign' }, { generation: '' },
    { tenantId: 'foreign' }, { sessionId: 'foreign' }, { workDb: 'lkb' }, { inputHash: '0'.repeat(64) },
    { turnCount: 2 }, { strict: false }, { tree: 'pending' }, { status: 'pending' }];
  for (const patch of attacks) {
    f.write('index-proof.json', { ...f.proof, ...patch });
    assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), /strict index proof/, JSON.stringify(patch));
  }
});

test('v4 still refuses stale selected validation and foreign session metadata', t => {
  const f = producedProofFixture(t, 'turns.json');
  f.write('validation.json', { status: 'passed', transcriptValidated: true, turnsSha256: '0'.repeat(64) });
  assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), /strict index proof/);
  f.write('validation.json', { status: 'passed', transcriptValidated: true, turnsSha256: f.proof.inputHash });
  f.write('session.json', { _id: 'session-a', tenantId: 'foreign', sourceId: f.source._id,
    status: { transcribe: 'done', index: 'done' } });
  assert.throws(() => validateIndexProof(f.dir, 'session-a', 'lkb_staging'), /strict index proof/);
});
