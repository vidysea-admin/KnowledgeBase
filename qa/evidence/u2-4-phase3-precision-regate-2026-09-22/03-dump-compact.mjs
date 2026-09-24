// 03-dump-compact.mjs — compact block listing (turn id + label + first 200 chars) for labelling
// the remaining large sessions quickly; any turn whose text is truncated is marked with "...",
// and gold decisions that need more text fall back to reading turns.json directly.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const POSITIONAL = /^spk:\d+$/;
const dirs = readdirSync("data/toc-migrated", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const CLIP = 160;

for (const s of dirs) {
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", s, "turns.json"), "utf8"));
  if (!turns.some((t) => POSITIONAL.test(t.speakerRef ?? ""))) continue;
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
  const fmt = (t, tag) => `${tag} [${t._id.replace(s + "-", "")}] [${t.speakerRef}] ${(t.text ?? "").replace(/\s+/g, " ").trim().slice(0, CLIP)}${(t.text ?? "").length > CLIP ? " ..." : ""}`;
  const lines = [`# ${s} — compact block dump`];
  let bNo = 0;
  for (const b of blocks) {
    bNo++;
    lines.push(`=== B${bNo} [${b.label}] idx ${b.start}-${b.end} (${b.end - b.start + 1}t)`);
    for (let i = b.start; i <= b.end; i++) lines.push(fmt(turns[i], "B"));
    for (let i = b.start - 1; i >= Math.max(0, b.start - 2); i--) lines.push(fmt(turns[i], "c"));
    for (let i = b.end + 1; i <= Math.min(turns.length - 1, b.end + 2); i++) lines.push(fmt(turns[i], "c"));
  }
  console.log(lines.join("\n") + "\n");
}