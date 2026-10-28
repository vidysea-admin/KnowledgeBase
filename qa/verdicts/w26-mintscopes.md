# Verdict: w26-mintscopes

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 612126c849e04750cce57a58de91f5369d8237f7
Base: fd471686
Security class: credential issuance

## Independent evidence (checker-run, all exit 0 unless noted)
- Diff reviewed `fd471686..612126c8` (6 files). mint-key.mjs change is two lines: import + stderr warning. Tenant validation, `requireScriptDatabase` guard, sha256 `keyHash` storage and the single `console.log(rawKey)` are untouched. The warning text does not contain the key.
- `node --test scripts/lib/mint-scopes.test.mjs`: 10/10 pass.
- `node --test --import tsx src/join-rules/send-now.test.ts` (apps/api): 13/13 pass (incl. minting test).
- lint-loc stage `lint-tests` run alone (`node --test scripts/lint.test.mjs`, timeout 580): 18/18 pass, exit 0, 107 s. Closes the maker's open gap.
- CLI: `node scripts/mint-key.mjs --scopes nope` exits 1 before any DB connect.
- Direct probes of `scopesFromArgv`: `*`, `jobs,*`, `JOBS`, `jobs,,hosting`, `,`, `__proto__`, `constructor`, zero-width-char suffix all throw. `--with-scope jobs|hosting` still refused (write scopes only). `--scopes ask` and no flags give the unchanged 14 default scopes. `--all-scopes --scopes x` throws. `--all-scopes` yields 24 unique scopes.
- Drift guard: every `requireScope("...")`/`('...')` literal in apps/api/src is in ALL_SCOPES. Non-literal call sites use constants (`SEND_NOW_SCOPE`, `WRITE_SCOPE`, `REGISTRATION_APPROVE_SCOPE`, `route.scope` from pages.ts stubs); their values (send-now, join-rules, registration:approve, ask/compete/sessions/...) are all in ALL_SCOPES.

## D-020 mutations (per-mutation byte backup, trap INT/TERM/ERR, timeout 120, HEAD hash check)
- M1: scope validation `if (!ALL_SCOPES.includes(s))` -> `if (false)`: 8 pass / 2 fail (killed: "--scopes rejects unknown...", "--all-scopes still validates other flags").
- M2: drop `"jobs"` from EXTRA_SCOPES (drift): 7 pass / 3 fail incl. the drift guard (killed).
- After each: restored; `git hash-object scripts/lib/mint-scopes.mjs` = d70ecc22 (equals `HEAD:` blob); `git status` clean.

## Notes (EXPLANATION, no issues filed)
- Whitespace around a comma-list entry is trimmed (`" jobs "` accepted as `jobs`); case variants, empties and wildcards are rejected. Pre-existing trimming behaviour, benign.
- `--scopes=jobs` (equals form) is silently ignored, producing a default key (weaker, not stronger). Same as existing `--with-scope=` handling; low.
- The drift guard scans literal `requireScope("x")` only; a new scope introduced via a new constant would not be caught. Current constants are covered. Low.
- Not run: real-DB mint (no Mongo allowed); DB path is unchanged by the diff.

ISSUES-WRITTEN: none
Ledger rows: none to flip. Maker may close out to checked-PASS.
Efficiency: checker token/active-time totals not measured by host; ratio unverified.
