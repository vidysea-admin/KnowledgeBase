# Verdict: u2-4-suggestion-regate-w17

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: fd67447807a87a0044e7de93f8ed2d19dd36677e
Base SHA: a0391420451b3a1f465d0862378cec3492f0133f
Lane: lane/w17-u24regate (C:/Users/product/Desktop/KnowledgeBase-lanes/w17-u24regate)
Scope: evaluation-only unit (harness + scorer + live evidence). No production code in the diff (8 files, all under qa/).
ISSUES-WRITTEN: none
ISS-282 flip: NO (see "ISS-282 ruling")

## Identity
- `git rev-parse HEAD` in lane = fd674478...; one commit a0391420..fd674478; diff = 7 files under
  qa/evidence/u2-4-phase3-precision-regate-2026-09-22/ + qa/manifests/u2-4-suggestion-regate-w17.md. Lane tree clean.
- Blob hashes at review: suggest-score-lib.mjs 7f2a6968, 10-suggest-score.mjs 01f5709d, 09-suggest-regate.mts 854dc1d4,
  run-results.u24regate-20261017.jsonl 257eead2, call-log.u24regate-20261017.jsonl 269551db,
  measurement-summary.u24regate-20261017.json ad9cdcc5.

## 1. Privacy (public remote) - clean
Independent scan (scratchpad u24/priv.py, names.py) of every string in the three committed result files, including
model JSON nested in call-log `text` and the 60-char prompt prefixes (`asks`), against all text blobs tracked at BASE
a0391420 (9,196 files, read from git objects, not the working tree):
- Vocabulary: every word in the new files exists in base-tracked content; the only 2 new tokens are `T18` and `u24regate`.
- Names: all 71 distinct name/displayName/personId values (incl. full names such as Kshitij Garg, Shagun Handa,
  Ruby Thomas, Mitul Shah, Jubin Thakkar, Priyanka Roy, Deepak Matrani, YY Sang) are tracked at base in
  data/toc-migrated and existing evidence.
- Quotes: every model evidenceQuote is a verbatim substring of base-tracked text except 3 model-stitched/paraphrased
  quotes whose fragments are each tracked verbatim (visa "Thank you so much, Bhakti. And with that..." = two tracked
  turns joined; leeds "Alka ma'am" quote and metrics "I am Deepak... SAT Math" = tracked text with small edits).
  No new information.
- Secrets: 0 hits for sk-/AIza/Bearer/api_key/OLLAMA_API_KEY/32+hex/mongodb URI/password/secret. 09-suggest-regate.mts
  reads the key from .env into memory only; the call-log writes no headers.

## 2. Scoring correctness - verified
- Gold is the recorded ISS-282 gold: gold-labels.json blob a1d86d54, single commit a6532299 (2026-09-24, the
  ISS-282 date), unchanged at base and candidate. Not maker-authored (D-015 satisfied).
- suggest-score-lib.mjs:37-51 judges CORRECT only if every claimed block start is a block of the same label whose gold
  person matches (`personMatch`, identical to 05-score.mjs:46-58). Label-wide (no-block) claims are always wrong -
  stricter than the header comment at :3-4 says (comment says "correct only if EVERY block carries the name"); this can
  only lower precision. Note only.
- Independent re-derivation (own Python, tStart order, start AND end bounds checked): all 15 entries (3 final +
  12 suggested) map to a gold block of the right label, exact end bound, gold person matching. Hand-checked:
  leeds spk:0 Jubin Thakkar -> block 6 gold "Jubin Thakkar"; in-focus-3 spk:6 Bhakti -> block 17 gold "Bhakti";
  creative-futures spk:0 Priyanka Roy -> blocks 1,2 gold "Priyanka". 28 gold (session,label,person) pairs; recovered
  any-run final 1, suggested 8; every-run final 1, suggested 2. measurement-summary numbers match exactly.
  33 lines (3 runs x 11), 294 provider calls, 0 degraded.
- Visa order claim confirmed: 118 turns move under tStart sort; block label sequence is identical, so gold block
  numbering transfers; indexGold throws otherwise (suggest-score-lib.mjs:30).
- Note: 05-score.mjs:38 TURN_OVERRIDES (in-focus-3 t071 -> Shithij) is not carried into the new lib. No effect here:
  t071 is not a block start in tStart order and no output claimed it. Carry it over if the lib is reused.

## 3. Old window path retired in production at a0391420 - confirmed
`speakers-llm.ts:320` re-exports `extractSpeakersGrounded as extractSpeakers`; the only production caller,
apps/api/src/indexing/speaker-suggest.ts:59, calls `extractSpeakersGrounded(..., { suggest: true })`. The window
extractor survives only as `extractSpeakersRuleBased` (speakers-llm.ts:161, exported from packages/index/src/index.ts:33)
with no caller in apps/ or packages/ src; its only user is the audit harness scripts/lib/audit-closed-class.mjs.

## 4. Tests (timeout 600, no live LLM, no network)
- `node --test --test-force-exit .../suggest-score-lib.test.mjs` -> exit 0, 6/6 pass.
- `node --test --test-force-exit .../corpus-lock.test.mjs` -> exit 0, 4/4 pass (temp-dir fixtures).
- verifyCorpus() on real corpus -> exit 0 (11 pinned sessions; 6 unpinned sessions named).
- `python contracts/verify_contracts.py` -> exit 0 (vacuous); `node scripts/lint-loc.mjs --all` -> exit 0.

## 5. Mutation (D-020, per-mutation backup, trap EXIT/INT/TERM/ERR, timeout 600)
M1 suggest-score-lib.mjs:51 `correct: reasons.length === 0` -> `correct: true` (count any output as correct):
green exit 0 -> mutant exit 1, 3 named failures (block-scoped claims, label-wide claim, recall counts only CORRECT)
-> restored, `git hash-object` = HEAD blob 7f2a6968, restored-green exit 0. KILLED.

## ISS-282 ruling - may NOT be flipped
Gate bars (qa/gates/speaker-segment-identity.md phase 3; qa/contracts/goal-U24.md criterion 4; D-132 keeps bars 1-2):
- Bar 1, 100% accepted precision: MET (final 3/3, suggested 12/12). Small n: 15 entries, 9 distinct pairs.
- Bar 2, zero wrong links: MET (0/15).
- Bar 3, floor preserved: no contradiction measured. The grounded `resolved` list does not itself carry the floor
  (visa spk:2 Ruby is floor-only in all 3 runs); production composes the floor separately.
- Bar 4, stable accepted facts: MET for final (11/11 identical); suggested 8/11.
- Bar 5, at least one correct addition: MISSED for auto-final. The only final output (Jubin Thakkar) is the
  deterministic floor entry, so auto-final additions = 0 (recall 1/28 = the floor). The suggested tier has 8 correct
  pairs, but these are human-gated (D-141). Whether they satisfy bar 5 is an Approver call, not a checker call.
- Recall: goal-U24.md:16-17 sets no recall threshold, so 1/28 and 8/28 fail no bar.
- Integrity caveat: a complete earlier run (~240 calls) was deleted unscored (manifest "Caveats"). Any flip should
  rest on a fresh run with every run retained.
Route: HUMAN_GATE to Umesh. ISS-282 stays open.

## Not verified
Live provider behaviour was not re-run (no live LLM by brief). Maker usage unknown -> BOOTSTRAP_REVIEW. The ratio is
unverified, and checker tokens and active time were not measured (null), so the bootstrap cap was likely exceeded
(unmeasured, recorded not waived).
Evidence logs: C:/Users/product/AppData/Local/Temp/claude/C--Users-product-Desktop-KnowledgeBase/f9384bb3-0372-48e6-a6e1-76e2f748d07c/scratchpad/u24/
