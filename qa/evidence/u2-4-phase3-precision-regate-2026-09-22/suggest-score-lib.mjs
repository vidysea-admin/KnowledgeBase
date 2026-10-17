// suggest-score-lib.mjs -- U2.4 re-measure (w17-u24regate): pure scoring of ONE session's suggestion-path output
// against gold-labels.json. Same correctness semantics as 05-score.mjs (an entry is CORRECT iff every block it
// claims is a block of its own label whose gold person matches the name; an entry with no blocks is a label-wide
// claim, correct only if EVERY block of that label carries the name). Block ids are derived from the CURRENT
// turns in the same positional-run order the gold was labelled in; a count mismatch throws (drift guard).
const POSITIONAL = /^spk:\d+$/;
const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
export const personMatch = (accepted, goldPerson) => {
  const a = norm(accepted).split(" ").filter(Boolean), g = norm(goldPerson).split(" ").filter(Boolean);
  if (!a.length || !g.length) return false;
  const sub = (s, b) => { if (s.length > b.length) return false; for (let i = 0; i <= b.length - s.length; i++) if (s.every((w, k) => b[i + k] === w)) return true; return false; };
  return sub(a, g) || sub(g, a);
};
export function blocksOf(turns) {
  const blocks = []; let cur = null;
  turns.forEach((t, i) => {
    const ref = t.speakerRef ?? "";
    if (POSITIONAL.test(ref)) { if (cur && cur.label === ref) cur.end = i; else { if (cur) blocks.push(cur); cur = { label: ref, start: i, end: i }; } }
    else if (cur) { blocks.push(cur); cur = null; }
  });
  if (cur) blocks.push(cur);
  return blocks;
}
/** gold: one gold-labels.json session object. turns: the session turns in the order the pipeline saw them. */
export function indexGold(gold, turns, fileOrderTurns = turns) {
  const blocks = blocksOf(turns);
  // Gold block NUMBERS were labelled in file order; the pipeline sees tStart order (apps/api speaker-suggest.ts). The
  // numbering is only transferable when both orders give the same label sequence per positional block.
  const seq = (ts) => blocksOf(ts).map((b) => b.label).join(",");
  if (seq(turns) !== seq(fileOrderTurns)) throw new Error(`block-order drift ${gold.session}: tStart order and file order give different block label sequences`);
  if (blocks.length !== gold.blocks.length) throw new Error(`block-count drift ${gold.session}: ${blocks.length} vs gold ${gold.blocks.length}`);
  const person = new Map(gold.blocks.map((b) => [b.block, b.person ?? null]));
  const byLabel = new Map();
  blocks.forEach((b, i) => { const l = byLabel.get(b.label) ?? []; l.push({ ...b, blockNo: i + 1, person: person.get(i + 1) ?? null }); byLabel.set(b.label, l); });
  return { blocks, byLabel, turns };
}
export function judgeEntry(ix, e) {
  const reasons = [];
  const claimed = e.blocks ?? [];
  if (claimed.length > 0) {
    for (const c of claimed) {
      const b = ix.blocks.findIndex((x) => x.label === e.speakerRef && x.start === c.startTurnIndex);
      if (b < 0) { reasons.push(`claimed block start=${c.startTurnIndex} is not a ${e.speakerRef} block`); continue; }
      const p = ix.byLabel.get(e.speakerRef).find((x) => x.start === c.startTurnIndex).person;
      if (!personMatch(e.displayName, p)) reasons.push(`claimed block ${b + 1} gold is ${p ?? "unnamed"}`);
    }
  } else {
    reasons.push("empty blocks = label-wide identity");
    for (const b of ix.byLabel.get(e.speakerRef) ?? []) if (!personMatch(e.displayName, b.person)) reasons.push(`label-wide claim contradicted at block ${b.blockNo} (gold ${b.person ?? "unnamed"})`);
  }
  return { correct: reasons.length === 0, reasons };
}
/** Gold-named (label, person) pairs: the recall denominator. */
export function goldPairs(ix) {
  const m = new Map();
  for (const [label, bs] of ix.byLabel) for (const b of bs) if (b.person) { const k = `${label}|${norm(b.person)}`; m.set(k, { label, person: b.person, blocks: (m.get(k)?.blocks ?? 0) + 1 }); }
  return [...m.values()];
}
export function scoreSession(ix, entries) {
  const judged = entries.map((e) => ({ ...e, ...judgeEntry(ix, e) }));
  const recovered = goldPairs(ix).map((g) => ({ ...g, recovered: judged.some((j) => j.correct && j.speakerRef === g.label && personMatch(j.displayName, g.person)) }));
  return { judged, gold: recovered };
}
