import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { prepareWebinarIndexProof } from '../../../../scripts/webinar/index-proof.mjs';
import * as retentionIo from '../../../ingest/src/retention/production/private-summary.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** Run the current sync CLI's actual proof-producing block, with synthetic completed-index input only. */
export function producedProofFixture(t, inputArtifact = 'knowledge-turns.json', mode = 'vectorless') {
  const dir = mkdtempSync(join(tmpdir(), 't043-producer-consumer-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = { _id: 'source-a', tenantId: 'tenant-a', kind: 'recording' };
  const turns = [{ _id: 'session-a-t1', tenantId: 'tenant-a', sessionId: 'session-a', speakerRef: 'speaker-a',
    tStart: 1, tEnd: 2, text: 'Actual synthetic boundary fixture, not live acceptance.' }];
  const write = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value));
  write('source.json', source);
  write('session.json', { _id: 'session-a', tenantId: 'tenant-a', sourceId: source._id,
    status: { transcribe: 'done', index: 'done' } });
  write(inputArtifact, turns);
  const inputHash = sha(readFileSync(join(dir, inputArtifact)));
  if (inputArtifact === 'turns.json') write('validation.json', { status: 'passed', transcriptValidated: true, turnsSha256: inputHash });
  else write('video-stage.json', { status: 'done', outputs: { [inputArtifact]: inputHash } });
  const retrievalMode = mode === 'legacy' ? undefined : mode;
  const finalizeIndexProof = prepareWebinarIndexProof({ dir, sessionId: 'session-a', tenantId: 'tenant-a', inputArtifact, selectedTurns: turns, retrievalMode });
  const res = { sessionId: 'session-a', summary: { degraded: null }, claims: { degraded: null }, chunks: { written: 1, skipped: null },
    completion: { version: 2, strict: true, complete: true, generation: 'current-generation', turnCount: turns.length, treeWritten: true,
      ...(retrievalMode === 'vectorless' ? { retrievalMode, lexicalWritten: true, provenanceValidated: true } : {}) } };
  const actual = readFileSync(join(ROOT, 'scripts/webinar/sync-session.mjs'), 'utf8');
  const start = actual.indexOf('    const baseProof = finalizeIndexProof(res);');
  const end = actual.indexOf('    const indexed =', start);
  if (start < 0 || end < start) throw new Error('actual sync proof producer changed; review the caller floor');
  const block = actual.slice(start, end);
  runInNewContext(block, { finalizeIndexProof, res, retentionIo, retentionSourceBytes: readFileSync(join(dir, 'source.json')),
    dir, join, source, workDb: 'lkb_staging', createHash, JSON, Error });
  const proof = JSON.parse(readFileSync(join(dir, 'index-proof.json')));
  return { dir, source, turns, proof, write };
}
