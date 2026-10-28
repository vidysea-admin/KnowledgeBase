# w26-mintscopes: mint-key can issue every scope the API enforces

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w26-mintscopes.md
Fix cycle: 0
Lane: KnowledgeBase-lanes/w26-mintscopes  Branch: lane/w26-mintscopes  Base: fd471686
Candidate SHA: see `git log -1 lane/w26-mintscopes` (the commit that adds this file)

## Behaviour
- There is no scope enum in the product: `requireScope(string)` (apps/api/src/auth.ts) takes free strings and keys store `scopes: string[]`. So `scripts/lib/mint-scopes.mjs` now carries `ALL_SCOPES` = DEFAULT_SCOPES + EXTRA_SCOPES (send-now, join-rules, answer-policy:read/write, automation:read/write/operate, hosting, jobs, registration:approve), taken from every `requireScope("literal")` in apps/api/src. A drift-guard test scans apps/api/src and fails if a route scope is not in `ALL_SCOPES`.
- `--scopes a,b,c`: default scopes plus the named ones (additive, like `--with-scope`, deduped); any name outside `ALL_SCOPES` throws, exit 1, before any DB connect.
- `--all-scopes`: every scope in `ALL_SCOPES`; mint-key prints `ADMIN_KEY_WARNING` to stderr (stdout still carries only the key).
- Unchanged: default key (same 14 scopes), `--with-scope` (still write scopes only), DB guard (`requireScriptDatabase`), hashed storage (sha256 `keyHash`), key printed once, label replacement.
- Consumer: `apps/api/src/join-rules/send-now.test.ts` minting test (asserts mint-key source has no `ALL_SCOPES` and calls `scopesFromArgv(process.argv`). Constant for the warning is named `ADMIN_KEY_WARNING` for that reason.

## Changed paths
scripts/mint-key.mjs, scripts/lib/mint-scopes.mjs, scripts/lib/mint-scopes.d.mts, scripts/lib/mint-scopes.test.mjs, docs/GO-LIVE-UBUNTU.md (one line), qa/manifests/w26-mintscopes.md

## Checks
- `node --test scripts/lib/mint-scopes.test.mjs`: 10 tests, 10 pass.
- `node --test --import tsx src/join-rules/send-now.test.ts` (apps/api): 13 tests, 13 pass.
- `node scripts/mint-key.mjs --scopes nope`: exits 1 with `'nope' is not a known scope`, no DB touched.
- tsc: not applicable (plain .mjs plus .d.mts; no tsconfig covers scripts/).
- lint-loc --all: see Evidence below.
- D-020 mutation: see Evidence below.

## Evidence
- D-020 mutation (per-mutation backup and trap, script outside repo): in `scopesFromArgv`, `if (!ALL_SCOPES.includes(s)) throw` replaced by `if (false) throw`. mint-scopes.test.mjs: 10 tests, 8 pass, 2 fail (mutant killed). Restored; `git -c core.autocrlf=true hash-object scripts/lib/mint-scopes.mjs` = d70ecc22 before and after.
- lint-loc --all (run twice under heavy shared load): stages loc, dirsize, root, dupes, migrations, codex-hooks, snapshot pass; `dependencies` run alone: no violations (1973 modules); `tracker --gate g1,g4,g5` run alone: exit 0 (advisories only). `lint-tests` (`node --test scripts/lint.test.mjs`) timed out at 280 s under load, so it is NOT verified; the in-harness 120 s limit also SIGTERMed it, tracker and dependencies. Checker should re-run it alone.
- Not run: no real DB mint (fakes only; DB path in mint-key.mjs is unchanged).
