# Verdict: iss-u24smart-005-forward-cue-and-lowercase-second-name

VERDICT: PASS
Cycle checked: 0
Commit checked: cdae3083 (lane/u24smart5). No model calls; verifier forced to always-yes in every probe.

EXPLANATION:
1. Cycle-2 fixture and variants all refused: "Rashi, over to our next speaker please." + "Thanks Rashi for that handover." (4 kind combinations in the manifest, exact fixture re-run by me), cue mid-sentence ("Great talk, so Rashi, now hand over to our next speaker"), pronoun ("over to her colleague", "Rashi just finished, so over to her"), lowercase second name ("aap aur ruby"). Cycle 0/1/2 attacks (thanks-to-previous, hand over to Ruby, backchannel) still refused. Legit pairs still ship: "now over to Ruby" + "Thanks Ruby", plain call-on + thanks, welcome, invite, "next speaker is Rashi", "over to you Rashi".
2. Devanagari: "Rashi और प्रिया" / "Rashi या प्रिया" is NOT recognised as two people and ships under always-yes (ISS-U24SMART5-001, medium). The conjunction list is Latin only. Bounded by the live verifier and the pair rule; recorded, not a blocker for this fix, which targeted the Latin/Hinglish residual.
3. False abstains (ISS-U24SMART5-002, low, recall only): "Rashi, aur batayiye / aur samjhaiye ..." (aur + non-listed word), "Rashi, over to you" (name before cue, but Rashi is next) and common words equal to another label's name ("grace", "hall" vs Grace Hall) now abstain. No false abstain for "aur kuch", "ya phir", welcome/invite/next-speaker forms, or "will" with Will Smith present. Precision is unaffected.
4. Mutations (backup restored in finally, hash == HEAD blob, harness deleted): KILLED name-before-cue vocative drop removed, after-binding kept for forward quotes, forward pair ignores block, known-lowercase check dropped, Hinglish conjunction dropped, multi-name abstain removed, pair accepts same speaker (7/7). Note: one early harness run was cut off by my own shell timeout while a mutant was applied; I restored the file with `git checkout` and verified hash == HEAD blob before continuing.
5. tsc clean; full packages/index suite 632 pass, 0 fail.

ISSUES-WRITTEN: ISS-U24SMART5-001 (medium), ISS-U24SMART5-002 (low) in qa/issues.u24smart5.jsonl
