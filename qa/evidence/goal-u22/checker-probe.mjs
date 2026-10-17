import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {loadBundle, validateExport, bridge} from '../../../scripts/eval/extraction-review.mjs';

const start = new Date();
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const candidate={
  'scripts/eval/extraction-review.mjs':'0eae318240d991b626ada193aa39fe9f213de068b50d2db22c5fed7358f08a44',
  'scripts/eval/extraction-review.test.mjs':'9d051d69491895146bfe5daf39cb3e7a4a7e8d7dde397f084e335e11a13f4c83',
  'data/eval/u22-live-review/review.html':'0c258f901bc4086bd3d973c927a6107c2a2644389cf12480fed4fd27bdadfe58',
  'data/eval/u22-live-review/pending-declarations.json':'c7d81e9dbbbd167f592da9742aa82a5e51030b804e0e8ce4022e545f5c3cedc2',
  'data/eval/u22-live-review/replay.json':'0ed24f5f893529a278972c52b43f2dfd989431bd28f6392af99cdeb5432a6f4c',
  'data/eval/u22-live-review/README.md':'be08345087350f4f9a6685dd8721c0b11cd61dfb8ecb3b0a4f100eaf59e62f23'
};
for(const [path,expected] of Object.entries(candidate)) assert.equal(hash(path),expected,`candidate ${path}`);
const baseline = JSON.parse(readFileSync('qa/evidence/goal-u22/baseline-hashes.json','utf8').replace(/^\uFEFF/,''));
for (const item of baseline) assert.equal(hash(item.path), item.sha256, `unchanged source ${item.path}`);
const bundle = loadBundle();
const html = readFileSync('data/eval/u22-live-review/review.html','utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1);
class Element {
  constructor(tag) {this.tag = tag; this.children = []; this.value = ''; this.textContent = ''; this.attributes = {};}
  append(...items) {this.children.push(...items);}
  setAttribute(k,v) {this.attributes[k] = v;}
  click() {this.clicked = true;}
  remove() {this.removed = true;}
}
const nodes = {items:new Element('main'),coverage:new Element('p'),export:new Element('button')};
const downloads = [], body = new Element('body');
const document = {getElementById:id => nodes[id], createElement:tag => new Element(tag), body};
const URL = {createObjectURL:blob => {downloads.push(blob); return 'blob:checker';},revokeObjectURL:() => {}};
const review = runInNewContext(scripts[0][1], {document,structuredClone,Blob,URL,Date,Map});
assert.equal(nodes.items.children.length, 72);
assert.equal(validateExport(bundle, review).pending, 72);
let originalContexts = 0;
for (let i=0;i<72;i++) {
  const card = nodes.items.children[i], expected = bundle.entries[i];
  assert.equal(card.children[1].textContent, expected.persistedClaim.text);
  const detail = card.children.find(e => e.tag === 'details');
  const source = JSON.parse(detail.children.find(e => e.tag === 'pre').textContent);
  assert.deepEqual(source.literalCitationContexts, expected.literalCitationContexts);
  assert.deepEqual(source.replacementProposal, expected.replacementProposal);
  assert.deepEqual(source.sourceSession, bundle.sessions.find(s => s.sessionId === expected.sessionId));
  originalContexts += source.literalCitationContexts.length;
}
assert.equal(originalContexts,80);
const first = nodes.items.children[0], select = first.children.find(e=>e.tag==='select');
const rationale = first.children.find(e=>e.tag==='textarea'), buttons=first.children.filter(e=>e.tag==='button');
buttons[0].onclick(); assert.equal(review.entries[0].status,'pending');
select.value='supported'; rationale.value='CHECKER SYNTHETIC DECLARATION: fixture only, no actual human approval.';
buttons[0].onclick(); assert.equal(review.entries[0].decision,'override-draft');
assert.equal(review.entries[1].status,'pending');
nodes.export.onclick();
const exported = JSON.parse(await downloads[0].text());
assert.equal(exported.entries.length,72);
assert.equal(validateExport(bundle,exported).declared,1);
assert.equal(exported.humanGold,false);
assert.equal(body.children[0].clicked,true); assert.equal(body.children[0].removed,true);
let refusals=0;
for (const alter of [r=>r.entries.splice(4,1), r=>r.entries[2].sessionId='foreign', r=>r.entries[0].reviewedAt='2026-02-29T00:00:00.000Z', r=>r.entries[1].rationale='auto-approved', r=>r.humanGold=true, r=>r.bindingThresholds=0, r=>r.entries[0].decision='approve-draft', r=>r.entries[0].approvedBy='Umesh', r=>r.entries[0].literalCitationSupport={status:'supported'}]) {
  const changed=structuredClone(exported); alter(changed); assert.throws(()=>validateExport(bundle,changed)); refusals++;
}
const report=bridge(bundle,exported);
assert.throws(()=>bridge(bundle,exported,'data/eval/extraction-corpus.json'),/alternate-corpus-refused/); refusals++;
const wrongCorpusLength=structuredClone(bundle); wrongCorpusLength.corpusBinding.bytes++;
assert.throws(()=>bridge(wrongCorpusLength,exported),/corpus-drift/); refusals++;
assert.equal(report.humanGold,false); assert.equal(report.status,'HUMAN_GATE');
assert.equal(report.declarations.semanticLabelsImported,0);
assert.equal(report.measurement.summary.stages.persisted.rows,72);
assert.equal(report.measurement.summary.stages.persisted.invalidCitationRate.denominator,80);
assert.equal(report.measurement.summary.stages.persisted.invalidCitationRate.numerator,14);
assert.equal(report.measurement.summary.semantic.labeledCases,0);
assert.equal(report.measurement.summary.semantic.factMeasuredCases,0);
assert.equal(report.measurement.complete,false);
assert.ok(report.measurement.failures.length>0);
assert.ok(report.stageGaps.every(c=>c.unavailableStages.some(s=>s.stage==='raw')));
buttons[1].onclick(); assert.equal(validateExport(bundle,review).pending,72);
for (const item of baseline) assert.equal(hash(item.path),item.sha256);
for(const [path,expected] of Object.entries(candidate)) assert.equal(hash(path),expected,`final candidate ${path}`);
writeFileSync('qa/evidence/goal-u22/checked-final-hashes.json',JSON.stringify(candidate,null,2)+'\n');
const result={passed:true,start:start.toISOString(),end:new Date().toISOString(),sourceHashes:baseline.length,cards:72,contexts:80,declarationsSynthetic:1,refusals,resetPending:72,gold:0,semanticLabels:0,persistedClaims:72,citations:80,unresolved:14,loadedCases:report.measurement.loadedCases,acquisitionFailures:report.measurement.failures.length,rawMissing:report.stageGaps.length};
writeFileSync('qa/evidence/goal-u22/independent-probe-result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
