# iss-u24smart5-001-devanagari-second-name

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2-adjacent (open medium ISS-U24SMART5-001; attribution of names to speakers, FULL ceremony). Lane: lane/u24deva, branched from lane/u24smart5 7b09a6fd. No model calls.

## What was wrong
`otherNamesIn` (the "two people in one quote: abstain" rule) knew only Latin conjunctions (aur/ya/evam/tatha) and used `\b` and `\p{L}`, which do not see Devanagari: "Rashi और प्रिया" / "Rashi या प्रिया" shipped under an always-yes verifier.

## Fix (packages/index/src/pipeline/speaker-rules/speakers-grounding.ts only)
- Span, name and candidate set are folded to NFC with ZWJ/ZWNJ/soft-hyphen stripped before matching.
- Words are `[\p{L}\p{M}]...` (Devanagari vowel signs/viramas are marks).
- Conjunctions: और, या, एवं, तथा, व (plus aur/ya/evam/tatha). The token after one, in ANY script, is a second person unless it is a Hindi/Hinglish function word (new Devanagari stoplist). English and/or/with count only before a Devanagari word ("Rashi and प्रिया").
- "X <Devanagari conj> OWN/known-name" also flags X ("प्रिया और Rashi").
- A known candidate name (any script) anywhere in the span already abstained; now works for Devanagari/NFD too.
- Policy stance: abstain. Cost: bare Devanagari nouns after a conjunction abstain (below).

## Reproductions
- ISS-U24SMART5-001 recorded cases: 2/2 refused ("Rashi और प्रिया please बताइए अब", "Rashi या प्रिया ..."; always-yes verifier, proposals called-on + thanks).
- Additional mixed/script attacks: 11/11 refused (एवं, तथा, व, "and प्रिया", "aur प्रिया", "और priya", "और Priya", "प्रिया और Rashi", "आप और प्रिया", NBSP + decomposed nukta, stray ZWJ).
- Legit single-name Devanagari quotes: 5/5 still ship (e.g. "Rashi, आप बताइए please", "धन्यवाद Rashi आपने ...", "Rashi, आप और मैं मिलकर ...").
- Prior ISS-U24SMART-001..005 attacks: all existing tests green (46 pre-existing speakers-grounded tests pass).
- Not delivered: live-verifier re-gate (model run).

## Recall measurement (otherNamesIn only, 16 legit single-name quotes, old HEAD vs new)
Old false-abstain 0/16, new 3/16. New false abstains: "Rashi, आपका सुझाव और अनुभव बताइए" (अनुभव), "Rashi, यह रिपोर्ट तथा डेटा देखिए" (डेटा), "Rashi, आपने समय पर और सही बताया" (सही) -- Devanagari common nouns/adjectives after a conjunction cannot be told from names without a lexicon. Left as abstains (cheap). English/Latin legit controls unchanged (0 change).

## Evidence
```
speakers-grounded.test.ts: 48 tests -> now 48 pass (46 + 2 new)
node --test --import tsx "src/**/*.test.ts" (packages/index): ℹ tests 634 ℹ pass 634 ℹ fail 0
tsc --noEmit -p packages/index -> exit 0
Mutations (9 run, per-mutation byte backup in finally, harness deleted): 8 KILLED, 1 SURVIVED
  KILLED: drop और; skip NFC on span; no \p{M}; stoplist ignored; no pre-conj branch; English conj unrestricted
  SURVIVED: skip NFC on the known-name set only (known names come from NFC transcript text; low value)
```
