# Checkpoint: ua-web (coordinator B)

**Cycle checked:** 0 · **Base:** 146f23da · **Head:** 7d5eef2f · **Policy:** proportional-verification/2026-10-19.17 · **Result:** PASS (verdict qa/verdicts/ua-web.b.md)

Evidence identity (per check): code = `git archive` of HEAD 7d5eef2f (apps/web, no uncommitted change; bound worktree clean); runner = vitest 2.1.8 from main-tree node_modules (lockfile unchanged);
env = Windows 11, Node, Chromium via Playwright, mongod 7.0 (local, db lkb_chk_uaweb_b), API from the same archive.

| Check | Command / scope | Result |
|---|---|---|
| Web suite | `vitest run` in apps/web (13 files) | 126 passed |
| App.accounts alone x2 | `vitest run src/App.accounts.test.tsx` | 14/14 passed, exit 1, 3 unhandled errors (P1) |
| Live T1..T5, viewer, revoke | Playwright against :8099 | pass (see verdict) |
| Live base path | Playwright against :8098/knowledgebase | pass |
| Mutants 1,2,3,4,4b,5a,5b,6,7 | per-mutation copy, restore verified by SHA1 vs pristine | 8 killed, M1 survived |
| Diff scope | `git diff 146f23da..HEAD` | 23 files, in scope, no deletions |

Reuse: none of this is reusable by the other coordinator (blind). Leftovers owned by this checker: mongod, API :3399 and :3398, stand-in web :8099 and :8098 (stopped at close).
