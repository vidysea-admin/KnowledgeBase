import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readRetentionBytes } from '../../../ingest/src/retention/production/private-summary-read.js';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512 && value === value.trim() && !/[\p{Cc}\u2028\u2029]/u.test(value);
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Read-only completion consumer: legacy semantic v2/v3 or explicit vectorless v4. */
export function validateCaptureIndexProof(dir: string, sessionId: string, expectedWorkDb: string | undefined): Record<string, unknown> {
  try {
    const snapshots: { path: string; bytes: Buffer }[] = [];
    const read = (name: string, limit = 1024 * 1024): { value: unknown; bytes: Buffer } => {
      const path = join(dir, name), bytes = readRetentionBytes(path, limit);
      snapshots.push({ path, bytes });
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      return { value, bytes };
    };
    const proof = read('index-proof.json').value, sourceSnapshot = read('source.json'), source = sourceSnapshot.value;
    if (!record(proof) || !record(source) || !identity(sessionId) || !identity(source.tenantId) ||
        (proof.version !== 2 && proof.version !== 3 && proof.version !== 4) || proof.sessionId !== sessionId || proof.tenantId !== source.tenantId ||
        !identity(proof.generation) || proof.strict !== true || proof.status !== 'done' ||
        !['summary', 'claims', 'chunks', 'tree'].every(key => proof[key] === 'done')) throw new Error('incomplete core proof');
    if (proof.version === 4 ? proof.retrievalMode !== 'vectorless' || proof.lexical !== 'done' ||
        proof.provenance !== 'passed' || proof.semanticSupport !== 'not-required' : proof.semanticSupport !== 'passed') {
      throw new Error('incomplete retrieval proof');
    }
    const artifact = proof.version === 2 ? 'knowledge-turns.json' : proof.inputArtifact;
    if (artifact !== 'knowledge-turns.json' && artifact !== 'turns.json') throw new Error('invalid selected artifact');
    if (proof.version === 2 && proof.inputArtifact !== undefined && proof.inputArtifact !== artifact) throw new Error('invalid legacy artifact');
    const input = read(artifact, 64 * 1024 * 1024), turns = input.value;
    if (!Array.isArray(turns) || turns.length === 0 || !turns.every((turn: unknown) => record(turn)) ||
        !Number.isSafeInteger(proof.turnCount) || proof.turnCount !== turns.length || proof.inputHash !== sha(input.bytes)) throw new Error('stale input proof');
    if (proof.version === 3 || proof.version === 4) {
      const expected = source.testData === true ? 'lkb_staging' : expectedWorkDb;
      if (!identity(source._id) || proof.sourceId !== source._id || proof.sourceHash !== sha(sourceSnapshot.bytes) ||
          typeof expected !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(expected) || expected === 'lkb' || proof.workDb !== expected) throw new Error('foreign source or database');
      const session = read('session.json').value;
      if (!record(session) || session._id !== sessionId || session.tenantId !== source.tenantId || session.sourceId !== source._id ||
          !record(session.status) || session.status.transcribe !== 'done' || session.status.index !== 'done') throw new Error('foreign or incomplete session');
      const ids = new Set<string>();
      for (const value of turns as unknown[]) {
        if (!record(value) || !identity(value._id) || ids.has(value._id) || value.tenantId !== source.tenantId || value.sessionId !== sessionId ||
            !identity(value.speakerRef) || typeof value.text !== 'string' || !value.text.trim() || typeof value.tStart !== 'number' ||
            typeof value.tEnd !== 'number' || !Number.isFinite(value.tStart) || !Number.isFinite(value.tEnd) || value.tStart < 0 || value.tEnd < value.tStart) throw new Error('foreign or invalid selected turn');
        ids.add(value._id);
      }
      const gate = read(artifact === 'turns.json' ? 'validation.json' : 'video-stage.json').value;
      if (!record(gate)) throw new Error('missing current input validation');
      if (artifact === 'turns.json') {
        if (gate.status !== 'passed' || gate.transcriptValidated !== true || gate.turnsSha256 !== proof.inputHash) throw new Error('stale transcript validation');
      } else if (gate.status !== 'done' || !record(gate.outputs) || gate.outputs[artifact] !== proof.inputHash) throw new Error('stale combined validation');
    }
    for (const snapshot of snapshots) {
      if (!readRetentionBytes(snapshot.path, snapshot.bytes.length).equals(snapshot.bytes)) throw new Error('proof state changed during read');
    }
    return proof;
  } catch {
    throw new Error('required fresh strict index proof unavailable');
  }
}
