import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const started = Date.now();
const read = p => fs.readFileSync(p);
const parse = b => JSON.parse(b.toString('utf8'));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const lf = b => hash(b.toString('utf8').replace(/\r\n/g, '\n'));
const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
const canonical = v => JSON.stringify(sorted(v));
const eq = (a, b, why) => assert.equal(canonical(a), canonical(b), why);
const manifest = read('qa/manifests/parallel-extraction-adjudication.md').toString();
assert.match(manifest, /Status:\s*ready-for-check/);
assert.match(manifest, /Fix cycle:\s*0/);
const packetBytes = read('data/eval/extraction-adjudication-packet.json');
const p = parse(packetBytes);
const c = parse(read('data/eval/extraction-corpus.json'));
const r = parse(read('data/eval/extraction-reconciliation-reviewed.json'));
const expectedRevision = '907c9c9434f474622181bbc179f6ac90d75853b9';
const historicalRefs = c.cases.flatMap(item => ['turns', 'persisted'].map(kind =>
  `${expectedRevision}:${path.relative(process.cwd(), path.resolve('data/eval', item.artifacts[kind])).split(path.sep).join('/')}`));
if (process.argv.includes('--refs')) { console.log(historicalRefs.join('\n')); process.exit(0); }
// Native-to-native shell piping preserves Git blob bytes; no nested process spawning.
const gitBatch = fs.readFileSync(0), historicalBytes = new Map();
let batchOffset = 0;
for (const ref of historicalRefs) {
  const lineEnd = gitBatch.indexOf(10, batchOffset);
  assert.ok(lineEnd >= batchOffset, 'complete Git batch header required');
  const header = gitBatch.subarray(batchOffset, lineEnd).toString('utf8');
  batchOffset = lineEnd + 1;
  if (header === `${ref} missing`) { historicalBytes.set(ref, null); continue; }
  assert.match(header, /^[0-9a-f]{40} blob \d+$/);
  const size = Number(header.split(' ')[2]);
  const bytes = gitBatch.subarray(batchOffset, batchOffset + size);
  assert.equal(bytes.length, size);
  assert.equal(gitBatch[batchOffset + size], 10);
  historicalBytes.set(ref, bytes);
  batchOffset += size + 1;
}
assert.equal(batchOffset, gitBatch.length, 'no extra historical batch bytes');
assert.equal(p.provenance.originalMigrationRevision, expectedRevision);
assert.equal(p.status, 'HUMAN_ADJUDICATION_PREPARATION_ONLY');
let verifiedArtifacts = 0, verifiedPassages = 0;
function descriptor(d, bytes, expectedPath, historical = false) {
  assert.equal(d.path, expectedPath);
  assert.equal(d.sha256, hash(bytes));
  assert.equal(d.bytes, bytes.length);
  if (historical) { assert.equal(d.available, true); assert.equal(d.revision, expectedRevision); }
  else assert.equal(d.normalizedLfSha256, lf(bytes));
  verifiedArtifacts++;
}
descriptor(p.inputs.corpus, read('data/eval/extraction-corpus.json'), 'data/eval/extraction-corpus.json');
descriptor(p.inputs.reviewedReplacementProposals, read('data/eval/extraction-reconciliation-reviewed.json'), 'data/eval/extraction-reconciliation-reviewed.json');
const current = new Map(), historical = new Map(), failures = [], originalClaims = [];
const ids = c.cases.map(x => x.id);
eq(p.inventory.declaredCaseIds, ids, 'declared cases');
const inventoryPath = path.resolve('data/eval', c.inventoryDirectory);
const dirs = fs.readdirSync(inventoryPath, { withFileTypes: true }).filter(x => x.isDirectory()).map(x => x.name).sort();
eq(p.inventory.directories, dirs, 'actual directory inventory');
eq(p.inventory.absentDeclaredDirectories, ids.filter(id => !dirs.includes(id)), 'absent directories');
eq(p.inventory.undeclaredDirectories, dirs.filter(id => !ids.includes(id)), 'undeclared directories');
let turns = 0, invalidTimeSessions = 0, historicalAvailable = 0, historicalMissing = 0;
for (const item of c.cases) {
  const bytes = {}, rows = {}, missing = [];
  for (const [kind, rel] of Object.entries(item.artifacts)) {
    const file = path.resolve('data/eval', rel);
    const repoPath = path.relative(process.cwd(), file).split(path.sep).join('/');
    if (!fs.existsSync(file)) missing.push({ artifact: kind, path: repoPath, reason: 'artifact-missing' });
    else { bytes[kind] = read(file); rows[kind] = parse(bytes[kind]); }
  }
  if (missing.length) { failures.push({ caseId: item.id, missing }); continue; }
  current.set(item.sessionId, rows);
  const s = p.sessions.find(s => s.caseId === item.id);
  assert.ok(s, 'loaded session omitted');
  eq([s.tenantId, s.sessionId], [item.tenantId, item.sessionId]);
  eq([s.sourceBinding.caseId, s.sourceBinding.tenantId, s.sourceBinding.sessionId], [item.id, item.tenantId, item.sessionId]);
  assert.equal(s.sourceBindingSha256, hash(canonical(s.sourceBinding)));
  const old = {};
  for (const kind of ['turns', 'persisted']) {
    const repoPath = path.relative(process.cwd(), path.resolve('data/eval', item.artifacts[kind])).split(path.sep).join('/');
    descriptor(s.sourceBinding.artifacts[kind], bytes[kind], repoPath);
    const oldBytes = historicalBytes.get(`${expectedRevision}:${repoPath}`);
    if (oldBytes === null) {
      assert.equal(s.historicalArtifacts[kind].available, false);
      historicalMissing++;
      continue;
    }
    assert.ok(oldBytes, 'historical artifact request missing');
    descriptor(s.historicalArtifacts[kind], oldBytes, repoPath, true);
    old[kind] = parse(oldBytes);
    historicalAvailable++;
  }
  historical.set(item.sessionId, old);
  assert.equal(s.sourceTurns, rows.turns.length);
  assert.equal(s.sourceClaims, rows.persisted.length);
  const invalid = rows.turns.filter(t => !Number.isFinite(t.tStart) || !Number.isFinite(t.tEnd) || t.tStart < 0 || t.tEnd < t.tStart).map(t => t._id);
  eq(s.invalidTimeTurnIds, invalid);
  if (invalid.length) invalidTimeSessions++;
  turns += rows.turns.length;
  for (const claim of rows.persisted) originalClaims.push({ item, claim, s });
}
eq(p.acquisitionFailures, failures, 'all missing artifacts retained');
assert.equal(p.sessions.length, current.size);
assert.equal(p.claims.length, originalClaims.length);
assert.equal(new Set(p.claims.map(x => x.claimId)).size, originalClaims.length);
const unresolved = [], proposedIds = [];
let citations = 0;
function context(ctx, evidence) {
  eq([ctx.sessionId, ctx.turnId], [evidence.sessionId, evidence.turnId]);
  for (const [name, data] of [['current', current], ['originalMigration', historical]]) {
    const rows = data.get(evidence.sessionId)?.turns;
    const matches = rows?.filter(t => t._id === evidence.turnId && t.sessionId === evidence.sessionId) ?? [];
    eq(ctx[name].matches.map(x => x.record), matches, `${name} literal citation records`);
    assert.equal(ctx[name].available, matches.length > 0);
    if (matches.length) assert.equal(ctx[name].reason, null);
    else assert.ok(ctx[name].reason, 'missing passage needs explicit reason');
    const session = p.sessions.find(s => s.sessionId === evidence.sessionId);
    eq(ctx[name].artifact, name === 'current' ? session.sourceBinding.artifacts.turns : session.historicalArtifacts.turns);
    for (const match of ctx[name].matches) { assert.equal(match.textSha256, hash(match.record.text)); verifiedPassages++; }
  }
  const now = ctx.current.matches, old = ctx.originalMigration.matches;
  assert.equal(ctx.sameIdContentChanged, now.length > 0 && old.length > 0 && canonical(now.map(x => x.record)) !== canonical(old.map(x => x.record)));
}
for (const { item, claim, s } of originalClaims) {
  const q = p.claims.find(q => q.claimId === claim._id);
  eq(q.persistedClaim, claim, 'original persisted record must remain unchanged');
  eq([q.caseId, q.tenantId, q.sessionId], [item.id, item.tenantId, item.sessionId]);
  assert.equal(q.claimRecordSha256, hash(canonical(claim)));
  assert.equal(q.claimTextSha256, hash(claim.text));
  assert.equal(q.sourceBindingSha256, s.sourceBindingSha256);
  eq(q.historicalClaimRecords, historical.get(item.sessionId).persisted?.filter(x => x._id === claim._id) ?? []);
  assert.equal(q.literalCitationContexts.length, claim.evidence.length);
  for (let i = 0; i < claim.evidence.length; i++) {
    const e = claim.evidence[i]; context(q.literalCitationContexts[i], e); citations++;
    if (!(current.get(e.sessionId)?.turns ?? []).some(t => t._id === e.turnId && t.sessionId === e.sessionId))
      unresolved.push({ sessionId: e.sessionId, claimId: claim._id, turnId: e.turnId });
  }
  eq(q.humanAdjudication, { semanticSupport: 'unreviewed', factualTruth: 'unknown', omissions: 'unknown', topicPrecision: 'unknown', personPrecision: 'unknown', humanGold: false, bindingThresholds: null });
  const proposal = r.mappings.find(x => x.claimId === claim._id);
  if (!proposal) { assert.equal(q.replacementProposal, null); assert.equal(q.replacementReviewStatus, 'unreviewed'); continue; }
  proposedIds.push(claim._id);
  eq(q.replacementProposal.record, proposal);
  eq(q.replacementProposal.source, p.inputs.reviewedReplacementProposals);
  assert.equal(q.replacementReviewStatus, 'independently-reviewed-proposal');
  assert.equal(proposal.reviewStatus, 'INDEPENDENTLY_REVIEWED_REPLACEMENT_PROPOSAL');
  eq(proposal.originalEvidence, claim.evidence);
  assert.equal(proposal.claimTextSha256, hash(claim.text));
  assert.equal(proposal.currentTurnsSha256, s.sourceBinding.artifacts.turns.sha256);
  assert.equal(proposal.originalClaimsSha256, s.sourceBinding.artifacts.persisted.sha256);
  assert.equal(q.replacementProposal.currentCitationContexts.length, proposal.proposedEvidence.length);
  proposal.proposedEvidence.forEach((e, i) => {
    context(q.replacementProposal.currentCitationContexts[i], e);
    const t = current.get(e.sessionId).turns.find(t => t._id === e.turnId);
    assert.equal(e.turnTextSha256, hash(t.text));
    eq([e.tStart, e.tEnd, e.speakerRef], [t.tStart, t.tEnd, t.speakerRef]);
  });
}
eq(p.baseline.recorded, c.baseline);
eq(unresolved, c.baseline.unresolvedReferences);
eq(p.baseline.unresolvedReferences, unresolved);
assert.equal(p.baseline.originalReferenceIdentitiesRetained, true);
eq(p.unreviewedReplacementClaimIds, r.unreviewedClaimIds);
eq(r.unreviewedClaimIds.slice().sort(), originalClaims.map(x => x.claim._id).filter(id => !proposedIds.includes(id)).sort());
let byteMatches = 0, normalizedMatches = 0;
const pins = [];
for (const [sessionId, hashes] of Object.entries(c.baseline.inputHashes)) for (const [artifact, key] of [['turns', 'turnsSha256'], ['persisted', 'claimsSha256']]) {
  const b = read(`data/toc-migrated/${sessionId}/${artifact === 'turns' ? 'turns' : 'claims'}.json`);
  const row = { sessionId, artifact, expectedSha256: hashes[key], actualSha256: hash(b), normalizedLfSha256: lf(b), byteMatch: hash(b) === hashes[key], normalizedLfMatch: lf(b) === hashes[key] };
  pins.push(row); byteMatches += Number(row.byteMatch); normalizedMatches += Number(row.normalizedLfMatch);
}
eq(p.baseline.artifactPinComparisons, pins);
eq(p.semanticGold, { accepted: false, labels: [], expectedFactGold: null, topicEntityGold: null, personEntityGold: null, bindingThresholds: null, requiredDecision: p.semanticGold.requiredDecision });
assert.match(p.semanticGold.requiredDecision, /remain open/);
const coverage = { declaredCases: c.cases.length, inventoryDirectories: dirs.length, loadedCases: current.size, failedCases: failures.length, sourceTurns: turns, claims: originalClaims.length, citationOccurrences: citations, unresolvedCitationOccurrences: unresolved.length, independentlyReviewedReplacementProposals: proposedIds.length, unreviewedReplacementClaims: r.unreviewedClaimIds.length, humanAdjudicatedClaims: 0, invalidTimeSessions, baselineArtifactPins: pins.length, baselineByteMatches: byteMatches, baselineNormalizedLfMatches: normalizedMatches };
eq(p.coverage, coverage);
assert.equal(hash(read('data/eval/extraction-adjudication-packet.json')), hash(packetBytes), 'packet changed during check');
console.log(JSON.stringify({ verdict: 'PASS_PREPARATION_ONLY', cycleChecked: 0, packetSha256: hash(packetBytes), coverage, verifiedArtifacts, historicalAvailable, historicalMissing, verifiedLiteralPassages: verifiedPassages, elapsedMs: Date.now() - started, fullU22: 'GATED_SEMANTIC_GOLD_AND_THRESHOLDS_UNAPPROVED' }, null, 2));
