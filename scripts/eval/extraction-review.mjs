#!/usr/bin/env node
/** Local individual declarations only. No declaration is authenticated human gold. */
import {readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync} from 'node:fs';
import {resolve, dirname, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadManifest} from '../eval-extraction.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DRAFTS = 'data/eval/extraction-draft-review';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const canonical = x => JSON.stringify(sort(x));
function sort(x) {return Array.isArray(x) ? x.map(sort) : object(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sort(x[k])])) : x;}
function requireThat(ok, reason) {if (!ok) throw new Error(reason);}
function exactKeys(value, keys) {requireThat(object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'), 'unexpected-fields');}
function safeFile(root, path) {
  requireThat(typeof path === 'string' && path.length < 512 && !isAbsolute(path), 'invalid-path');
  const target = resolve(root, path), realRoot = realpathSync(root), real = realpathSync(target), rel = relative(realRoot, real);
  requireThat(rel !== '' && !isAbsolute(rel) && !rel.startsWith('..'), 'outside-root'); return real;
}
export function loadBundle(root = ROOT) {
  let bytesRead = 0;
  const read = path => {const b = readFileSync(safeFile(root, path)); bytesRead += b.length; requireThat(b.length <= 16 * 1024 * 1024 && bytesRead <= 64 * 1024 * 1024, 'size-limit'); return b;};
  const indexBytes = read(`${DRAFTS}/index.json`), index = JSON.parse(indexBytes), packetBytes = read(index.sourcePacket.path);
  requireThat(sha(packetBytes) === index.sourcePacket.sha256, 'packet-drift');
  const packet = JSON.parse(packetBytes), entries = [], sessions = new Map();
  requireThat(index.claimCount === 72 && packet.claims.length === 72 && index.batches.length === 8, 'invalid-inventory');
  for (const descriptor of index.batches) {
    const b = read(`${DRAFTS}/${descriptor.path}`); requireThat(sha(b) === descriptor.sha256, 'batch-drift');
    const batch = JSON.parse(b); requireThat(batch.humanGold === false && batch.entries.length === descriptor.itemCount, 'invalid-batch');
    for (const session of batch.sourceSessions) sessions.set(session.sessionId, session);
    entries.push(...batch.entries);
  }
  const ids = new Set();
  for (let i = 0; i < entries.length; i++) {
    const item = entries[i], original = packet.claims[i];
    requireThat(item.ordinal === i + 1 && item.claimId === original.claimId && !ids.has(item.claimId), 'claim-inventory-drift'); ids.add(item.claimId);
    for (const key of ['claimRecordSha256', 'sourceBindingSha256', 'persistedClaim', 'literalCitationContexts', 'replacementProposal']) requireThat(canonical(item[key]) === canonical(original[key]), 'claim-context-drift');
    requireThat(item.sourcePacketSha256 === index.sourcePacket.sha256 && sha(canonical(item.persistedClaim)) === item.claimRecordSha256, 'claim-binding-drift');
    requireThat(item.humanGold === false && item.bindingThresholds === null && canonical(item.humanReview) === canonical({status:'unreviewed',approvedBy:null,approvedAt:null,decision:null,sourcePacketSha256:null}), 'source-already-reviewed');
  }
  for (const session of sessions.values()) {
    requireThat(sha(canonical(session.sourceBinding)) === session.sourceBindingSha256, 'source-binding-drift');
    for (const artifact of Object.values(session.sourceBinding.artifacts)) {
      const b = read(artifact.path); requireThat(b.length === artifact.bytes && sha(b) === artifact.sha256, 'source-drift');
    }
  }
  requireThat(entries.reduce((n, e) => n + e.literalCitationContexts.length, 0) === 80 && entries.filter(e => e.replacementProposal).length === 7, 'citation-inventory-drift');
  return {version:1, sourcePacketSha256:index.sourcePacket.sha256, draftIndexSha256:sha(indexBytes), corpusBinding:packet.inputs.corpus, entries, sessions:[...sessions.values()], humanGold:false, bindingThresholds:null};
}
export function pendingExport(bundle) {
  return {version:1, kind:'individual-extraction-review-declarations', sourcePacketSha256:bundle.sourcePacketSha256, draftIndexSha256:bundle.draftIndexSha256, humanGold:false, bindingThresholds:null,
    entries:bundle.entries.map(e => ({claimId:e.claimId,sessionId:e.sessionId,claimRecordSha256:e.claimRecordSha256,sourceBindingSha256:e.sourceBindingSha256,
      status:'pending',decision:null,literalCitationSupport:null,reviewer:null,reviewedAt:null,rationale:null}))};
}
export function validateExport(bundle, review) {
  exactKeys(review, ['version','kind','sourcePacketSha256','draftIndexSha256','humanGold','bindingThresholds','entries']);
  const expected = pendingExport(bundle);
  for (const key of ['version','kind','sourcePacketSha256','draftIndexSha256','humanGold','bindingThresholds']) requireThat(review[key] === expected[key], 'review-binding-or-promotion');
  requireThat(Array.isArray(review.entries) && review.entries.length === 72, 'incomplete-inventory');
  const byId = new Map(expected.entries.map(e => [e.claimId, e])), seen = new Set(); let declared = 0;
  for (const entry of review.entries) {
    exactKeys(entry, Object.keys(expected.entries[0])); const original = byId.get(entry.claimId);
    requireThat(original && !seen.has(entry.claimId), 'unknown-or-duplicate-item'); seen.add(entry.claimId);
    for (const key of ['sessionId','claimRecordSha256','sourceBindingSha256']) requireThat(entry[key] === original[key], 'item-binding-drift');
    if (entry.status === 'pending') {for (const key of ['decision','literalCitationSupport','reviewer','reviewedAt','rationale']) requireThat(entry[key] === null, 'inconsistent-pending');}
    else {
      requireThat(entry.status === 'declared' && ['approve-draft','override-draft'].includes(entry.decision), 'invalid-decision');
      requireThat(['supported','partially_supported','unsupported','unavailable'].includes(entry.literalCitationSupport), 'invalid-support');
      requireThat(entry.reviewer === 'Umesh' && typeof entry.reviewedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.reviewedAt) && Number.isFinite(Date.parse(entry.reviewedAt)) && new Date(entry.reviewedAt).toISOString() === entry.reviewedAt, 'invalid-reviewer-date');
      requireThat(typeof entry.rationale === 'string' && entry.rationale.trim().length > 0 && entry.rationale.length <= 4000, 'invalid-rationale');
      const item = bundle.entries.find(e => e.claimId === entry.claimId);
      requireThat(entry.decision !== 'approve-draft' || entry.literalCitationSupport === item.aiDraft.literalCitationSupport, 'draft-decision-mismatch'); declared++;
    }
  }
  return {valid:true,total:72,declared,pending:72-declared,declarationCoverage:declared/72,humanGold:false,semanticLabelsImported:0,bindingThresholds:null,
    authorization:'Declarations are not proof of actual individual Umesh approval; separate accepted authorization is required.'};
}
/** Browser function kept self-contained so the actual interactions can be verified without a browser. */
export function editor(bundle, initial) {
  const review = structuredClone(initial), byId = new Map(review.entries.map(e => [e.claimId,e])), root = document.getElementById('items');
  function element(tag, text) {const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e;}
  function updateCount() {document.getElementById('coverage').textContent = `${review.entries.filter(e => e.status === 'declared').length}/72 individual declarations. Human gold: 0. Thresholds: unapproved.`;}
  for (const item of bundle.entries) {
    const card = element('article'); card.append(element('h2', `${item.ordinal}. ${item.claimId}`), element('p',item.persistedClaim.text));
    card.append(element('p',`AI draft: ${item.aiDraft.literalCitationSupport}. ${item.aiDraft.literalRationale}`));
    const contexts = element('details'); contexts.append(element('summary','Full unchanged source context and separate replacement proposal'));
    contexts.append(element('pre',JSON.stringify({literalCitationContexts:item.literalCitationContexts,replacementProposal:item.replacementProposal,sourceSession:bundle.sessions.find(s => s.sessionId === item.sessionId)},null,2))); card.append(contexts);
    const label = element('select'); label.setAttribute('aria-label',`Support for ${item.claimId}`);
    for (const value of ['','supported','partially_supported','unsupported','unavailable']) {const o = element('option',value || 'Choose your ruling'); o.value = value; label.append(o);}
    const note = element('textarea'); note.setAttribute('aria-label',`Rationale for ${item.claimId}`); note.placeholder = 'Your own source-based rationale';
    const state = element('p','Pending individual review'), save = element('button','Record my individual declaration'), reset = element('button','Reset to pending');
    save.onclick = () => {if (!label.value || !note.value.trim() || note.value.length > 4000) {state.textContent='Choose support and enter a rationale first.'; return;}
      Object.assign(byId.get(item.claimId),{status:'declared',decision:label.value === item.aiDraft.literalCitationSupport ? 'approve-draft':'override-draft',literalCitationSupport:label.value,reviewer:'Umesh',reviewedAt:new Date().toISOString(),rationale:note.value}); state.textContent='Declaration recorded; authorization remains independently unverified.'; updateCount();};
    reset.onclick = () => {Object.assign(byId.get(item.claimId),{status:'pending',decision:null,literalCitationSupport:null,reviewer:null,reviewedAt:null,rationale:null}); label.value='';note.value='';state.textContent='Pending individual review';updateCount();};
    card.append(label,note,save,reset,state); root.append(card);
  }
  document.getElementById('export').onclick = () => {const blob = new Blob([JSON.stringify(review,null,2)+'\n'],{type:'application/json'}), url=URL.createObjectURL(blob), a=element('a');a.href=url;a.download='individual-review-declarations.json';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);};
  updateCount(); return review;
}
export function renderEditor(bundle) {
  const json = x => JSON.stringify(x).replace(/</g,'\\u003c');
  const viewBundle={...bundle};delete viewBundle.corpusBinding;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Umesh: individual extraction review</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:0 20px;background:#f5f7fa;color:#16283c}article{background:white;border:1px solid #cbd5e1;border-radius:12px;padding:20px;margin:20px 0}h2{font-size:18px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}textarea{display:block;width:95%;min-height:80px;margin:12px 0}button,select{padding:10px;margin:4px}header{position:sticky;top:0;background:#f5f7fa;padding:10px 0}</style><header><h1>Individual extraction review</h1><p>For Umesh. Read each original citation before recording your own ruling. AI drafts are proposals; replacement proposals stay separate. No bulk approval, source edits or gold promotion.</p><p id="coverage"></p><button id="export">Download declarations</button></header><main id="items"></main><script>(${editor.toString()})(${json(viewBundle)},${json(pendingExport(bundle))});</script></html>\n`;
}
export function bridge(bundle, review) {
  requireThat(arguments.length === 2, 'alternate-corpus-refused');
  const input=safeFile(ROOT,bundle.corpusBinding.path), corpusBytes=readFileSync(input);
  requireThat(corpusBytes.length === bundle.corpusBinding.bytes && sha(corpusBytes) === bundle.corpusBinding.sha256, 'corpus-drift');
  const declarations = validateExport(bundle, review), measurement = loadManifest(input);
  requireThat(measurement.cases.every(c => !c.semantic.measured && !c.semantic.factsMeasured && Object.values(c.entities).every(e => !e.measured)), 'baseline-already-labelled');
  return {version:1,status:'HUMAN_GATE',declarations,measurement,stageGaps:measurement.cases.map(c => ({caseId:c.id,unavailableStages:Object.entries(c.stages).filter(([,v]) => !v.available).map(([k,v]) => ({stage:k,reason:v.reason}))})),
    remaining:['actual-individual-Umesh-authorization','independent-fact-entity-gold','approved-binding-thresholds','complete-acquired-stage-corpus'],humanGold:false};
}
export function preserveOutput(path, value) {if (existsSync(path)) requireThat(readFileSync(path).equals(Buffer.from(value,'utf8')), 'existing-output-differs'); else writeFileSync(path,value,{flag:'wx'});}
export function main(args = process.argv.slice(2)) {
  try {
    const bundle = loadBundle();
    if (args.length === 1 && args[0] === 'build') {
      const out=resolve(ROOT,'data/eval/u22-live-review'); mkdirSync(out,{recursive:true});
      preserveOutput(resolve(out,'review.html'),renderEditor(bundle)); preserveOutput(resolve(out,'pending-declarations.json'),JSON.stringify(pendingExport(bundle),null,2)+'\n');
      console.log(JSON.stringify({built:true,items:72,humanGold:false,out})); return 0;
    }
    if (args.length === 2 && args[0] === 'validate') {console.log(JSON.stringify(validateExport(bundle,JSON.parse(readFileSync(args[1],'utf8'))),null,2));return 0;}
    if (args.length === 2 && args[0] === 'replay') {console.log(JSON.stringify(bridge(bundle,JSON.parse(readFileSync(args[1],'utf8'))),null,2));return 0;}
    throw new Error('usage: build | validate declaration-file.json | replay declaration-file.json');
  } catch (e) {console.error(JSON.stringify({failure:e.message,humanGold:false}));return 2;}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode=main();
