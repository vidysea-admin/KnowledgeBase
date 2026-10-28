# iss-u24smart-005-forward-cue-and-lowercase-second-name

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 2-adjacent (open medium ISS-U24SMART-005 from the u24 cycle-2 PASS; touches attribution of names to speakers, so FULL ceremony). Lane: lane/u24smart5. No model calls.

## What was wrong
With a verifier forced to always answer yes, spk:0 "Rashi, over to our next speaker please." + spk:2's block + spk:3 "Thanks Rashi for that handover." shipped spk:2=Rashi: the first quote addresses the previous speaker, yet it was treated as a witness for the following block; different speakers on opposite sides met the pair rule. Separately a lowercase Hinglish second name ("aap aur ruby") was not read as a second person (`otherNamesIn` needed a capital).

## Fix (packages/index/src/pipeline/speaker-rules/speakers-grounding.ts only)
- `forwardDirection(span, name)`: a quote with a forward cue (over to, hand over, pass to, next speaker/presenter, next up, coming up next, welcome our next, invite*) whose name occurs BEFORE the cue is a vocative to the addressee: no candidate. A name AFTER the cue binds only the block that follows ("before" side), never the block before it.
- `Candidate.forward`; `independent()` refuses a forward-cue quote paired with evidence about a different block.
- `otherNamesIn`: also counts (case-insensitively) any word that is a session candidate name (proposed names + non-positional labels), and the word after Hinglish "aur/ya/evam/tatha" unless it is in a small Hinglish function-word list. False abstains are accepted.
- Tests (speakers-grounded.test.ts): 4 new tests.

## Reproductions
- ISS-U24SMART-005 checker fixture (always-yes verifier), 4 kind combinations (handover+thanks, address+thanks, called-on+handover, handover+handover): 4/4 refused (previously shipped spk:2=Rashi).
- Lowercase second name: 2/2 abstain ("aap aur ruby", "aap ya priyanka"); known-name-lowercase and function-word unit checks pass; single-name control ships.
- Prior ISS-U24SMART-001..004 cycle 0/1/2 attacks (thanks-to-previous x kinds, hand over to Ruby, Welcome Ruby, backchannel, Rashi ji etc.): all existing tests still green, i.e. all still refused.
- Legitimate pairs: "Now over to Rashi..." + "Thanks Rashi..." ships spk:2=Rashi; thanks-after + call-on-before on different blocks (existing test) still ships.
- Not delivered: the live-verifier re-gate (the fix_direction asks for it); that is a model run, not done here.

## Evidence
```
node --test --import tsx (all packages/index *.test.ts): ℹ tests 632 ℹ pass 632 ℹ fail 0
speakers-grounded.test.ts: tests 50, all pass (46 before + 4 new)
tsc --noEmit -p packages/index -> clean
Mutations (6, harness in worktree, byte backup restored in finally, deleted before commit): 6/6 KILLED
  forward-always-any, vocative-name-before-cue-ok, after-binding-kept-for-forward, forward-pair-ignores-block, drop-known-lowercase, drop-hinglish-conj
```
