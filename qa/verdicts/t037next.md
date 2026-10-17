# Verdict: t037next

VERDICT: PASS
Cycle checked: 0
Commit checked: b248600e (lane/t037next)

EXPLANATION:
- (a) iss-t037ui-002 manifest: diff is the single line `Status: ready-for-check` -> `Status: checked-PASS`; matches its canonical `Handshake status: checked-PASS` and its verdict (VERDICT: PASS). Nothing else changed.
- Criterion 9 of qa/contracts/t037-join-rules-api-host.md reads: "9. Single writer: no other code writes the rule files." The new test pins it three ways: static mutator-name scan over apps/packages/scripts (only the store and join-rules-host.ts allowed, non-vacuity asserted), read-only scheduler path (no mutator, lock, or fs write API; exact import), a directory-addressing + write-API scan, plus behaviour (tick leaves directory byte/mtime-identical for absent/valid/corrupt files in both policies) and a 2-process lost-update test (2 x 15 opt-outs, 30 present, no partial read, no lock/tmp left).
- Run 15 times: 15/15 pass 6 fail 0.
- Mutations (byte backup, restore in finally, HEAD-blob hash verified equal after each): M1 schedule-tick.ts imports recordTenantOptOut: KILLED (fail 2). M2 store withTenantLock acquisition/release removed: KILLED (fail 1, lost-update test). M3 raw writeFileSync to a "/join-rules/x.json" string in auto-join.ts: SURVIVED. 2/3 killed. M3 is a deliberate-bypass gap in static check 3 (quote-delimited token only); filed low ISS-T037NEXT-001, file-don't-fix.
- package.json: only adds the test to test:lint; `npm run test:lint` tests 142 pass 142 fail 0. `node scripts/lint-loc.mjs --all` OK (10 stages, 0 failed).
- No production source changed (diff: package.json, 2 manifests, 1 new test). Enforcement flag untouched. Maker's 3 src/capture failures are outside this diff.

ISSUES-WRITTEN: ISS-T037NEXT-001 (low)
