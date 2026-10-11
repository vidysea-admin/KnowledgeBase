# Verdict — t037-join-rules-busy-status

VERDICT: PASS
Cycle checked: 0
Commit checked: 5717bc0 (lane/jrlock, base 1414d79). Data-write route, full ceremony. Web checked at SOURCE scope only (vitest, no live browser, per D-024). Checker ran node 24.19 from the codex runtime, targeted tests under timeouts only; scratch files outside the tree; tree clean before this commit.

## 1. Code union vs real store codes
The store's `JoinRulesStoreError.code` has 9 values (join-rules-store.ts:38): bad-tenant, corrupt, too-large, invalid, tenant-mismatch, not-a-file, write-failed, locked, lock-failed (locked and lock-failed originate in LockFailure and are re-wrapped at line 122). `JoinRulesStoreCode` in apps/api deps.ts lists the same 9: equal today. It is a HAND COPY (apps/* may not import the package), so a new store code would NOT fail tsc; the manifest's "a new code fails tsc until mapped" is true only for edits to the api copy. The drift fallback is safe (unknown code -> fixed 500 via hasOwn). Low note, no issue.

## 2. Real store through the real router
Real `loadJoinRules` / `saveJoinRules` / `recordTenant*` on a temp dir (lockWaitMs 300), real HTTP stack, key tenant-a with scopes calendar + join-rules.

| state | GET | PUT | POST approvals | POST opt-outs |
|---|---|---|---|---|
| healthy | 200 | 200 | 200 | 200 |
| live fresh lock file | 200 (load is lock-free) | 503 busy, Retry-After 5 | 503 busy, RA 5 | 503 busy, RA 5 |
| STALE lock (1 h) | 200 | 503 busy, RA 5 | 503 busy, RA 5 | 503 busy, RA 5 |
| oversize stored file (2 MB) | 500 unavailable | 500 | 500 | 500 |
| corrupt JSON / invalid doc / tenant-mismatch / tenant file is a directory | 500 unavailable | 500 | 500 | 500 |
| `join-rules` path is a regular file (cannot create dir; lock-failed) | 200 (no file) | 500 | 500 | 500 |

503 body: `{"error":"join_rules_busy","message":"join rules are busy; try again in a few seconds"}`. 500 body: `{"error":"join_rules_unavailable","message":"join rules are unavailable for this tenant"}`; no Retry-After on any 500. An oversize PUT body (60k domains) is rejected by the global body parser with 413 before the router (pre-existing, unchanged); the call-site 413 for a save-time `too-large` is covered by the double tests and mutation A9.

## 3. Leak check
For all 4 routes x 9 states (plus cross-tenant, read-only and 403 rows) the status text, every header and the whole body were searched for the temp dir, its base name, `secretdir`, `.lock`, `tenant-a.json`, `pid`, `token`, `TOKEN-SECRET`, `NOT stealing`, `C:\`, `C:/`, `node:`, `    at `, `join-rules store`: NONE found in any router response. Only hit: the pre-existing body-parser 413 HTML error page, which printed `C:\...` stack frames in this non-production test server; not router code, not this diff. Low note: confirm production runs with NODE_ENV=production so Express's default handler hides stacks.

## 4. Auth / tenant
The diff touches no scope check or tenant source (`req.auth!.tenantId` unchanged; `requireScope` lines unchanged). Real-store run with tenant-a's lock held: tenant-b key -> 200 on all four routes (never `join_rules_busy`); read-only key (calendar only) -> GET 200, PUT/approvals/opt-outs 403 forbidden exactly as before (no 503 learnable). The lock file is per tenant (`<id>.lock`).

## 5. Retry-After vs the lock
A writer busy-waits up to `DEFAULT_LOCK_WAIT_MS` 5000 ms, then throws `locked`; a lock older than `DEFAULT_LOCK_STALE_MS` 30000 ms is only REPORTED, never taken over, and ALSO surfaces as `locked`. Confirmed on the real stack: a 1 h-old lock gives 503 + Retry-After 5 indefinitely. Ruling: ACCEPTABLE for this unit. For a live holder 5 s matches the wait window; for a stale lock it is no worse than the old 500 (writes fail, nothing is lost); the manifest states it plainly ("a retry will not help until a human acts; left as is") and cites ISS-T037LOCK-001. Not failed for the takeover gap. Recorded here against ISS-T037LOCK-001 (still open, still a precondition for unattended wiring; the 503 now makes a stuck lock look transient to clients, which strengthens the alert-plus-runbook requirement). Low note (pre-existing store-lock design): `acquireLock` blocks the Node event loop with `Atomics.wait` for up to 5 s per contended request, stalling the API for all tenants.

## 6. Web string drift
Detection is `status === 503 && message === BUSY_SERVER_MESSAGE`. If the api string drifts, the page shows "Rule editing is not available on this server yet." for a transient busy state: misleading but fail-safe (no crash, no write lost). No test pins the two strings together: mutation A8 (api message changed) passes api 71/71 and web 49/49. Filed in ISS-JRLOCK-002.

## 7. Existing behaviour
`git diff 1414d79 5717bc0 -- '*.test.*'`: 0 removed lines (additions only). Pre-existing router tests pass unchanged.

## 8. Mutations (15; per-mutation byte backup, restore in `finally`, SIGKILL timeout 150 s, then `git hash-object` == `git rev-parse HEAD:<file>` checked after EACH; no mismatch; tree clean)
KILLED 11/15: A1 locked->500 (fail 6); A2 drop Retry-After (4); A4 lock-failed->busy (6); A5 drop hasOwn guard (4); A6 `guarded` stops passing the error (3); A7 503->429 (6); A9 PUT 413 mapping removed (2); W1 web busy detection off; W2 save-path busy branch removed; W5 busy text changed; W6 any 503 treated busy.
SURVIVED 4: A3 Retry-After 5->50 (test compares against the same constant); A8 api message drift (no pin); W3 load path loses the retry button on busy; W4 load path loses the busy message. W3/W4: the web test title says "on save and on load" but only exercises save. All four recorded in ISS-JRLOCK-002 (medium, not security, not a blocker: the status table, header presence, leak behaviour and save path are pinned).

## 9. D-015
ISS-JRLOCK-001 recorded reproductions 4/4 pass: PUT, approvals, opt-outs with `locked` -> 503 busy + Retry-After (busy-status.test.ts, also confirmed with the real lock file above); `lock-failed` on all three -> 500 join_rules_unavailable. ISS-JRLOCK-001 is verified: the evidence supports it (mapping, header, no leak, real-store confirmation).

## 10. Commands
- api `node --test --import tsx` router, require-scope, scope-write, tenant-source, busy-status, server tests -> tests 71 pass 71 fail 0
- web `vitest run src/pages/join-rules` -> 2 files, 49 passed
- `tsc --noEmit`: apps/api exit 0; apps/web exit 0
- `node scripts/lint-dirsize.mjs` -> OK (112 dirs). `lint-loc` -> 2 violations (speakers-llm.ts, sb_join.py), none in this unit; router.ts 142 non-blank lines.

ISSUES-WRITTEN: ISS-JRLOCK-002 (medium, qa/issues.jrlock.jsonl). ISS-JRLOCK-001 verified. Contract t037-join-rules-edit-api amended with clause 11 (status table).

EXPLANATION: The unit does what it says and nothing else: `locked` is the only 503 busy with Retry-After 5, every other code and unknown error stays the fixed 500, the 413/400 call sites are unchanged, and no store text, path, token or pid reaches any response, shown against the real store and not only doubles. Tenant isolation and scopes are untouched. The weakness is test coverage of the api/web coupling and the web load path, filed as ISS-JRLOCK-002. Not verified: the real `locked` result from a LIVE concurrent holder with the default 5000 ms wait (used 300 ms), the web page in a browser, production error-handler behaviour for body-parser errors, and the cause of the maker's M2 timeout (the same mutation ran in seconds here).
