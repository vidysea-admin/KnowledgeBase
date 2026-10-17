#!/usr/bin/env node
/** Private offline assertions only. No auth, network, providers, DB or human-gold promotion. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareCalibrationReview } from './calibration-review.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function offlineAssert(ok, message) { if (!ok) throw new Error(message); }
export function createOfflineDraft(snapshot, now = new Date().toISOString()) {
  return { format: 'calibration-offline-draft-v1', tenantId: snapshot.packet.tenantId, packetSha256: snapshot.packetSha256,
    packet: snapshot.packet, generatedAt: now, humanGoldVerified: false, serverAuditAuthoritative: false,
    identityBasis: 'Offline personal-review assertions; identity and browser time are not authenticated.',
    submittedCount: 0, pendingCount: 30, completeAssertions: false,
    items: snapshot.packet.items.map(item => ({ id: item.id, inputSha256: item.inputSha256, localRevision: 0,
      serverExpectedRevision: null, score: null, rationale: null, affirmIndividualReview: false, assertedBy: null, assertedAt: null })) };
}
export function validateOfflineDraft(draft, snapshot) {
  const header = 'completeAssertions,format,generatedAt,humanGoldVerified,identityBasis,items,packet,packetSha256,pendingCount,serverAuditAuthoritative,submittedCount,tenantId';
  offlineAssert(draft?.format === 'calibration-offline-draft-v1' && draft.humanGoldVerified === false
    && draft.serverAuditAuthoritative === false && draft.tenantId === snapshot.packet.tenantId
    && Object.keys(draft).sort().join(',') === header
    && draft.identityBasis === 'Offline personal-review assertions; identity and browser time are not authenticated.'
    && typeof draft.generatedAt === 'string' && Number.isFinite(Date.parse(draft.generatedAt))
    && new Date(draft.generatedAt).toISOString() === draft.generatedAt
    && draft.packetSha256 === snapshot.packetSha256 && JSON.stringify(draft.packet) === JSON.stringify(snapshot.packet), 'Foreign, changed or authoritative draft refused');
  offlineAssert(Array.isArray(draft.items) && draft.items.length === 30 && new Set(draft.items.map(i => i.id)).size === 30, 'Need exactly thirty distinct known items');
  const keys = 'affirmIndividualReview,assertedAt,assertedBy,id,inputSha256,localRevision,rationale,score,serverExpectedRevision';
  for (const item of draft.items) {
    const expected = snapshot.packet.items.find(i => i.id === item.id);
    offlineAssert(expected && Object.keys(item).sort().join(',') === keys && item.inputSha256 === expected.inputSha256
      && item.serverExpectedRevision === null && Number.isSafeInteger(item.localRevision) && item.localRevision >= 0, 'Unknown item, changed input or invented server revision');
    if (item.localRevision === 0) offlineAssert(item.score === null && item.rationale === null && item.affirmIndividualReview === false
      && item.assertedBy === null && item.assertedAt === null, 'Pending item contains an asserted judgment');
    else offlineAssert(typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0 && item.score <= 1
      && typeof item.rationale === 'string' && item.rationale.trim() && item.rationale.length <= 20000
      && item.affirmIndividualReview === true && item.assertedBy === 'Umesh' && typeof item.assertedAt === 'string'
      && Number.isFinite(Date.parse(item.assertedAt)) && new Date(item.assertedAt).toISOString() === item.assertedAt, 'Invalid individual assertion');
  }
  const n = draft.items.filter(i => i.localRevision > 0).length;
  offlineAssert(draft.submittedCount === n && draft.pendingCount === 30 - n && draft.completeAssertions === (n === 30), 'Dishonest progress/count');
  return draft;
}
export function saveOfflineItem(draft, snapshot, id, input, now = new Date().toISOString()) {
  validateOfflineDraft(draft, snapshot);
  offlineAssert(typeof input.scoreText === 'string' && input.scoreText.trim() && Number.isFinite(Number(input.scoreText)), 'Enter a finite score; blank is not zero');
  offlineAssert(typeof input.rationale === 'string' && input.rationale.trim() && input.rationale.length <= 20000
    && input.affirmIndividualReview === true, 'A rationale and fresh personal affirmation are required');
  const next = JSON.parse(JSON.stringify(draft)), item = next.items.find(i => i.id === id);
  offlineAssert(item && item.localRevision < Number.MAX_SAFE_INTEGER && input.inputSha256 === item.inputSha256 && input.expectedLocalRevision === item.localRevision, 'Input/local revision conflict');
  Object.assign(item, { score: Number(input.scoreText), rationale: input.rationale.trim(), affirmIndividualReview: true,
    assertedBy: 'Umesh', assertedAt: now, localRevision: item.localRevision + 1 });
  next.submittedCount = next.items.filter(i => i.localRevision > 0).length; next.pendingCount = 30 - next.submittedCount;
  next.completeAssertions = next.submittedCount === 30; next.generatedAt = now;
  return validateOfflineDraft(next, snapshot);
}
export function offlinePage(snapshot) {
  const key = 'calibration-offline-draft-v1:' + snapshot.packet.tenantId + ':' + snapshot.packetSha256;
  let draft = createOfflineDraft(snapshot), storageAvailable = true;
  const el = id => document.getElementById(id), message = (text, bad = false) => { el('notice').textContent = text; el('notice').dataset.error = String(bad); };
  try { const stored = localStorage.getItem(key); if (stored) draft = validateOfflineDraft(JSON.parse(stored), snapshot); }
  catch { storageAvailable = false; message('Stored draft was unavailable, invalid or stale. Nothing was imported. Memory-only mode: export your draft to retain work.', true); }
  const selector = el('item'), score = el('score'), rationale = el('rationale'), affirm = el('affirm');
  let displayedId, editVersion = 0, cleanFields;
  const fields = () => JSON.stringify([score.value, rationale.value, affirm.checked]);
  const dirty = () => fields() !== cleanFields;
  function requireClean() {
    if (!dirty()) return true;
    message('Unsaved edits retained. Save this individual assertion or choose Discard unsaved edits before changing items, exporting or restoring.', true);
    return false;
  }
  el('rubric').textContent = snapshot.packet.rubric; el('binding').textContent = snapshot.packet.tenantId + ' · packet ' + snapshot.packetSha256 + ' · ' + snapshot.packet.sources.length + ' source bindings';
  for (const batch of snapshot.packet.batches) {
    const group = document.createElement('optgroup'); group.label = 'Batch ' + batch.id + ' (10 items)';
    for (const id of batch.itemIds) { const option = document.createElement('option'); option.value = id; option.textContent = id; group.append(option); }
    selector.append(group);
  }
  function updateProgress() {
    el('progress').textContent = draft.submittedCount + '/30 recorded offline assertions; ' + draft.pendingCount + ' pending. ' + (storageAvailable ? 'Browser draft storage enabled.' : 'Memory-only; export a backup.');
    el('complete').disabled = !draft.completeAssertions; window.t022CurrentDraft = () => JSON.parse(JSON.stringify(draft));
  }
  function show() {
    const source = snapshot.packet.items.find(i => i.id === selector.value), item = draft.items.find(i => i.id === selector.value);
    el('query').textContent = source.query; el('title').textContent = source.node.title; el('summary').textContent = source.node.summary;
    el('input').textContent = source.inputSha256; el('node').textContent = source.node.node_id + ' (review-only identity)';
    score.value = item.score === null ? '' : String(item.score); rationale.value = item.rationale ?? ''; affirm.checked = false;
    displayedId = item.id; cleanFields = fields(); editVersion++;
    el('revision').textContent = 'Local revision ' + item.localRevision + '; server expected revision unknown (null).'; updateProgress();
  }
  selector.addEventListener('change', () => { if (!requireClean()) { selector.value = displayedId; return; } show(); });
  for (const field of [score, rationale]) field.addEventListener('input', () => { affirm.checked = false; editVersion++; });
  affirm.addEventListener('change', () => { editVersion++; });
  el('discard').addEventListener('click', () => { show(); message('Unsaved edits discarded. Saved assertions are unchanged.'); });
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  el('review').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const item = draft.items.find(i => i.id === selector.value), next = saveOfflineItem(draft, snapshot, item.id,
        { scoreText: score.value, rationale: rationale.value, affirmIndividualReview: affirm.checked,
          inputSha256: item.inputSha256, expectedLocalRevision: item.localRevision });
      try { localStorage.setItem(key, JSON.stringify(next)); storageAvailable = true; }
      catch { storageAvailable = false; }
      draft = next; show(); message(storageAvailable ? 'Individual assertion saved to browser draft storage. Human identity remains unverified.'
        : 'Recorded in memory only; browser storage failed. Export a backup now. Human identity remains unverified.', !storageAvailable);
    } catch (error) { message(error.message, true); }
  });
  function download(complete) {
    if (!requireClean()) return;
    try {
      validateOfflineDraft(draft, snapshot); offlineAssert(!complete || draft.completeAssertions, 'Thirty individual assertions required for complete export');
      const blob = new Blob([JSON.stringify(draft, null, 2) + '\n'], { type: 'application/json' }), link = document.createElement('a');
      const url = URL.createObjectURL(blob); link.href = url; link.download = 't022-' + (complete ? 'complete' : 'partial') + '-offline-draft-' + Date.now() + '.json';
      link.click(); URL.revokeObjectURL(url); message('Draft download requested; keep it local. This is not authenticated server audit or verified human gold.');
    } catch (error) { message(error.message, true); }
  }
  el('backup').addEventListener('click', () => download(false)); el('complete').addEventListener('click', () => download(true));
  el('restore').addEventListener('change', async () => {
    const file = el('restore').files?.[0]; if (!file) return;
    el('restore').value = '';
    if (!requireClean()) return;
    const version = editVersion;
    try { const next = validateOfflineDraft(JSON.parse(await file.text()), snapshot);
      if (version !== editVersion || !requireClean()) { message('Restore refused: review changed while reading the file. Current edits and assertions retained.', true); return; }
      try { localStorage.setItem(key, JSON.stringify(next)); storageAvailable = true; } catch { storageAvailable = false; }
      draft = next; show(); message(storageAvailable ? 'Matching offline assertions restored; identity remains unverified.' : 'Matching assertions restored in memory only; export a backup.', !storageAvailable);
    } catch (error) { message('Restore refused: ' + error.message, true); }
  });
  show();
}
export function renderOfflineHtml(snapshot) {
  const json = JSON.stringify(snapshot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const script = [offlineAssert, createOfflineDraft, validateOfflineDraft, saveOfflineItem, offlinePage].map(fn => fn.toString()).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>T022 private individual review</title><style>body{max-width:960px;margin:2rem auto;padding:0 1rem;font:17px/1.5 system-ui;color:#182337}h1{font-size:1.6rem}label{display:block;margin-top:1rem}input,textarea,select,button{font:inherit;padding:.5rem;max-width:100%}textarea{width:95%;min-height:8rem}button{margin:.5rem .5rem .5rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#edf2f8;padding:1rem}code{overflow-wrap:anywhere}#notice[data-error=true]{color:#a52020}fieldset{border:1px solid #abb8ca;padding:1rem}</style>
<h1>Thirty individual T022 reviews</h1><p>Private offline draft. No network, provider, database or API key. Personal assertions and browser time are unauthenticated; exports never claim human gold.</p>
<p id="binding"></p><p id="rubric"></p><p id="progress" role="status"></p><p id="notice" role="alert"></p>
<label for="item">Review item</label><select id="item"></select><h2>Query</h2><pre id="query"></pre><h2>Title</h2><pre id="title"></pre><h2>Judge-visible summary</h2><pre id="summary"></pre>
<p id="node"></p><p>Input SHA-256: <code id="input"></code></p><p id="revision"></p>
<form id="review" novalidate><fieldset><legend>Personally review this item</legend><label for="score">Score from 0 to 1</label><input id="score" type="number" min="0" max="1" step="any" required>
<label for="rationale">Why this score?</label><textarea id="rationale" maxlength="20000" required></textarea><label><input id="affirm" type="checkbox"> I am Umesh and personally reviewed this exact query, title and summary.</label><button type="submit">Save this individual assertion</button></fieldset></form>
<button id="discard" type="button">Discard unsaved edits</button><button id="backup" type="button">Export partial draft / backup</button><button id="complete" type="button" disabled>Export thirty complete assertions</button><label for="restore">Restore matching local draft JSON</label><input id="restore" type="file" accept="application/json,.json">
<p>After genuine review: an authorized operator must revalidate current sources, obtain an authenticated server view/CAS revision and transfer each item through the protected review route. This file cannot perform that transfer or configure a verified-human receipt. T022 remains open.</p>
<script>${script}\nofflinePage(${json});</script></html>`;
}
export async function currentOfflineSnapshot(packetPath, root = ROOT) {
  const packet = JSON.parse(readFileSync(packetPath, 'utf8')), current = await prepareCalibrationReview(root);
  offlineAssert(JSON.stringify(packet) === JSON.stringify(current), 'Neutral packet or current sources changed; do not reuse reviews');
  return { packet, packetSha256: digest(packet), generatedAt: new Date().toISOString() };
}
export async function generateOfflineReview(packetPath, out, root = ROOT) {
  const target = resolve(out);
  offlineAssert(dirname(target) === resolve(root, 'data/eval') && /^t022-offline-review(?:-[A-Za-z0-9_-]+)?\.html$/.test(basename(target)), 'Use a separately named leased t022-offline-review HTML');
  offlineAssert(!existsSync(target), 'Existing output refused; never reset human work');
  const snapshot = await currentOfflineSnapshot(packetPath, root), html = renderOfflineHtml(snapshot);
  // Recheck source at immediate publication, after building the embedded private snapshot.
  const final = await currentOfflineSnapshot(packetPath, root); offlineAssert(final.packetSha256 === snapshot.packetSha256, 'Source drift before publication');
  writeFileSync(target, html, { flag: 'wx', mode: 0o600 });
  return { output: target, items: 30, sources: snapshot.packet.sources.length, packetSha256: snapshot.packetSha256, genuineHumanReviews: 0 };
}
export async function verifyOfflineDraft(path, packetPath, root = ROOT) {
  const snapshot = await currentOfflineSnapshot(packetPath, root), draft = validateOfflineDraft(JSON.parse(readFileSync(path, 'utf8')), snapshot);
  return { format: draft.format, submittedAssertions: draft.submittedCount, pending: draft.pendingCount, humanGoldVerified: false,
    serverTransferAuthorized: false, packetSha256: snapshot.packetSha256, remainingGate: 'Current authenticated per-item transfer/CAS and genuine independently verified owner evidence.' };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [mode, ...args] = process.argv.slice(2), option = name => { const i = args.indexOf(name); offlineAssert(i >= 0 && args[i + 1] && !args[i + 1].startsWith('--'), 'Missing ' + name); return resolve(args[i + 1]); };
  try { const result = mode === 'generate' ? await generateOfflineReview(option('--packet'), option('--out'))
    : mode === 'verify' ? await verifyOfflineDraft(option('--draft'), option('--packet')) : (() => { throw new Error('Use generate or verify'); })();
    console.log(JSON.stringify(result));
  } catch { console.error('Offline review refused; check current neutral sources, draft binding and new output path. No approval or external action occurred.'); process.exitCode = 2; }
}
