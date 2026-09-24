// 10-exhaustive-relations.mts — fix cycle 1b, MODEL-FREE: every name-shaped span next to every one of the
// 240 gold blocks, through the c1b relation predicates. Candidate spans are crude (sentence-initial
// fillers like "Uh"/"I'm" appear); a real proposal must also pass the vote/shape/discourse gates.
// Usage (worktree root): tsx <this> [all]
// Model-free exhaustive check: for EVERY block in the 240-block corpus and EVERY name-shaped span in
// its neighbour turns, would the candidate relation rules bind it, and is that binding right per gold?
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = process.cwd(); // run from the worktree root
const E = join(ROOT, "qa/evidence/u2-4-phase3-precision-regate-2026-09-22");
const R = await import("../../../packages/index/src/pipeline/speaker-name-rules.ts");
const gold = JSON.parse(readFileSync(join(E, "gold-labels.json"), "utf8"));
const POS = /^spk:\d+$/;
const norm = (s: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const personMatch = (a0: string, g0: string | null) => { if (!g0) return false; const a = norm(a0).split(" "), g = norm(g0).split(" "); const sub = (s: string[], b: string[]) => { outer: for (let i = 0; i <= b.length - s.length; i++) { for (let k = 0; k < s.length; k++) if (b[i + k] !== s[k]) continue outer; return true; } return false; }; return sub(a, g) || sub(g, a); };
const useNew = typeof R.citesNameAsThanks === "function";
const tally: Record<string, { T: number; F: number; ex: string[] }> = {};
const rec = (k: string, ok: boolean, ex: string) => { const t = (tally[k] ??= { T: 0, F: 0, ex: [] }); ok ? t.T++ : t.F++; if (!ok || process.argv[2] === "all") t.ex.push((ok ? "OK " : "XX ") + ex); };
for (const g of gold.sessions) {
  const turns = JSON.parse(readFileSync(join(ROOT, "data/toc-migrated", g.session, "turns.json"), "utf8"));
  const blocks: any[] = []; let cur: any = null;
  turns.forEach((t: any, i: number) => { const ref = t.speakerRef ?? ""; if (POS.test(ref)) { if (cur && cur.label === ref) cur.end = i; else { if (cur) blocks.push(cur); cur = { label: ref, start: i, end: i }; } } else if (cur) { blocks.push(cur); cur = null; } });
  if (cur) blocks.push(cur);
  blocks.forEach((b, i) => (b.person = g.blocks.find((x: any) => x.block === i + 1)?.person ?? null, b.no = i + 1));
  const names = (text: string) => { const out = new Set<string>(); const m = text.match(/\p{Lu}[\p{L}'’.-]*(\s+\p{Lu}[\p{L}'’.-]*)?/gu) ?? []; for (const s0 of m) { const s = s0.replace(/[.'’-]+$/u, ''); out.add(s); out.add(s.split(/\s+/)[0]!); } return [...out].filter((n) => !/^(Uh|Um|I'm|She's|He's|It's|That's|Like|Yeah|Okay|So|And|But|Sorry)/.test(n) && R.looksLikeAName(n) && !R.isDiscourseOnly(n)); };
  for (const b of blocks) {
    const ex = (n: string, why: string, txt: string) => `${g.session.slice(0, 26)} blk${b.no} ${b.label}->${n} (gold ${b.person}) [${why}] :: ${txt.slice(0, 110)}`;
    const blockText = turns.slice(b.start, b.end + 1).map((t: any) => t.text ?? "");
    for (let j = b.start; j <= b.end; j++) for (const n of names(turns[j].text ?? "")) if (R.citesNameAsSelfIdentification(turns[j].text ?? "", n)) rec("own-self-id", personMatch(n, b.person), ex(n, "own", turns[j].text));
    const before = turns[b.start - 1], after = turns[b.end + 1];
    const mentionedInBlock = (n: string) => blockText.some((t: string) => R.containsNameVerbatim(t, n) && !R.citesNameAsSelfIdentification(t, n));
    if (before && before.speakerRef !== b.label) for (const n of names(before.text ?? "")) {
      const fwd = useNew ? R.citesNameAsHandover(before.text, n) : R.citesNameAsHandover(before.text, n);
      if (fwd) rec(`before-forward${mentionedInBlock(n) ? "(block-mentions:REFUSED)" : ""}`, personMatch(n, b.person), ex(n, "before", before.text));
    }
    if (after && after.speakerRef !== b.label && useNew) for (const n of names(after.text ?? "")) {
      if (R.citesNameAsThanks(after.text, n)) rec(`after-thanks${mentionedInBlock(n) ? "(block-mentions:REFUSED)" : ""}`, personMatch(n, b.person), ex(n, "after", after.text));
    }
  }
}
for (const [k, t] of Object.entries(tally)) { console.log(`${k}: correct ${t.T} wrong ${t.F}`); for (const e of t.ex) console.log("    " + e); }
