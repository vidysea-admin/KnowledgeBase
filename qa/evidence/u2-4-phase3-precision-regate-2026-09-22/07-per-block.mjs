// 07-per-block.mjs — renders per-block results for all 240 gold blocks:
// which blocks carry naming evidence (gold), which were touched by an accepted identity
// (correct / wrong / none) in each outer run, and the block-level precision picture.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22";
const gold = JSON.parse(readFileSync(join(OUT, "gold-labels.json"), "utf8"));
const results = readFileSync(join(OUT, "run-results.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const summary = JSON.parse(readFileSync(join(OUT, "measurement-summary.json"), "utf8"));

const norm = (s) => (s ?? "").trim().toLowerCase();
const rows = [];
for (const g of gold.sessions) {
  const runs = results.filter((r) => r.session === g.session);
  for (const b of g.blocks) {
    const row = { session: g.session, block: b.block, label: b.label, goldPerson: b.person, prov: b.prov, confidence: b.confidence, perRun: {} };
    for (const r of runs) {
      const touched = (r.resolved ?? []).filter((s) => (s.evidence ?? []).some((e) => b.turnIds?.includes(e.turnId)));
      // map: which accepted identity cites a turn of this block (via evidence) or claims its span
      const evHit = (r.resolved ?? []).filter((s) => (s.evidence ?? []).some((e) => e.turnId === b.turnIds?.[0]));
      row.perRun[r.outerRun] = evHit.length
        ? evHit.map((s) => `${s.speakerRef}->${s.displayName}`).join(";")
        : (r.resolved ?? []).length
          ? "none-citing-this-block"
          : "no-accepted-identity";
    }
    rows.push(row);
  }
}
// attach per-block turn ids from the block definition (gold file stores provenance, block ids come
// from the same block walk used in the scorer)
const POSITIONAL = /^spk:\d+$/;
for (const g of gold.sessions) {
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", g.session, "turns.json"), "utf8"));
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
  blocks.forEach((b, i) => {
    const row = rows.find((r) => r.session === g.session && r.block === i + 1);
    if (row) row.turnIds = Array.from({ length: b.end - b.start + 1 }, (_, k) => turns[b.start + k]._id);
  });
}
for (const row of rows) {
  const hits = (row.turnIds ?? []).map((tid) => ({ tid }));
  row.evidenceTurnIds = (row.turnIds ?? []).map((tid) => results.filter((r) => r.session === row.session).flatMap((r) => r.resolved ?? []).filter((s) => (s.evidence ?? []).some((e) => e.turnId === tid)).map((s) => `${s.speakerRef}->${s.displayName}`).join(";")).filter(Boolean);
}
writeFileSync(join(OUT, "per-block-results.json"), JSON.stringify(rows, null, 2));
const named = rows.filter((r) => r.goldPerson).length;
console.log(`blocks: ${rows.length} | gold-named: ${named} | gold-unnamed: ${rows.length - named}`);
console.log(`named blocks: ${[...new Set(rows.filter((r) => r.goldPerson).map((r) => `${r.session}|${r.goldPerson}`))].length} (session|person) pairs`);