import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, relative, isAbsolute } from 'node:path';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** Capture the verified loader input before indexing; finalize only if those same bytes and gates remain current. */
export function prepareWebinarIndexProof({ dir, sessionId, tenantId, inputArtifact, selectedTurns }) {
  if (inputArtifact !== 'knowledge-turns.json' && inputArtifact !== 'turns.json') throw new Error('invalid webinar index input artifact');
  const root = realpathSync(dir);
  const confined = name => {
    const path = realpathSync(join(root, name)), rel = relative(root, path);
    if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) throw new Error('index proof input outside session directory');
    return path;
  };
  const inputPath = confined(inputArtifact), bytes = readFileSync(inputPath), inputHash = sha(bytes);
  if (!Array.isArray(selectedTurns) || !isDeepStrictEqual(JSON.parse(bytes), selectedTurns)) throw new Error('index proof input differs from verified loader turns');
  const inputTurnCount = selectedTurns.length;
  const gateName = inputArtifact === 'turns.json' ? 'validation.json' : 'video-stage.json';
  const gatePath = confined(gateName), gateBytes = readFileSync(gatePath), gate = JSON.parse(gateBytes);
  if (inputArtifact === 'turns.json') {
    if (gate.status !== 'passed' || gate.transcriptValidated !== true || gate.turnsSha256 !== inputHash) throw new Error('speech-only index proof requires current passed transcript validation');
  } else if (gate.status !== 'done' || gate.outputs?.[inputArtifact] !== inputHash) {
    throw new Error('combined index proof requires current verified video stage');
  }
  return result => {
  const completion = result?.completion;
  if (result?.sessionId !== sessionId || completion?.version !== 2 || completion.strict !== true ||
      completion.complete !== true || completion.treeWritten !== true || !completion.generation ||
      !Number.isInteger(completion.turnCount) || completion.turnCount !== inputTurnCount || completion.turnCount <= 0 || result.summary?.degraded ||
      result.claims?.degraded || result.chunks?.skipped || !(result.chunks?.written > 0)) {
    throw new Error('required webinar indexing incomplete; no completion proof emitted');
  }
  if (confined(inputArtifact) !== inputPath || sha(readFileSync(inputPath)) !== inputHash ||
      confined(gateName) !== gatePath || sha(readFileSync(gatePath)) !== sha(gateBytes)) throw new Error('index proof input or validation changed during indexing');
  return { version: 2, sessionId, tenantId, inputArtifact, inputHash, generation: completion.generation,
    status: 'done', strict: true, summary: 'done', claims: 'done', chunks: 'done', tree: 'done',
    turnCount: completion.turnCount, semanticSupport: 'passed' };
  };
}
