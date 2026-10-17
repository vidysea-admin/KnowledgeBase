/** Metadata preparation: never emits corpus text, calls models or modifies source data. */
import { readFileSync, realpathSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { assertDerivedArtifactsCurrent } from '../lib/transcript-provenance.mjs';
import { buildTrainingPlan, groundedTrainingRows, trainingId, trainingHash } from './plan.mjs';
import { assertPrivateTrainingPath, resolvePrivateTrainingPath } from './private-path.mjs';
export const TRAINING_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function exclusionReason(error) {
  const reasons = {'foreign tenant':'source-unavailable-for-selected-tenant','capture permission absent or revoked':'capture-permission-absent-or-revoked',
    'source owner prohibits training':'source-owner-training-prohibition','source permission expired or invalid':'source-permission-expired-or-invalid',
    'source identity mismatch':'source-identity-invalid','session identity mismatch':'session-identity-invalid',
    'claim identity mismatch':'claim-identity-invalid','claim evidence invalid':'claim-evidence-invalid','claim quote invalid':'claim-quote-invalid',
    'claim invalid':'claim-invalid','tenant mismatch':'source-unavailable-for-selected-tenant','invalid source hash':'source-hash-invalid',
    'input outside corpus root':'source-location-invalid','invalid derivation identity':'derivation-identity-invalid','invalid derived evidence':'derivation-evidence-invalid'};
  if (reasons[error?.message]) return reasons[error.message];
  if (error?.message?.startsWith('derived provenance absent;')) return 'derivation-proof-missing';
  if (error?.message?.startsWith('derived provenance stale or mismatched;')) return 'derivation-proof-not-current';
  if (error?.code === 'ENOENT') return 'source-files-missing';
  return 'source-artifacts-invalid';
}
export function containedTrainingPath(base, path) {
  assertPrivateTrainingPath(base);assertPrivateTrainingPath(path);
  const actual = realpathSync(path), rel = relative(realpathSync(base), actual);
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new Error('input outside corpus root');
  return actual;
}
/** Exact buffers validated by provenance are reused; error messages never contain source text. */
export function loadTrainingGenerations(root, config) {
  if (!trainingId(config?.tenantId) || !Array.isArray(config.sessions) || !config.sessions.length ||
    config.sessions.some(id => !trainingId(id)) || new Set(config.sessions).size !== config.sessions.length) throw new Error('invalid tenant or selected sessions');
  const corpus = resolve(root, 'data/toc-migrated'), generations = [], exclusions = [];
  for (const sessionId of [...config.sessions].sort()) {
    const dir = join(corpus, sessionId);
    try {
      const actual = containedTrainingPath(corpus, dir);
      // Check identity before loading detailed foreign-tenant rows or returning metadata.
      const sourcePath = containedTrainingPath(actual, join(actual, 'source.json'));
      const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
      if (source.tenantId !== config.tenantId) throw new Error('foreign tenant');
      const snapshot = new Map();
      const read = path => {const safe = containedTrainingPath(actual,path); if (!snapshot.has(safe)) snapshot.set(safe,readFileSync(safe)); return snapshot.get(safe);};
      const g = assertDerivedArtifactsCurrent(actual, read);
      g.hashes['derivation-provenance.json'] = trainingHash(read(join(actual,'derivation-provenance.json')));
      if (g.documents.session._id !== sessionId) throw new Error('session identity mismatch');
      groundedTrainingRows(g, config.tenantId);
      generations.push(g);
    } catch (error) {
      // Do not disclose another tenant's IDs, text, timing or path through error details.
      exclusions.push({sessionId, reason: exclusionReason(error)});
    }
  }
  return {generations, exclusions};
}
export function prepareTrainingPlan(root, config) {
  const {generations, exclusions} = loadTrainingGenerations(root, config);
  return buildTrainingPlan(generations, config, exclusions);
}
export function trainingArguments(argv, required) {
  const options = {};
  if (argv.length !== required.length * 2) throw new Error('provide each required option exactly once');
  for (let i=0; i<argv.length; i+=2) {
    if (!required.includes(argv[i]) || options[argv[i]] || !argv[i+1] || argv[i+1].startsWith('--')) throw new Error('invalid option');
    options[argv[i]] = argv[i+1];
  }
  if (required.some(k => !options[k])) throw new Error('missing option');
  return options;
}
export function readTrainingJson(path) {return JSON.parse(readFileSync(resolvePrivateTrainingPath(path), 'utf8'));}
export function writeTrainingMetadata(path, report) {
  const out=resolvePrivateTrainingPath(path);
  if (existsSync(out)) throw new Error('output exists');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx', mode: 0o600});
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {const o = trainingArguments(process.argv.slice(2), ['--config', '--out']);
    const p = prepareTrainingPlan(TRAINING_ROOT, readTrainingJson(o['--config'])); writeTrainingMetadata(o['--out'], p);
    console.log(JSON.stringify({status:p.status, fingerprint:p.fingerprint, counts:p.counts, splitReady:p.splitReady}));
  } catch {console.error('training preparation refused; check configuration and metadata output path'); process.exitCode=2;}
}
