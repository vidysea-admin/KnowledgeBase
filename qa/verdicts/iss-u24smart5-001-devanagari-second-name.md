# Verdict: iss-u24smart5-001-devanagari-second-name

VERDICT: FAIL
Cycle checked: 0
Commit checked: 31603620 (lane/u24deva). No model calls; verifier forced to always-yes.

EXPLANATION:
1. Attacks, all refused on HEAD: Devanagari second name after और (NFC and NFD), ZWJ inside the conjunction, ZWJ inside the second name, ZWNJ before the conjunction, romanized second name after a Devanagari conjunction, Devanagari own name with a romanized "aur Priya", NFD Devanagari own name, a Devanagari known candidate in an NFD session, NFD Latin known candidate with a capital or after "aur". Legit Devanagari single-name quote and the English control still ship.
2. The surviving mutant is a REAL gap (ISS-U24DEVA-001, medium). With the known set not folded, the NFD fixture "Rashi, ask josé about the rules please." (turns and the other label's name "José Rao" NFD, the other label self-introduced as José Rao) ships spk:1=Rashi under always-yes, although the quote names a second person. On HEAD it abstains. The gap is reachable whenever a transcript or a proposed name is decomposed. Kill test: add that fixture to speakers-grounded.test.ts (everything via .normalize("NFD"), assert resolved does not contain spk:1); it fails on the mutant and passes on HEAD.
3. False abstains, 3/16 on legit Devanagari quotes (bare nouns after a conjunction: अनुभव, डेटा, सही; 0/16 before): recall only; precision unaffected. Acceptable under the prefer-abstain policy (D-132/D-141), but note for the owner: roughly one in five Hindi call-ons with "और <noun>" will not name a speaker until the live re-gate measures it.
4. Mutations (backup restored in finally, hash == HEAD each time, harness and probe deleted): KILLED drop Devanagari conjunctions, span without fold, drop pre-conjunction branch; SURVIVED known-set without NFC (see 2). Two other mutation patterns did not apply to the source text and were not run.
5. tsc clean; full packages/index suite 635 pass, 0 fail.

ISSUES-WRITTEN: ISS-U24DEVA-001 (medium) in qa/issues.u24deva.jsonl
