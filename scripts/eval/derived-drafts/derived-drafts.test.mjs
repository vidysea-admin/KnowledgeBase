import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {consensusScore, consensusLabel, t022Draft, u22Draft, assertNoHumanGold, safeOutPath, writeSidecar, gatherVotes, run, parseEnvFile, u22Prompt, resolveCitation, resolveCitations, DRAFT_LABEL, OUT_DIR} from './derived-drafts.mjs';
import {loadBundle} from '../extraction-review.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PACKET_PATH = join(process.env.DD_DATA_ROOT ?? ROOT, 'data/eval/calibration-human-review.json');
const packet = JSON.parse(readFileSync(PACKET_PATH, 'utf8'));
// Pinned review sources are byte-exact (mixed LF/CRLF); a fresh LF/CRLF-normalised lane checkout cannot satisfy them, so tests may read a byte-exact tree via DD_DATA_ROOT.
const DATA_ROOT = process.env.DD_DATA_ROOT ?? ROOT;
const bundle = loadBundle(DATA_ROOT);
const mock = (provider, model, fn) => ({provider, model, judge: async (i) => fn(i)});

test('score consensus: agreement, disagreement, insufficient', () => {
  assert.equal(consensusScore([{model:'a',score:0.8},{model:'b',score:0.7}]).agreement, 'agree');
  assert.equal(consensusScore([{model:'a',score:0.8},{model:'b',score:0.7}]).score, 0.75);
  const d = consensusScore([{model:'a',score:0.9},{model:'b',score:0.2}]);
  assert.equal(d.agreement, 'disagree'); assert.ok(d.flags.includes('models-disagree'));
  const one = consensusScore([{model:'a',score:0.9},{model:'b',score:null}]);
  assert.equal(one.score, null); assert.ok(one.flags.includes('insufficient-models'));
  assert.equal(consensusScore([{model:'a',score:0.1},{model:'b',score:0.4},{model:'c',score:0.3}]).score, 0.3);
});
test('label consensus: unanimous, majority, tie, invalid', () => {
  assert.equal(consensusLabel([{label:'supported'},{label:'supported'}]).agreement, 'agree');
  const m = consensusLabel([{label:'supported'},{label:'unsupported'},{label:'supported'}]);
  assert.equal(m.label, 'supported'); assert.equal(m.agreement, 'majority'); assert.ok(m.flags.includes('models-disagree'));
  const t = consensusLabel([{label:'supported'},{label:'unsupported'}]);
  assert.equal(t.label, null); assert.ok(t.flags.includes('no-majority'));
  assert.equal(consensusLabel([{label:'supported'},{label:'bogus'}]).label, null);
});
test('drafts are labelled derived and never humanGold or approved', () => {
  const t = t022Draft(packet.items[0], [{model:'a',score:0.8,rationale:'x'},{model:'b',score:0.7,rationale:'y'}]);
  assert.equal(t.aiDraft.label, DRAFT_LABEL); assert.equal(t.humanGold, false);
  assert.deepEqual(t.humanReview, {score:null,rationale:null,approvedBy:null,approvedAt:null});
  const u = u22Draft(bundle.entries[0], [{model:'a',label:'unsupported',rationale:'r'},{model:'b',label:'unsupported',rationale:'s'}]);
  assert.equal(u.aiDraft.literalCitationSupport, 'unsupported'); assert.equal(u.humanGold, false);
  assert.equal(u.humanReview.status, 'unreviewed'); assert.equal(u.bindingThresholds, null);
  assertNoHumanGold(t); assertNoHumanGold(u);
});
test('assertNoHumanGold refuses every promotion shape', () => {
  for (const bad of [{humanGold:true},{a:{humanGoldVerified:true}},{items:[{humanReview:{approvedBy:'Umesh'}}]},{humanReview:{approvedAt:'2026-01-01'}},{humanReview:{decision:'approve-draft'}},{status:'approved'}])
    assert.throws(() => assertNoHumanGold(bad), /refused/);
  assertNoHumanGold({humanGold:false,humanReview:{approvedBy:null,approvedAt:null,decision:null}});
});
test('full mocked T-022 run over the real 30-item packet: ids/hashes preserved, packet bytes untouched, no gold', async () => {
  const before = readFileSync(PACKET_PATH);
  const judges = [mock('ollama','glm-5.3-flash',()=>({score:0.9,rationale:'a'})), mock('ollama','deepseek-v4.1-flash',(i)=>({score:i.id==='review-001'?0.1:0.85,rationale:'b'})), mock('gemini','gemini-2.5-flash',()=>({score:0.2,rationale:'c'}))];
  const doc = await run('t022', {items: packet.items, judges, maxCalls: 90});
  assert.equal(doc.items.length, 30); assert.equal(doc.humanGold, false);
  assert.deepEqual(doc.items.map(d=>d.id), packet.items.map(i=>i.id)); assert.deepEqual(doc.items.map(d=>d.inputSha256), packet.items.map(i=>i.inputSha256));
  const first = doc.items[0].aiDraft; assert.equal(first.agreement, 'disagree'); assert.equal(first.perModel.length, 3);
  assert.equal(doc.items[1].aiDraft.perModel.length, 2);
  assert.equal(doc.calls.used, 30*2 + 1); assertNoHumanGold(doc);
  assert.ok(readFileSync(PACKET_PATH).equals(before));
});
test('full mocked U2.2 run over the real 72 claims; claims with no current passage get a rule, no model call', async () => {
  let calls = 0;
  const judges = [mock('ollama','glm-5.3-flash',()=>{calls++;return {label:'supported',rationale:'g'};}), mock('ollama','deepseek-v4.1-flash',()=>{calls++;return {label:'partially_supported',rationale:'d'};}), mock('gemini','gemini-2.5-flash',()=>{calls++;return {label:'partially_supported',rationale:'m'};})];
  const doc = await run('u22', {items: bundle.entries, judges, maxCalls: 216});
  assert.equal(doc.items.length, 72); assertNoHumanGold(doc);
  assert.deepEqual(doc.items.map(d=>d.claimId), bundle.entries.map(e=>e.claimId));
  const ruled = bundle.entries.filter(e=>!resolveCitations(e).some(c=>c.record)).length;
  assert.equal(doc.items.filter(d=>d.aiDraft.perModel[0].model.startsWith('rule/')).length, ruled);
  assert.equal(calls, (72-ruled)*3);
  assert.equal(doc.items.find(d=>!d.aiDraft.perModel[0].model.startsWith('rule/')).aiDraft.literalCitationSupport, 'partially_supported');
  assert.ok(u22Prompt(bundle.entries[0]).includes('Claim:'));
});
test('cap is enforced before each call and failures become flagged non-votes', async () => {
  const budget = {used:0,max:1,capReached:false}; let n = 0;
  const votes = await gatherVotes({}, [mock('ollama','a',()=>{n++;return {score:0.5};}), mock('ollama','b',()=>{n++;return {score:0.5};})], budget, 'score');
  assert.equal(n, 1); assert.equal(budget.capReached, true); assert.equal(votes.length, 1);
  const f = await gatherVotes({}, [mock('ollama','a',()=>{throw new Error('boom');}), mock('ollama','b',()=>({score:0.5}))], {used:0,max:9}, 'score');
  assert.equal(consensusScore(f).flags.includes('insufficient-models'), true);
});
test('output path guard: inside derived-drafts only, no overwrite, wx write', () => {
  const root = mkdtempSync(join(tmpdir(), 'dd-'));
  try {
    for (const bad of ['data/eval/calibration-human-review.json', `${OUT_DIR}/../x.json`, '', `${OUT_DIR}/x.txt`, join(root,'abs.json')]) assert.throws(() => safeOutPath(bad, root), /refused/);
    const p = safeOutPath(`${OUT_DIR}/ok.json`, root); writeSidecar(p, {humanGold:false});
    assert.throws(() => safeOutPath(`${OUT_DIR}/ok.json`, root), /exists/);
    assert.throws(() => writeSidecar(join(root, OUT_DIR, 'g.json'), {humanGold:true}), /refused/);
    assert.equal(existsSync(join(root, OUT_DIR, 'g.json')), false);
  } finally { rmSync(root, {recursive:true, force:true}); }
});
test('env parsing keeps only the two provider keys', () => {
  assert.deepEqual(parseEnvFile('A=1\nOLLAMA_API_KEY="k1"\nGEMINI_API_KEY=k2\nOTHER=z'), {OLLAMA_API_KEY:'k1',GEMINI_API_KEY:'k2'});
});

const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const mkCtx = (over = {}) => {
  const rec = (text) => ({_id: 'S-t1', tenantId: 'toc', sessionId: 'S', speakerRef: 'spk:0', tStart: 1, tEnd: 2, text});
  return {sessionId: 'S', turnId: 'S-t1', sameIdContentChanged: true,
    current: {available: true, matches: [{record: rec('NEW text'), textSha256: sha('NEW text')}]},
    originalMigration: {available: true, artifact: {revision: 'rev1'}, matches: [{record: rec('OLD text'), textSha256: sha('OLD text')}]}, ...over};
};
test('U2.2 re-anchoring: archived original is judged when the id content changed; source and text hash recorded', async () => {
  const r = resolveCitation(mkCtx());
  assert.equal(r.citationSource, 'archived-original'); assert.equal(r.record.text, 'OLD text'); assert.equal(r.textSha256, sha('OLD text'));
  const entry = {claimId: 'c1', claimRecordSha256: 'x', sourceBindingSha256: 'y', persistedClaim: {text: 'claim'}, literalCitationContexts: [mkCtx()]};
  assert.ok(u22Prompt(entry).includes('OLD text') && !u22Prompt(entry).includes('NEW text'));
  const prompts = [];
  const j = (m) => mock('ollama', m, (e) => {prompts.push(u22Prompt(e)); return {label: 'supported', rationale: 'r'};});
  const doc = await run('u22', {items: [entry], judges: [j('a'), j('b')], maxCalls: 9});
  const d = doc.items[0].aiDraft; assert.equal(d.citationSource, 'archived-original'); assert.equal(d.literalCitationSupport, 'supported');
  assert.deepEqual(d.citations, [{turnId: 'S-t1', citationSource: 'archived-original', textSha256: sha('OLD text'), artifactRevision: 'rev1'}]);
  assert.equal(doc.items[0].humanGold, false); assertNoHumanGold(doc);
});
test('U2.2 re-anchoring: unchanged current text is used when no archive; changed current alone is never used', () => {
  const noArch = {originalMigration: {available: false, matches: []}};
  assert.equal(resolveCitation(mkCtx({...noArch, sameIdContentChanged: false})).citationSource, 'current');
  assert.equal(resolveCitation(mkCtx({...noArch, sameIdContentChanged: true})).citationSource, null);
});
test('U2.2 re-anchoring: unresolvable citation (missing, tampered hash, wrong id) keeps the unavailable rule vote with zero model calls', async () => {
  const bad = [mkCtx({originalMigration: {available: false, matches: []}}),
    mkCtx({originalMigration: {available: true, matches: [{record: {_id: 'S-t1', text: 'OLD text'}, textSha256: sha('tampered')}]}, current: {available: false, matches: []}}),
    mkCtx({originalMigration: {available: true, matches: [{record: {_id: 'S-t9', text: 'OLD text'}, textSha256: sha('OLD text')}]}, current: {available: false, matches: []}})];
  let calls = 0; const j = (m) => mock('ollama', m, () => {calls++; return {label: 'supported', rationale: 'r'};});
  const items = bad.map((c, i) => ({claimId: 'c' + i, claimRecordSha256: 'x', sourceBindingSha256: 'y', persistedClaim: {text: 'claim'}, literalCitationContexts: [c]}));
  const doc = await run('u22', {items, judges: [j('a'), j('b')], maxCalls: 9});
  assert.equal(calls, 0); assert.equal(doc.calls.used, 0);
  for (const d of doc.items) { assert.equal(d.aiDraft.literalCitationSupport, 'unavailable'); assert.equal(d.aiDraft.citationSource, null); assert.ok(d.aiDraft.perModel[0].model.startsWith('rule/')); }
});
test('U2.2 real packet: every one of the 80 citations resolves to a hash-verified archived original', () => {
  const all = bundle.entries.flatMap(resolveCitations);
  assert.equal(all.length, 80); assert.ok(all.every(c => c.citationSource === 'archived-original' && c.textSha256 === sha(c.record.text)));
});
