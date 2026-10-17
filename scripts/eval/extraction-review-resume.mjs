#!/usr/bin/env node
/** Resume declarations, never authenticate them or import semantic gold. */
import {readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadBundle, validateExport, editor, renderEditor, preserveOutput} from './extraction-review.mjs';

/** Uses the existing editor handlers; restores only validated saved declarations. */
export function resumeEditor(bundle, initial) {
  const review = editor(bundle, initial);
  const saved = new Map(initial.entries.map(item => [item.claimId, item]));
  const cards = document.getElementById('items').children;
  for (let i = 0; i < bundle.entries.length; i++) {
    const entry = saved.get(bundle.entries[i].claimId);
    if (entry.status !== 'declared') continue;
    const card = cards[i];
    card.querySelector('select').value = entry.literalCitationSupport;
    card.querySelector('textarea').value = entry.rationale;
    card.lastElementChild.textContent = `Saved declaration by ${entry.reviewer} at ${entry.reviewedAt}; authorization remains independently unverified.`;
  }
  return review;
}

export function renderResumedEditor(bundle, review, sourceBytes = null) {
  const coverage = validateExport(bundle, review);
  // Preserve an exact-byte receipt when loaded from disk, and bind it to the rendered input.
  const bytes = sourceBytes === null ? Buffer.from(JSON.stringify(review), 'utf8') : sourceBytes;
  if (JSON.stringify(JSON.parse(bytes.toString('utf8'))) !== JSON.stringify(review)) throw new Error('resume-input-drift');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const viewBundle = {...bundle}; delete viewBundle.corpusBinding;
  const template = renderEditor(bundle), start = template.indexOf('<script>'), end = template.lastIndexOf('</script>');
  if (start < 0 || end <= start || template.indexOf('<script>', start + 1) >= 0) throw new Error('editor-template-changed');
  const receipt = `<p>Resumed ${coverage.declared}/72 saved declarations; input SHA256 ${digest}. Saved declarations remain unauthenticated; human gold: 0.</p>`;
  const prefix = template.slice(0, start).replace('</header>', receipt + '</header>');
  return `${prefix}<script>const editor=${editor.toString()};(${resumeEditor.toString()})(${json(viewBundle)},${json(review)});${template.slice(end)}`;
}

export function main(args = process.argv.slice(2)) {
  try {
    if (args.length !== 2 || !args[1].endsWith('.html')) throw new Error('usage: extraction-review-resume.mjs declarations.json NEW-review.html');
    if (statSync(args[0]).size > 16 * 1024 * 1024) throw new Error('size-limit');
    const bytes = readFileSync(args[0]), review = JSON.parse(bytes.toString('utf8')), bundle = loadBundle();
    const html = renderResumedEditor(bundle, review, bytes);
    preserveOutput(resolve(args[1]), html);
    console.log(JSON.stringify({resumed:true, ...validateExport(bundle, review), output:resolve(args[1]), sourceSha256:createHash('sha256').update(bytes).digest('hex')}));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({failure:error.message, humanGold:false}));
    return 2;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
