# Verdict: u24-model-judged-speaker-attribution

VERDICT: FAIL
Cycle checked: 0
Commit checked: 9a8618bb (lane/u24smart). No model API calls were made.

EXPLANATION:
1. Production exposure: NOT reachable. `extractSpeakers` has no production caller. It is only re-exported from packages/index/src/index.ts, and the sole other importer is scripts/lib/audit-closed-class.mjs. `scripts/sync-speakers.mjs` calls `resolveSpeakers` only. No file under apps/ or packages/ outside pipeline tests imports it. config/ai-routing.yaml is unchanged (`speakers: [ollama]`), and the gate file says the route is switched only after a model passes, in a separate unit (D-127/D-131 Result). So the swap is not live and no flag is needed now. Note: the swap leaves no wiring switch either; the later wiring unit must keep the gate. Side effect: audit-closed-class.mjs is now vacuous (ISS-U24SMART-002, medium).
2. Grounding soundness: FAIL. Fabricated and paraphrased quotes are refused (punctuation-stripped Hinglish quote abstains, NFD-vs-NFC abstains, 11 tests die when the verbatim check is dropped). Devanagari names abstain (looksLikeAName is Latin-shaped), which is safe but means zero recall there. But the gate never checks WHO a quote names. Fixture: host (spk:0) says "Thanks Rashi, that was clear. Now over to our next speaker." and "Thank you Rashi, great point. Next up ..." each directly before spk:2's block, with the real Rashi as spk:1. Proposals {spk:2, Rashi, address} (or called-on), 3 runs, ship `spk:2 = Rashi`: a wrong identity. The thanks-to-previous-speaker pattern recurs at every handover, so the 2-distinct-turn corroboration is met by the same wrong pattern. A model that mislabels once per session gets through. This breaks bar 1/2 and the stated design promise. ISS-U24SMART-001 (high).
3. Floor: the floor check is present and mutation-tested (see 5). Existing speaker suites: 311 tests pass (speaker*.test.ts), speakers-grounded 30/30. `tsc --noEmit -p packages/index` clean.
4. speaker-docs.test.ts and speaker-tile-fusion.test.ts: `git hash-object` equals the HEAD blob for both, `git diff --quiet` is 0, index and worktree are LF with core.autocrlf=true. This is a stat/autocrlf refresh artifact, not a content change. Do not commit them; `git update-index --refresh` (or leaving them) is harmless for the merge.
5. Mutations (per-mutation byte backup, restore in finally, hash == HEAD blob after each, harness deleted): drop verbatim check KILLED (11 fail); agreement threshold 2->1 KILLED (2); drop floor check KILLED (1); thanks accepts before-side KILLED (1); drop corroboration KILLED (10); called-on accepts either side KILLED (1). All 6 killed. The test suite does not cover the who-is-named hole above.
6. Offline stress result in the manifest (synthetic quotes) is not a model measurement; unchanged.

Required fix: close ISS-U24SMART-001 with a regression using the exact fixture, then re-submit. Optional before merge: ISS-U24SMART-002.

ISSUES-WRITTEN: ISS-U24SMART-001 (high), ISS-U24SMART-002 (medium) in qa/issues.u24smart.jsonl
