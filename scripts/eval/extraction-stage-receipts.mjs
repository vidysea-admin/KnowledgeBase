#!/usr/bin/env node
/** Read-only, text-free receipts for the existing source-bound extraction corpus.
 * No stage is reconstructed from a later stage. Exit 2 means requested evidence
 * is unavailable, not that the extraction quality has failed an approved gate. */
import {readFileSync, realpathSync} from 'node:fs';
import {resolve, dirname, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadBundle} from './extraction-review.mjs';
import {loadManifest} from '../eval-extraction.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STAGES = ['raw', 'parsed', 'filtered', 'persisted'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function requireThat(ok, reason) {if (!ok) throw new Error(reason);}
function local(root, path) {
  requireThat(typeof path === 'string' && !isAbsolute(path), 'invalid-bound-path');
  const lexical = relative(resolve(root), resolve(root, path));
  requireThat(lexical !== '' && !isAbsolute(lexical) && !lexical.startsWith('..'), 'outside-root');
  const real = realpathSync(resolve(root, path)), rel = relative(realpathSync(root), real);
  requireThat(rel !== '' && !isAbsolute(rel) && !rel.startsWith('..'), 'outside-root');
  return real;
}

/** Always reload the bound corpus and evaluator; never accept caller-supplied measurements. */
export function stageReceipts(root = ROOT) {
  requireThat(arguments.length <= 1, 'alternate-corpus-refused');
  const bundle = loadBundle(root), path = local(root, bundle.corpusBinding.path);
  const bytes = readFileSync(path);
  requireThat(bytes.length === bundle.corpusBinding.bytes && sha(bytes) === bundle.corpusBinding.sha256, 'corpus-drift');
  const manifest = JSON.parse(bytes);
  const boundArtifacts = new Map(bundle.sessions.flatMap(session => Object.values(session.sourceBinding.artifacts)
    .map(artifact => [local(root, artifact.path), artifact.sha256])));
  // Check every existing declared artifact, including symlink targets, before replay.
  // Missing files remain acquisition failures in the evaluator, rather than fake stages.
  for (const entry of manifest.cases) for (const artifact of Object.values(entry.artifacts ?? {})) {
    requireThat(typeof artifact === 'string' && !isAbsolute(artifact), 'invalid-bound-path');
    try {
      const target = local(root, relative(root, resolve(dirname(path), artifact)));
      // Zero-claim acquired sessions need not occur in the claim-review packet.
      // Their current bytes are fingerprinted below, never called packet-bound.
    }
    catch (error) {if (error.code !== 'ENOENT') throw error;}
  }
  const measurement = loadManifest(path);
  requireThat(measurement.manifestSha256 === bundle.corpusBinding.sha256, 'corpus-drift');
  for (const artifact of measurement.artifacts) {
    const entry = manifest.cases.find(c => c.id === artifact.id);
    for (const [kind, hash] of Object.entries(artifact.hashes)) {
      const target = local(root, relative(root, resolve(dirname(path), entry.artifacts[kind])));
      requireThat(!boundArtifacts.has(target) || hash === boundArtifacts.get(target), 'stage-artifact-drift');
    }
  }
  requireThat(measurement.cases.every(c => !c.semantic.measured && !c.semantic.factsMeasured && Object.values(c.entities).every(e => !e.measured)), 'labelled-corpus-refused');
  const stages = Object.fromEntries(STAGES.map(stage => {
    const available = measurement.cases.filter(c => c.stages[stage].available);
    return [stage, {availableCases: available.length, unavailableCases: measurement.declaredCases - available.length,
      complete: available.length === measurement.declaredCases, rows: available.length ? available.reduce((n, c) => n + c.stages[stage].rows, 0) : null}];
  }));
  return {version: 1, kind: 'source-bound-extraction-stage-receipts',
    binding: {sourcePacketSha256: bundle.sourcePacketSha256, draftIndexSha256: bundle.draftIndexSha256, corpusSha256: measurement.manifestSha256},
    acquisition: {declaredCases: measurement.declaredCases, acquiredCases: measurement.loadedCases,
      failedCases: measurement.failures.length, inventoryMeasured: measurement.inventory.measured,
      undeclaredDirectories: measurement.inventory.undeclared.length, outsideInventory: measurement.inventory.outsideInventory.length},
    stages,
    persisted: {claims: measurement.summary.stages.persisted.rows,
      citations: measurement.summary.stages.persisted.invalidCitationRate.denominator,
      invalidCitations: measurement.summary.stages.persisted.invalidCitationRate.numerator},
    artifacts: measurement.artifacts.map(a => ({caseSha256: sha(a.id), artifactHash: a.artifactHash, hashes: a.hashes,
      packetBound: Object.entries(a.hashes).every(([kind, hash]) => {
        const entry = manifest.cases.find(c => c.id === a.id);
        return boundArtifacts.get(local(root, relative(root, resolve(dirname(path), entry.artifacts[kind])))) === hash;
      })})),
    complete: measurement.complete, humanGold: false, semanticLabelsImported: 0, bindingThresholds: null};
}

/** Consumers must explicitly check requested stages. Missing acquisition counts too. */
export function requireStages(receipt, requested = STAGES) {
  requireThat(Array.isArray(requested) && requested.length > 0 && new Set(requested).size === requested.length && requested.every(s => STAGES.includes(s)), 'invalid-stage-request');
  const unavailable = requested.filter(stage => !receipt.stages[stage].complete);
  return {accepted: unavailable.length === 0, unavailableStages: unavailable,
    reason: unavailable.length ? 'stage-evidence-unavailable' : null, humanGold: false, bindingThresholds: null};
}

export function main(args = process.argv.slice(2), emit = value => console.log(JSON.stringify(value))) {
  try {
    requireThat(args.length === 0 || (args.length === 2 && args[0] === '--require'), 'invalid-arguments');
    const requested = args.length ? args[1].split(',') : STAGES;
    // Validate stage names before touching source artifacts.
    requireStages({stages: Object.fromEntries(STAGES.map(s => [s, {complete: false}]))}, requested);
    const receipt = stageReceipts(), request = requireStages(receipt, requested);
    emit({receipt, request}); return request.accepted ? 0 : 2;
  } catch {emit({version: 1, complete: false, failure: 'stage-receipt-refused', humanGold: false}); return 2;}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
