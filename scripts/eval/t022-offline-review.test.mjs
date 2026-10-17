import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOfflineDraft, validateOfflineDraft, saveOfflineItem, renderOfflineHtml, currentOfflineSnapshot, generateOfflineReview, verifyOfflineDraft } from './t022-offline-review.mjs';
import { validateHumanCalibrationInputs } from './human-calibration.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireWeb = createRequire(resolve(ROOT, 'apps/web/package.json'));
const { JSDOM } = requireWeb('jsdom');
let snapshot;
// These checks use authentic private source inputs, even when the entered judgments are fictional.
// Default execution must neither load that packet nor copy/generate its private content.
const privateReviewEnabled = process.env.KB_T022_PRIVATE_REVIEW_TESTS === '1';
before(async () => {
  if (privateReviewEnabled) snapshot = await currentOfflineSnapshot(resolve(ROOT, 'data/eval/calibration-human-review.json'));
});
const privateTest = (name, check) => test(name, {
  skip: privateReviewEnabled ? false : 'HOLD: authentic private review inputs require explicit KB_T022_PRIVATE_REVIEW_TESTS=1',
}, async context => {
  if (!privateReviewEnabled) return;
  return check(context);
});
const clone = value => JSON.parse(JSON.stringify(value));
function page(options = {}) {
  const downloads = [];
  const dom = new JSDOM(renderOfflineHtml(options.snapshot ?? snapshot), { runScripts: 'dangerously', url: options.localFile ? 'file:///t022-offline-fixture.html' : 'https://offline-fixture.invalid/',
    beforeParse(window) {
      window.Blob = Blob; window.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:synthetic-local-export'; };
      window.URL.revokeObjectURL = () => {}; window.HTMLAnchorElement.prototype.click = () => {};
      if (options.stored !== undefined) window.localStorage.setItem('calibration-offline-draft-v1:' + snapshot.packet.tenantId + ':' + snapshot.packetSha256, options.stored);
      if (options.failStorage) window.Storage.prototype.setItem = () => { throw new Error('synthetic storage denial'); };
    } });
  const el = id => dom.window.document.getElementById(id);
  const change = (id, value) => { el(id).value = value; el(id).dispatchEvent(new dom.window.Event(id === 'item' ? 'change' : 'input', { bubbles: true })); };
  const submit = (score, reason = 'Synthetic fixture only; not an actual Umesh review', affirm = true) => {
    change('score', score); change('rationale', reason); el('affirm').checked = affirm;
    el('review').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  };
  return { dom, el, change, submit, downloads, draft: () => dom.window.t022CurrentDraft(), close: () => dom.window.close() };
}
function syntheticSnapshot() {
  const items = Array.from({ length: 30 }, (_, n) => ({ id: `synthetic-${n}`, inputSha256: String(n).padStart(64, '0'),
    query: `Synthetic query ${n}`, node: { title: 'Synthetic title', summary: 'Synthetic summary', node_id: `fixture-${n}` } }));
  return { packetSha256: 'a'.repeat(64), packet: { tenantId: 'synthetic', rubric: 'Synthetic rubric', sources: [], items,
    batches: [0, 1, 2].map(n => ({ id: n + 1, itemIds: items.slice(n * 10, n * 10 + 10).map(i => i.id) })) } };
}
test('dirty form retains edits across navigation, export and restore until explicit save or discard', async () => {
  const fixture = syntheticSnapshot(), p = page({ snapshot: fixture });
  try {
    p.change('score', '0.25'); p.change('rationale', 'Unsaved synthetic rationale');
    p.change('item', fixture.packet.items[1].id);
    assert.equal(p.el('item').value, fixture.packet.items[0].id);
    assert.equal(p.el('score').value, '0.25'); assert.equal(p.el('rationale').value, 'Unsaved synthetic rationale');
    p.el('backup').click(); assert.equal(p.downloads.length, 0); assert.match(p.el('notice').textContent, /Unsaved edits retained/);
    let reads = 0;
    Object.defineProperty(p.el('restore'), 'files', { configurable: true, value: [{ text: async () => { reads++; return JSON.stringify(createOfflineDraft(fixture)); } }] });
    p.el('restore').dispatchEvent(new p.dom.window.Event('change')); await new Promise(ok => setTimeout(ok, 0));
    assert.equal(reads, 0); assert.equal(p.draft().submittedCount, 0);
    const unload = new p.dom.window.Event('beforeunload', { cancelable: true }); p.dom.window.dispatchEvent(unload);
    assert.equal(unload.defaultPrevented, true);
    p.el('discard').click(); assert.equal(p.el('score').value, ''); assert.equal(p.el('rationale').value, ''); assert.equal(p.el('affirm').checked, false);
    p.change('item', fixture.packet.items[1].id); assert.equal(p.el('item').value, fixture.packet.items[1].id);
    p.submit('0.5'); p.el('backup').click(); assert.equal(p.downloads.length, 1);
    const exported = JSON.parse(await p.downloads[0].text()); assert.equal(exported.submittedCount, 1); assert.equal(exported.humanGoldVerified, false);
    const cleanUnload = new p.dom.window.Event('beforeunload', { cancelable: true }); p.dom.window.dispatchEvent(cleanUnload); assert.equal(cleanUnload.defaultPrevented, false);
  } finally { p.close(); }
});
test('async restore cannot overwrite edits or assertions made during file reading', async () => {
  const fixture = syntheticSnapshot(), p = page({ snapshot: fixture });
  try {
    let finish;
    Object.defineProperty(p.el('restore'), 'files', { configurable: true, value: [{ text: () => new Promise(ok => { finish = ok; }) }] });
    p.el('restore').dispatchEvent(new p.dom.window.Event('change'));
    p.change('rationale', 'Retain this new input'); finish(JSON.stringify(createOfflineDraft(fixture))); await new Promise(ok => setTimeout(ok, 0));
    assert.equal(p.el('rationale').value, 'Retain this new input'); assert.match(p.el('notice').textContent, /review changed/);
    p.el('discard').click();
    p.el('restore').dispatchEvent(new p.dom.window.Event('change')); p.submit('0.75');
    finish(JSON.stringify(createOfflineDraft(fixture))); await new Promise(ok => setTimeout(ok, 0));
    assert.equal(p.draft().submittedCount, 1); assert.equal(p.draft().items[0].score, 0.75);
    assert.equal(p.el('notice').getAttribute('role'), 'alert');
  } finally { p.close(); }
});
privateTest('current thirty exact neutral inputs and forty-four bindings appear in actual generated controls', () => {
  const p = page(); try {
    assert.equal(snapshot.packet.items.length, 30); assert.equal(snapshot.packet.sources.length, 44);
    assert.equal(p.el('item').options.length, 30); assert.equal(p.el('item').children.length, 3);
    for (const item of snapshot.packet.items) {
      p.change('item', item.id); assert.equal(p.el('query').textContent, item.query); assert.equal(p.el('title').textContent, item.node.title);
      assert.equal(p.el('summary').textContent, item.node.summary); assert.equal(p.el('input').textContent, item.inputSha256);
      assert.equal(p.el('score').value, ''); assert.equal(p.el('rationale').value, ''); assert.equal(p.el('affirm').checked, false);
    }
    const draft = p.draft(); assert.equal(draft.submittedCount, 0); assert.equal(draft.humanGoldVerified, false);
    assert.ok(draft.items.every(i => i.localRevision === 0 && i.score === null && i.assertedBy === null && i.serverExpectedRevision === null));
    assert.equal(p.el('rubric').textContent, snapshot.packet.rubric); assert.equal(p.el('complete').disabled, true);
  } finally { p.close(); }
});
privateTest('one fractional save and amendment require fresh affirmation, exact inputs and local revisions', () => {
  const p = page(); try {
    p.submit('0.375'); let draft = p.draft(); assert.equal(draft.submittedCount, 1); assert.equal(draft.items[0].score, 0.375);
    assert.equal(draft.items[0].localRevision, 1); assert.equal(draft.items[0].serverExpectedRevision, null);
    assert.ok(draft.items.slice(1).every(i => i.score === null)); assert.equal(p.el('affirm').checked, false);
    p.change('score', '0.25'); p.el('review').dispatchEvent(new p.dom.window.Event('submit', { cancelable: true }));
    assert.equal(p.draft().items[0].localRevision, 1); assert.match(p.el('notice').textContent, /fresh personal affirmation/);
    p.submit('0.25'); assert.equal(p.draft().items[0].localRevision, 2); assert.equal(p.draft().submittedCount, 1);
    draft = p.draft(); const item = draft.items[0];
    assert.throws(() => saveOfflineItem(draft, snapshot, item.id, { scoreText: '0.5', rationale: 'fixture', affirmIndividualReview: true,
      inputSha256: '0'.repeat(64), expectedLocalRevision: item.localRevision }), /conflict/);
    assert.throws(() => saveOfflineItem(draft, snapshot, item.id, { scoreText: '0.5', rationale: 'fixture', affirmIndividualReview: true,
      inputSha256: item.inputSha256, expectedLocalRevision: 0 }), /conflict/);
  } finally { p.close(); }
});
privateTest('blank, nonfinite, out-of-range, rationale and affirmation failures leave progress and revision unchanged', () => {
  const p = page(); try {
    for (const [score, reason, affirm] of [['', 'fixture', true], ['NaN', 'fixture', true], ['Infinity', 'fixture', true],
      ['-0.001', 'fixture', true], ['1.001', 'fixture', true], ['0', ' ', true], ['0.5', 'fixture', false], ['0.5', 'x'.repeat(20001), true]]) {
      p.submit(score, reason, affirm); assert.equal(p.draft().submittedCount, 0); assert.equal(p.draft().items[0].localRevision, 0);
      assert.equal(p.el('notice').dataset.error, 'true');
    }
    p.submit('0', 'Synthetic zero is explicitly entered'); assert.equal(p.draft().submittedCount, 1); assert.equal(p.draft().items[0].score, 0);
  } finally { p.close(); }
});
privateTest('matching local state resumes; corrupt, foreign, changed and authoritative state cannot become judgments', async () => {
  const p = page(); p.submit('0.625'); const saved = p.draft(); p.close();
  const resumed = page({ stored: JSON.stringify(saved) }); try { assert.equal(resumed.draft().submittedCount, 1); assert.equal(resumed.el('score').value, '0.625');
    assert.equal(resumed.el('affirm').checked, false);
    Object.defineProperty(resumed.el('restore'), 'files', { configurable: true, value: [{ text: async () => JSON.stringify(saved) }] });
    resumed.el('restore').dispatchEvent(new resumed.dom.window.Event('change')); await new Promise(ok => setTimeout(ok, 0));
    assert.equal(resumed.draft().submittedCount, 1); assert.match(resumed.el('notice').textContent, /restored/);
    Object.defineProperty(resumed.el('restore'), 'files', { configurable: true, value: [{ text: async () => JSON.stringify({ ...saved, humanGoldVerified: true }) }] });
    resumed.el('restore').dispatchEvent(new resumed.dom.window.Event('change')); await new Promise(ok => setTimeout(ok, 0));
    assert.equal(resumed.draft().submittedCount, 1); assert.match(resumed.el('notice').textContent, /Restore refused/);
  } finally { resumed.close(); }
  const bad = [undefined, null, { ...saved, tenantId: 'foreign' }, { ...saved, packetSha256: '0'.repeat(64) },
    { ...saved, submittedCount: 30 }, { ...saved, humanGoldVerified: true }, { ...saved, audit: [] }, { ...saved, identityBasis: 'verified-owner' }];
  const changed = clone(saved); changed.items[0].inputSha256 = '0'.repeat(64); bad.push(changed);
  const revision = clone(saved); revision.items[0].serverExpectedRevision = 0; bad.push(revision);
  const duplicate = clone(saved); duplicate.items[1] = duplicate.items[0]; bad.push(duplicate);
  for (const value of bad) {
    const rejected = page({ stored: value === undefined ? '{corrupt' : JSON.stringify(value) });
    try { assert.equal(rejected.draft().submittedCount, 0); assert.match(rejected.el('notice').textContent, /invalid or stale/); }
    finally { rejected.close(); }
  }
});
privateTest('failed browser persistence is visible and exports preserve explicitly memory-only partial assertions', async () => {
  const fileOrigin = page({ localFile: true }); try {
    assert.match(fileOrigin.el('progress').textContent, /Memory-only/); fileOrigin.submit('0.375');
    assert.equal(fileOrigin.draft().submittedCount, 1); assert.match(fileOrigin.el('notice').textContent, /memory only/);
    fileOrigin.el('backup').click(); assert.equal(JSON.parse(await fileOrigin.downloads[0].text()).submittedCount, 1);
  } finally { fileOrigin.close(); }
  const p = page({ failStorage: true }); try {
    p.submit('0.375'); assert.match(p.el('notice').textContent, /memory only; browser storage failed/);
    assert.match(p.el('progress').textContent, /Memory-only/); assert.equal(p.el('complete').disabled, true);
    p.el('backup').click(); const exported = JSON.parse(await p.downloads[0].text());
    assert.equal(exported.submittedCount, 1); assert.equal(exported.pendingCount, 29); assert.equal(exported.completeAssertions, false);
    assert.equal(exported.items[0].score, 0.375); assert.equal(exported.serverAuditAuthoritative, false); assert.equal(exported.humanGoldVerified, false);
    assert.equal(exported.items[1].score, null); assert.match(p.el('notice').textContent, /download requested/);
    await assert.rejects(validateHumanCalibrationInputs(exported, null), /authoritative stored-review export/);
  } finally { p.close(); }
});
privateTest('thirty individual fictional assertions on private inputs enable complete draft export, never verified human gold', async () => {
  const p = page(); try {
    for (const [index, item] of snapshot.packet.items.entries()) { p.change('item', item.id); p.submit(String(index / 29), 'Synthetic per-item fixture ' + index);
      assert.equal(p.draft().submittedCount, index + 1); assert.equal(p.el('complete').disabled, index !== 29); }
    p.el('complete').click(); const exported = JSON.parse(await p.downloads[0].text());
    assert.equal(exported.pendingCount, 0); assert.equal(exported.completeAssertions, true); assert.equal(exported.items.length, 30);
    assert.ok(exported.items.every(i => i.localRevision === 1 && i.serverExpectedRevision === null));
    assert.equal(exported.items[1].score, 1 / 29); assert.equal(exported.items[1].rationale, 'Synthetic per-item fixture 1');
    await assert.rejects(validateHumanCalibrationInputs(exported, null), /authoritative stored-review export/);
  } finally { p.close(); }
});
privateTest('closing-script and dangerous corpus markup is literal text with no external assets or execution', () => {
  const hostile = clone(snapshot); hostile.packet.items[0].query = '</script><script>window.PWNED=true</script><img src="https://foreign.invalid/x" onerror="window.PWNED=true">';
  hostile.packet.items[0].node.title = '<iframe src="https://foreign.invalid"></iframe>'; hostile.packet.items[0].node.summary = '<svg onload="window.PWNED=true">';
  hostile.packetSha256 = createHash('sha256').update(JSON.stringify(hostile.packet)).digest('hex');
  const p = page({ snapshot: hostile }); try {
    assert.equal(p.el('query').textContent, hostile.packet.items[0].query); assert.equal(p.el('title').textContent, hostile.packet.items[0].node.title);
    assert.equal(p.dom.window.PWNED, undefined); assert.equal(p.dom.window.document.querySelectorAll('img,iframe,svg,script[src],link').length, 0);
    assert.match(p.dom.window.document.querySelector('meta[http-equiv]').content, /connect-src 'none'/);
  } finally { p.close(); }
});
privateTest('exclusive generator/current-source consumer preserve old output and refuse packet/source drift', async () => {
  const root = mkdtempSync(join(tmpdir(), 't022-offline-test-')), packetPath = resolve(root, 'data/eval/review.json');
  try {
    for (const source of snapshot.packet.sources) { const target = resolve(root, source.path); mkdirSync(dirname(target), { recursive: true }); copyFileSync(resolve(ROOT, source.path), target); }
    writeFileSync(packetPath, JSON.stringify(snapshot.packet)); const old = resolve(root, 'data/eval/t022-review-package.html'); writeFileSync(old, 'original-static-preserved');
    const output = resolve(root, 'data/eval/t022-offline-review.html'); const receipt = await generateOfflineReview(packetPath, output, root);
    assert.equal(receipt.items, 30); assert.equal(receipt.sources, 44); assert.equal(receipt.genuineHumanReviews, 0); const bytes = readFileSync(output);
    await assert.rejects(generateOfflineReview(packetPath, output, root), /Existing output refused/); assert.deepEqual(readFileSync(output), bytes);
    assert.equal(readFileSync(old, 'utf8'), 'original-static-preserved');
    const draftPath = resolve(root, 'data/eval/draft.json'); writeFileSync(draftPath, JSON.stringify(createOfflineDraft(snapshot)));
    const consumed = await verifyOfflineDraft(draftPath, packetPath, root); assert.equal(consumed.pending, 30); assert.equal(consumed.serverTransferAuthorized, false);
    const changedPacket = clone(snapshot.packet); changedPacket.items[0].query = 'changed'; writeFileSync(packetPath, JSON.stringify(changedPacket));
    const changedOutput = resolve(root, 'data/eval/t022-offline-review-drift.html'); await assert.rejects(generateOfflineReview(packetPath, changedOutput, root), /changed/);
    assert.equal(existsSync(changedOutput), false); writeFileSync(packetPath, JSON.stringify(snapshot.packet));
    const changedSource = resolve(root, snapshot.packet.sources[0].path); writeFileSync(changedSource, readFileSync(changedSource, 'utf8') + '\n');
    await assert.rejects(verifyOfflineDraft(draftPath, packetPath, root), /changed/); assert.equal(readFileSync(old, 'utf8'), 'original-static-preserved');
  } finally { if (root.startsWith(join(tmpdir(), 't022-offline-test-'))) rmSync(root, { recursive: true, force: true }); }
});
