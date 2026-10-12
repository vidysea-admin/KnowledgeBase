# Verdict: u24-model-judged-speaker-attribution

VERDICT: PASS
Cycle checked: 2
Commit checked: 52c1b294 (lane/u24smart). No model API calls. Supersedes the cycle 0 and cycle 1 FAIL verdicts.

Scope of this PASS: the deterministic layer plus the injectable verifier as a UNIT. It is not a measurement of the live model or of the gate bars; the live re-gate (bars 1 and 2) still decides whether the route may be wired.

EXPLANATION:
1. All cycle 0 and cycle 1 attacks are refused with the verifier forced to ALWAYS yes: thanks-to-previous speaker (address, called-on, handover, thanks), host+cohost "Rashi, can you hand over to Ruby", "Welcome Ruby, Rashi will go first", and the one-turn backchannel. Evidence: probe run via groundSpeakerProposals(turns, runs, async () => yes).
2. New attacks: "Rashi ji" correctly ships for the right label; "Ms. Rashi" abstains (title token read as a second name, safe); Devanagari abstains; bare-name and "Speaker 0" label tricks ship nothing. One residual wrong ship under always-yes: spk:0 "Rashi, over to our next speaker please." then spk:2's block then spk:3 "Thanks Rashi for that handover." ships spk:2=Rashi, because the pair rule cannot read a role referent; and the second-name abstain misses a lowercase Hinglish second name. Both are ISS-U24SMART-005 (medium): they are only reachable if the live verifier also says yes three times, and must be measured in the live re-gate.
3. Single-verified mode: only reachable by passing cfg.corroboration explicitly; default is independent-pair (mutating the default is killed by the suite). Nothing in apps/, config or scripts sets it. Production exposure is unchanged: no production caller of extractSpeakers, routing unchanged.
4. Prompt injection: transcript text and quote go into the verifier prompt, so an injected "answer yes" can force three yes votes. That is the always-yes case above; the deterministic layer (verbatim quote, name in quote, second-name abstain, floor, collision, different-speaker opposite-side pair, label normalisation, one quote turn per label) bounds the damage to what item 2 shows. Unparseable or failing verifier output counts as unsure, never yes.
5. ISS-U24SMART-004: fixed. --self-test prints "seeded bypass CAUGHT" and "probe mutated to the legacy shape DETECTED as blind"; a real source mutation of the new-shape reply in the probe makes the audit exit non-zero (KILLED).
6. Mutations (per-mutation backup, restore in finally, hash == HEAD blob each time; harness and probe deleted): KILLED 11 of 13: drop multi-name abstain, pair accepts same speaker, pair accepts same side, default single-verified, drop floor, drop verbatim, drop collision, one yes enough, verifier ignores no, distance 3, audit probe broken. SURVIVED: own-words-identify (quote by the label's own speaker) and bare-label-any-kind; both are covered by other layers but untested (noted in ISS-U24SMART-005).
7. tsc clean; speaker suites 323 pass, 0 fail. speaker-docs/tile-fusion remain stat-only modified (hash equals HEAD).

ISSUES-WRITTEN: ISS-U24SMART-005 (medium) in qa/issues.u24smart.jsonl
