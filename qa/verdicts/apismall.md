# Verdict: apismall

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 9495c4bd70ec86407425dccc1a1be2f1694767db
Base: a9fac545 (candidate = cc7fb129 then 9495c4bd)

## Independently produced evidence (node --test --test-force-exit --import tsx, timeout 600, exit codes captured)
- calendar-link-extract.test.ts: exit 0, 17/17 pass.
- semantic-search/route.test.ts: exit 0, 8/8 pass (incl. ISS-T008SEARCH-001 and -002 tests).

## 1. T-036 guard path (cc7fb129)
packages/meeting-bot/src/platform.ts is a one-line re-export of ../../ingest/src/join-policy/platform.js (5c4cbade is an ancestor of base). Canonical packages/ingest/src/join-policy/platform.ts:20 has `host === "meet.google.com" || host.endsWith(".meet.google.com")` -> "meet"; it also holds teams, zoom, webex, zoho regex (line 33) and cloudonair (line 34). The guard therefore still guards real Meet support. Test-only change; no production behaviour moved.
Note (not a finding): the guard is a substring `includes` check, pre-existing and unchanged in strength.

## 2. ISS-T008SEARCH-001 replay (D-015)
Recorded reproductions in qa/issues.T008SEARCH.jsonl: q of 12000 chars (returned 200 at base) and 200000 chars (ECONNRESET).
Replay script written in lane scratch dir (removed after), real HTTP server with spy embedder:
- n=12000 -> 400; n=200000 -> fetch threw ECONNRESET (Node header limit, before the handler); embedder calls = 0.
Corpus count by id: ISS-T008SEARCH-001: 1/2 refused with 400 by the route, 1/2 refused by transport (ECONNRESET, embedder never reached); 2/2 never reach the embedder. Maker's own 4/4 (12000, 513, 600-space-padded both sides) re-run and pass; cap 512 accepted.
(A libuv teardown assertion on Windows after --test-force-exit appeared in my ad-hoc script after the test had passed; harness noise.)

## 3. Mutation (own, per-mutation byte backup, timeout 600, trap, HEAD fidelity)
M1: route.ts `Array.from(q).length > MAX_Q_CHARS` -> `Array.from(q.trim()).length > MAX_Q_CHARS` (the base behaviour). Suite exit 1, 7 pass / 1 fail; killed by "ISS-T008SEARCH-001 recorded..." with `q length 604` (the whitespace-padding case). Restored; cmp ok; `git hash-object` == `git rev-parse HEAD:` (2cc60df0...).
M2: production.ts `semanticSearch: undefined,` -> `semanticSearch: {} as never,`. Killed by the ISS-T008SEARCH-002 test. Restored; hash == HEAD blob (41b37178...).
Lane tree clean afterwards (no candidate file modified).

## 4. 200000-char case unreplayable over HTTP: ACCEPTABLE
Node's max header size rejects the request line before Express; the paid embedder is provably not reached (calls=0). The refusal is real, platform-level, and not regressed by the change (same at base). The bound logic is the same single `Array.from(q).length > 512` comparison already exercised at 12000/513/604. The maker named the case and its reason rather than omitting it (D-015 satisfied).

## 5. ISS-T008SEARCH-002 text pin: ADEQUATE
Verified at base a9fac545: production.ts:218 already reads `semanticSearch: undefined` (D-173 dormant), and no semanticSearchEnabled/LKB_SEMANTIC_SEARCH reference exists in composition. The original defect (flag-join line unpinned) no longer exists because the flag join was removed. The pin asserts the literal and bans the flag names; M2 shows it kills enabling the route. Limit: it is a source-text regex, so it will need an intentional edit when T-008 is re-activated under a later decision (desired tripwire).

## Findings
None blocking. ISSUES-WRITTEN: none.

## Ledger
ISS-T008SEARCH-001 and ISS-T008SEARCH-002 (qa/issues.T008SEARCH.jsonl) may be flipped to fixed/verified at 9495c4bd. ISS-W16T036DISC-001: no ledger file found by name in this lane; its guard-path fix is verified, flip if a row exists elsewhere.

## Not verified
No full suites, no real embedder/network, no typecheck of the whole repo; only the two touched test files were run. Metrics/review_budget assess not run (budget not itemised by orchestrator).
