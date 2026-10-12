# Verdict: iss-browsercheck-001-mint-join-rules-scope

VERDICT: PASS
Cycle checked: 0
Commit checked: 89e13f9 (lane/mintjoin)
Scope: which scopes scripts/mint-key.mjs can put on a key (auth class). No DB connected, no key minted.

## EXPLANATION

- Defaults: the DEFAULT_SCOPES literal (same 14 names, same order) is byte-identical to HEAD~1 (identical md5 of the array text). The source diff is only `WRITE_SCOPES = ["send-now","join-rules"]` plus a comment.
- Injection probes on `scopesFromArgv` (own script, pure function): `send-now,keys` throws on keys; `join-rules,*` throws; `Join-Rules`/`JOIN-RULES` throw; `--with-scope ""` throws "needs a scope name"; `join-rules,` and `join-rules,,send-now` throw (empty element); `join-rules\0`, `join-rules send-now`, `__proto__`, `constructor`, `admin`, `ask` all throw. Accepted: `" join-rules"` (trimmed to join-rules, harmless), `send-now,join-rules`, and a repeated flag (duplicates collapse to one entry). Nothing outside the two allowed names ever reaches the key; `keys` and other scopes are not mintable through this path, same as before (the only change is that join-rules is now allowed).
- Validation order (read): `scopesFromArgv` runs at top level, exits 1 on throw, BEFORE the dynamic import of packages/db, `assertValidTenantId`, and `connect`. Confirmed.
- send-now.test.ts change: the edited assertions were in the MINTING test (`scopesFromArgv` / `WRITE_SCOPES`), not an API scope test. The API tests are untouched: `read-key` (scopes calendar, join-rules, ask) still gets 403 on send-now (lines 48 and 174), `near-key` lookalikes still 403. Not a weakening; `keys`, `send-nowx`, `send-now,admin` stay in the must-refuse list.
- Tests re-run: mint-scopes 5/5, send-now 12/12.
- Mutations (own harness in the worktree, per-mutation backup restored in `finally`, application verified by hash change, SIGKILL timeout): A "allow any scope via --with-scope" -> KILLED (mint-scopes red, send-now red); B "join-rules in DEFAULT_SCOPES" -> KILLED (both red). 2/2.
- After: mint-scopes.mjs hash equals HEAD blob; harness and probe deleted; `git status` clean in the worktree and main tree.
- Note (low, not filed as a unit): the `--with-scope=join-rules` (equals) form is not recognised and is silently ignored, so it mints a DEFAULT key with no error. This is fail-safe (weaker key, never stronger), but it contradicts "unknown/typo exit 1" for that spelling; the editor key would open read-only again, the very symptom of ISS-BROWSERCHECK-001. Also ISS-MINTJOIN-001 (seed-demo-server unchanged) agreed as low.

ISSUES-WRITTEN: none
