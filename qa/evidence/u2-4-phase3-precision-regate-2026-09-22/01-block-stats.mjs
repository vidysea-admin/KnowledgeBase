// 01-block-stats.mjs — corpus measurement for u2-4-phase3-precision-regate.
// Reproduces the gate's own numbers (494 positional turns / 240 blocks / 29 session-label pairs)
// and identifies WHICH sessions carry positional labels.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const POSITIONAL = /^spk:\d+$/;

const dirs = (await import("node:fs")).readdirSync("data/toc-migrated", { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

const rows = [];
let posTotal = 0, blockTotal = 0, pairTotal = 0;
for (const s of dirs) {
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", s, "turns.json"), "utf8"));
  const positional = turns.filter((t) => POSITIONAL.test(t.speakerRef ?? ""));
  if (positional.length === 0) continue;
  // contiguous blocks (same definition as labelBlocks in speakers-llm.ts / speakers.ts)
  const blocks = [];
  let cur = null;
  turns.forEach((t, i) => {
    const ref = t.speakerRef ?? "";
    if (POSITIONAL.test(ref)) {
      if (cur && cur.label === ref) cur.end = i;
      else { if (cur) blocks.push(cur); cur = { label: ref, start: i, end: i }; }
    } else if (cur) { blocks.push(cur); cur = null; }
  });
  if (cur) blocks.push(cur);
  const pairs = new Set(positional.map((t) => t.speakerRef)).size;
  rows.push({ session: s, turns: turns.length, positional: positional.length, blocks: blocks.length, sessionLabelPairs: pairs });
  posTotal += positional.length; blockTotal += blocks.length; pairTotal += pairs;
}
console.log(`affected sessions: ${rows.length}`);
for (const r of rows) console.log(`  ${r.session} | turns ${r.turns} | positional ${r.positional} | blocks ${r.blocks} | label-pairs ${r.sessionLabelPairs}`);
console.log(`TOTAL positional: ${posTotal} | blocks: ${blockTotal} | session/label pairs: ${pairTotal}`);
writeFileSync("qa/evidence/u2-4-phase3-precision-regate-2026-09-22/corpus-stats.json", JSON.stringify({ rows, totals: { positional: posTotal, blocks: blockTotal, pairs: pairTotal } }, null, 2));