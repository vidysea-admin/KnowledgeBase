// 02-dump-blocks.mjs — dumps every contiguous positional block (with ±2 context turns) for
// hand-labelling. One file per session under corpus-dump/. The HAND LABELS are added separately
// (gold-labels.json) so the dump stays a pure read of the migrated data.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const POSITIONAL = /^spk:\d+$/;
const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22/corpus-dump";
mkdirSync(OUT, { recursive: true });

const dirs = readdirSync("data/toc-migrated", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

for (const s of dirs) {
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", s, "turns.json"), "utf8"));
  const positional = turns.filter((t) => POSITIONAL.test(t.speakerRef ?? ""));
  if (positional.length === 0) continue;
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

  const fmt = (t) => `[${t._id}] [${t.speakerRef}] ${(t.text ?? "").replace(/\s+/g, " ").trim()}`;
  const lines = [];
  let bNo = 0;
  for (const b of blocks) {
    bNo++;
    const ctxBefore = turns.slice(Math.max(0, b.start - 2), b.start);
    const ctxAfter = turns.slice(b.end + 1, b.end + 3);
    lines.push(`=== BLOCK ${bNo} | label ${b.label} | turns ${turns[b.start]._id}..${turns[b.end]._id} (idx ${b.start}-${b.end}) | ${b.end - b.start + 1} turn(s)`);
    for (const t of ctxBefore) lines.push(`  (ctx-1) ${fmt(t)}`);
    for (let i = b.start; i <= b.end; i++) lines.push(`  (BLOCK) ${fmt(turns[i])}`);
    for (const t of ctxAfter) lines.push(`  (ctx+1) ${fmt(t)}`);
  }
  writeFileSync(join(OUT, `${s}.txt`), `# ${s} — ${turns.length} turns, ${positional.length} positional, ${blocks.length} blocks\n` + lines.join("\n") + "\n");
  console.log(`${s}: ${blocks.length} blocks dumped`);
}