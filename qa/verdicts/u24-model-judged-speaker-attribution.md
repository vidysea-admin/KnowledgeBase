# Verdict: u24-model-judged-speaker-attribution

VERDICT: FAIL
Cycle checked: 1
Commit checked: 5fa25015 (lane/u24smart). No model API calls. Cycle 0 verdict (FAIL) is superseded by this file.

EXPLANATION:
- ISS-U24SMART-001 original fixture: FIXED. The "Thanks Rashi" before spk:2 case is refused for all five kinds (address, called-on, handover, thanks, role-continuity).
- But the referent binding is still unsound (ISS-U24SMART-003, high). Wrong identities still ship with 3 identical runs: (a) host and cohost each say "Rashi, can you hand over to Ruby ..." before Rashi's block, proposal spk:1=Ruby (handover or address) ships; (b) "Welcome Ruby, and Rashi will go first" before Rashi's block, spk:1=Ruby ships; (c) a one-turn backchannel "Yes please." by spk:2 between the call-on and the real answerer (spk:1) makes spk:2=Priya Nair ship. The gate checks only that the name occurs in a forward-cue quote, not which name is the addressee, and two different quote speakers satisfy "independent" corroboration.
- Production exposure unchanged: still no production caller of extractSpeakers; routing unchanged.
- ISS-U24SMART-002: partly fixed. Audit passes 0/409 and --self-test prints CAUGHT, but both are blind to the original defect: with shipsAsPerson mutated back to the legacy reply shape, --self-test still prints CAUGHT and the audit still prints 0/409 (ISS-U24SMART-004, medium). The --base HEAD failure is pre-existing: the base scratch dir copies only speaker-name-rules.ts, which imports ./speaker-name-data.js, absent from the scratch dir; the diff touches neither that import nor the copy logic.
- Mutations (per-mutation backup, restore in finally, hash == HEAD blob each time, harness deleted): KILLED: drop collision check, corroboration by turn only, drop floor check, drop verbatim check. SURVIVED: remove referent binding (the THANKS_CUE line), address-backward-binds-before, drop FORWARD_CUE requirement. The new binding rules are weakly tested.
- tsc clean; 314 speaker tests pass. speaker-docs/tile-fusion modified-status remains stat-only (hash equals HEAD).

ISSUES-WRITTEN: ISS-U24SMART-003 (high), ISS-U24SMART-004 (medium) in qa/issues.u24smart.jsonl
