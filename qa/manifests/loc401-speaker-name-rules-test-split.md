# loc401-speaker-name-rules-test-split

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (lint-loc stage red; test-file split only, no source change, no data write, no auth/tenancy). Lane: lane/loc401.

## What was wrong
`packages/index/src/pipeline/speaker-name-rules.test.ts` was 401 non-blank lines against the test budget of 400, so `lint-loc` failed on exactly that file.

## Change
Moved the whole ISS-104 cycle-5 block (the `shipped` helper, place-signal attacks and recall, cycle-5 recall cost, place-signal cost, `X here` idiom, handover cases; old lines 319-end) verbatim into new sibling `speaker-name-rules-place.test.ts`, with the same `turn`/`completion`/`replies` helpers and imports. No case or assertion dropped or edited. The D-015 ISS-104 byte-fidelity test and the ISS_093 corpus stay in the original file, untouched.

## Files
- packages/index/src/pipeline/speaker-name-rules.test.ts (shrunk)
- packages/index/src/pipeline/speaker-name-rules-place.test.ts (new)

## Evidence
- Test names, sorted, before (110 in the original file) vs after (87 + 23 = 110 across the two files): `diff` empty (NAMES-IDENTICAL).
- Original file: 87/87 pass; new file: 23/23 pass.
- Full packages/index suite (all src/**/*.test.ts): tests 635, pass 635, fail 0.
- `node scripts/lint-loc.mjs --all`: "lint:structure: OK (10 stages, 0 failed)".
- Reproduction counts: no ledger issue is fixed here; the ISS-104 corpora are unchanged and still pass.
