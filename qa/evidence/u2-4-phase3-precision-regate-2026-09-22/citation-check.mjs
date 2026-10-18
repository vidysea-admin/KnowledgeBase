// citation-check.mjs -- ISS-289: the scorer's citation measure, independent of the acceptance rule.
// It imports NO production predicate (no containsNameVerbatim / citesNameAsAnIntroduction). A cited
// evidence turn is valid iff it lies inside, or immediately beside (start-1 / end+1, spoken by a DIFFERENT
// speaker: the address / handover shape), a block that (a) the identity claims, (b) belongs to the
// identity's own label and (c) the gold labels as the accepted person. An identity with no claimed blocks
// (a label-wide claim) has no block to anchor a citation, so all its citations are invalid.
// Block numbering and person matching are reused from suggest-score-lib.mjs.
import { blocksOf, personMatch } from "./suggest-score-lib.mjs";

/** turns: session turns in the order the run indexed them. gold: one gold-labels.json session object.
 *  checks: [{ speakerRef, displayName, evidenceTurns: string[], blocks: [{startTurnIndex,endTurnIndex}] }]
 *  overrides: { [turnId]: goldPerson } (per-turn gold override). Returns the invalid citations. */
export function invalidCitations({ turns, gold, checks, overrides = {} }) {
  const blocks = blocksOf(turns);
  if (blocks.length !== gold.blocks.length) throw new Error(`block-count drift ${gold.session}: ${blocks.length} vs gold ${gold.blocks.length}`);
  const person = new Map(gold.blocks.map((b) => [b.block, b.person ?? null]));
  const blockAt = (k) => { const i = blocks.findIndex((b) => k >= b.start && k <= b.end); return i < 0 ? null : { ...blocks[i], person: person.get(i + 1) ?? null }; };
  const idx = new Map(turns.map((t, i) => [t._id, i]));
  const invalid = [];
  for (const c of checks) {
    const anchors = (c.blocks ?? []).filter((b) => {
      const t = turns[b.startTurnIndex]; const at = t ? blockAt(b.startTurnIndex) : null;
      return at && at.label === c.speakerRef && personMatch(c.displayName, overrides[t._id] ?? at.person);
    });
    for (const e of c.evidenceTurns) {
      const k = idx.get(e);
      const ok = k !== undefined && anchors.some((b) => (k >= b.startTurnIndex && k <= b.endTurnIndex) ||
        ((k === b.startTurnIndex - 1 || k === b.endTurnIndex + 1) && turns[k].speakerRef !== c.speakerRef));
      if (!ok) invalid.push({ speakerRef: c.speakerRef, displayName: c.displayName, turnId: e });
    }
  }
  return invalid;
}
