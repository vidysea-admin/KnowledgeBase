/** U0.10 frozen inputs. Default production judge consumes title/summary only. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportCalibrationReferences } from './calibration-review.mjs';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
export const ALGORITHM = 'exhaustive-session-relevance-judge-v1; createLlmScorer; default title+summary inputs; NOT selectNodes traversal, embeddings, hybrid, answer quality or /ask';
export function verifySourceBindings(root, sources) {
  return sources.every((source) => {
    try { const bytes = readFileSync(join(root, source.path)); return bytes.length === source.bytes && hash(bytes) === source.sha256; }
    catch { return false; }
  });
}
const idOk = (s) => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(s);
const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;
const CODE = ['apps/api/src/score.ts', 'packages/index/src/tree/build.ts', 'packages/index/src/eval/baseline.ts',
  'packages/ask/src/eval/calibration.ts', 'packages/ai/src/providers/ollama.ts', 'packages/ai/src/providers/gemini.ts',
  'packages/ai/src/index.ts', 'packages/ai/src/json.ts', 'packages/ai/src/provider.ts', 'packages/ai/src/gemini-quota.ts',
  'scripts/eval/calibration-review.mjs', 'scripts/eval/human-calibration.mjs',
  'scripts/eval/u010-corpus.mjs', 'scripts/eval/u010-state.mjs', 'scripts/eval/u010-baseline-audit.mjs',
  'scripts/eval/u010-baseline-run.mjs', 'scripts/eval/u010-provider.mjs'];
const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const implementationAtLoad = CODE.map((path) => {
  const bytes = readFileSync(join(MODULE_ROOT, path)); return { path, bytes: bytes.length, sha256: hash(bytes) };
});
/** A new corpus hash cannot relabel code already cached by this long-lived process. */
export const verifyLoadedImplementation = () => verifySourceBindings(MODULE_ROOT, implementationAtLoad);

export async function freezeCorpus(root, tenantId, options = {}) {
  requireValue(idOk(tenantId), 'explicit valid tenant required');
  const sources = [];
  const bound = (path, json = true) => {
    const bytes = readFileSync(join(root, path));
    sources.push({ path, bytes: bytes.length, sha256: hash(bytes) });
    return json ? JSON.parse(bytes.toString('utf8')) : bytes.toString('utf8');
  };
  const golden = bound('data/eval/golden-set.json');
  const provenance = bound('data/eval/golden-set-provenance.json');
  const diagnostics = bound('data/eval/golden-set-diagnostics.json');
  const semantic = bound('data/eval/golden-set-sibling-semantic.json');
  const code = new Map(CODE.map((path) => [path, bound(path, false)]));
  requireValue(Array.isArray(golden) && golden.length > 0, 'empty golden population');
  requireValue(new Set(golden.map((q) => q.id)).size === golden.length, 'duplicate question IDs');
  const nodes = [], excludedDirectories = [];
  for (const directory of readdirSync(join(root, 'data/toc-migrated'), { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name < b.name ? -1 : 1)) {
    requireValue(idOk(directory.name), 'invalid source directory');
    const prefix = `data/toc-migrated/${directory.name}`;
    const hasSession = existsSync(join(root, prefix, 'session.json')), hasPage = existsSync(join(root, prefix, 'session_page.json'));
    if (!hasSession && !hasPage) { excludedDirectories.push({ path: prefix, reason: 'no session.json or session_page.json; staged/non-session directory, not an evaluated candidate' }); continue; }
    requireValue(hasSession && hasPage, 'incomplete session/page input refused');
    const session = bound(`${prefix}/session.json`), page = bound(`${prefix}/session_page.json`);
    requireValue(session._id === directory.name && page.sessionId === session._id && page.tenantId === session.tenantId, 'contradictory session/page identity');
    requireValue(session.tenantId === tenantId, 'foreign corpus tenant refused');
    requireValue(nonempty(session.title) && typeof page.summary === 'string', 'missing title/summary');
    nodes.push({ sessionId: session._id, node: { node_id: session._id, title: session.title, summary: page.summary,
      level: 'session', children: [], evidence: { sessionRef: session._id } } });
  }
  const candidateIds = nodes.map((n) => n.sessionId);
  requireValue(candidateIds.length > 0 && new Set(candidateIds).size === candidateIds.length, 'empty/duplicate candidates');
  const questions = golden.map((q) => {
    requireValue(idOk(q.id) && nonempty(q.question) && candidateIds.includes(q.expectedSessionId), 'invalid/unresolved golden reference');
    return { id: q.id, query: q.question, expectedSessionId: q.expectedSessionId };
  });
  let references = null, humanVerification = null, humanProofInputs = null;
  if (options.reviewPacket) {
    const packet = bound(options.reviewPacket);
    references = await exportCalibrationReferences(packet, root); // refuses pending/drift before provider imports
    requireValue(options.humanEvidence && nonempty(bound(options.humanEvidence, false)), 'independent human-review evidence required');
    requireValue(references.tenantId === tenantId, 'foreign human references');
  }
  if (options.reviewExport) {
    requireValue(!options.reviewPacket && options.humanConfirmations && options.verifiedReceipt, 'complete independent human proof inputs required');
    const artifact = bound(options.reviewExport), confirmations = bound(options.humanConfirmations), receipt = bound(options.verifiedReceipt);
    const { validateHumanCalibrationInputs } = await import('./human-calibration.mjs');
    const verified = await validateHumanCalibrationInputs(artifact, confirmations, root, { receipt, trustedReceiptSha256: options.trustedReceiptSha256 });
    references = verified.references;
    requireValue(references.tenantId === tenantId, 'foreign verified human references');
    humanVerification = { operatorBound: true, verifiedReceiptSha256: verified.verifiedReceiptSha256,
      exportSha256: verified.exportSha256, confirmationsSha256: verified.confirmationsSha256, humanAttribution: verified.humanAttribution };
    humanProofInputs = { reviewExport: options.reviewExport, humanConfirmations: options.humanConfirmations, verifiedReceipt: options.verifiedReceipt };
  }
  const promptSource = code.get('apps/api/src/score.ts');
  const match = promptSource.match(/const JUDGE_SYSTEM_PROMPT = \[([\s\S]*?)\]\.join\(" "\);/);
  requireValue(match, 'production judge prompt declaration changed');
  const prompt = [...match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) => JSON.parse(`"${m[1]}"`)).join(' ');
  requireValue(nonempty(prompt), 'missing production prompt');
  const frozen = { format: 'u010-corpus-v1', tenantId, algorithm: ALGORITHM, nodeIdentity: 'review-style session ID; production judge consumes title+summary only',
    questionIds: questions.map((q) => q.id), candidateIds, questions, nodes, sources: sources.sort((a, b) => a.path < b.path ? -1 : 1),
    promptSha256: hash(prompt), provenance, diagnostics, semanticSha256: hash(JSON.stringify(semantic)), excludedDirectories, references, humanVerification, humanProofInputs,
    limitations: ['Generation provenance is recorded after the fact; same-vendor leakage and sibling ambiguity remain disclosed.',
      'Historical generation corpus count and current evaluated candidate count are distinct.',
      'Human reviewer file assertions are unauthenticated; independent human evidence must be assessed by checker.',
      'No production thresholds, routing, Mongo or jobs are changed.'] };
  return { ...frozen, sha256: hash(JSON.stringify(frozen)) };
}
