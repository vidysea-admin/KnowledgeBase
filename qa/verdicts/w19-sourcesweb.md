# Verdict - w19-sourcesweb

VERDICT: PASS
Cycle checked: 2
Reviewed SHA: 4f965e2ba3630a5c94185b3136c1a1b67abd1195
Base SHA: 121290ba (cycle 1 candidate 6fbc6b41, verdict commit 22a490b8)
Contract: qa/contracts/goal-t055.md C6

## Cycle 2 findings
- Cycle 1 finding 1 is fixed. `sourceLabel()` (SourcesPage.tsx:9-17) now calls `safeHttpUrl(s.url)` from `../safe-url.js`, then rejects URLs with credentials, and falls back to `kind (captureMode) date` otherwise.
- Cycle 1 finding 2 is fixed. A `test.each` covers whitespace-padded, ftp, file, javascript and credentials URLs. Each case asserts the fallback label and that no host, credentials or path text appears.
- Cycle 1 note 3 is fixed. The fixture now uses a single `as Source[]` cast on a non-fresh object (knowledgeDirectoryFixtures.ts:5).
- Integrator note: `safePublicResourceUrl` is on master via PR #5 and is not on this base. After merge, an integrator should consider switching `sourceLabel()` to it. This is not a defect here.

## Commands (from apps/web, `timeout 600`; evidence in qa/evidence/w19-sourcesweb-check/c2-*, untracked)
- vitest, 3 files: exit 0, 3 files and 26 tests passed.
- tsc `--noEmit -p tsconfig.json`: exit 0.
- Mutation A, `safeHttpUrl(s.url)` replaced by `s.url ?? null` (the equivalent of removing the protocol check): 4 failed, 10 passed, KILLED. In cycle 1 the equivalent mutant survived.
- Mutation B, credentials check replaced by `true`: 1 failed, 13 passed, KILLED.
- Per-mutation byte backup and trap, `cmp` restore, then HEAD-fidelity: `git hash-object apps/web/src/pages/SourcesPage.tsx` = 34c41fcf7cfb9c2976e8666a6a3c6a70ec981fe5 = `HEAD:` blob (matches).

## Limits
- lint-loc `--all` not re-run. Checker token and time metrics unmeasured (null). No browser run.
- Ledger rows may be flipped: YES, for the w19-sourcesweb web consumer of the C6 source.path leakage.

ISSUES-WRITTEN: none

# Superseded history

Cycle 1 result (superseded): FAIL
Cycle 1 checked: 1
Cycle 1 reviewed SHA: 6fbc6b41d1751473130b76e5feb49dc6e17cf15a
Base SHA: 121290ba
Contract: qa/contracts/goal-t055.md C6 (safe absolute http(s) only; no local source.path leakage)

## Findings

1. FAIL, apps/web/src/pages/SourcesPage.tsx:8-17 `sourceLabel()` does not reuse `safeHttpUrl` from apps/web/src/safe-url.ts (the repo's single http(s) gate, used by AskPage, AgendaView, EventDetail, CounsellorPage, AnswerSources). It hand-rolls `new URL()` plus a protocol check. That is weaker than C6 and the helper: `new URL()` trims, so a URL with surrounding whitespace or control characters is accepted and rendered, where `safeHttpUrl` returns null. Fix: `const safe = safeHttpUrl(s.url); if (safe) { const u = new URL(safe); return host + path }`.
2. Test gap (same finding). Removing the protocol check (mutation A: `u.protocol === ...` replaced by `true`) leaves all 9 tests green. The tests pin only `javascript:alert(1)` (and only the absence of the word "javascript"). Fix: add cases for `" https://a.test/x"` (whitespace), `"ftp://a.test/x"`, `"file:///C:/x"` and `"https://user:pw@a.test/x"`. Each should fall back to the `kind (captureMode) date` label with no host, credentials or path in the DOM.
3. Note, not a finding: `knowledgeDirectoryFixtures.ts:3` uses `as unknown as Source[]`. I checked the fixture row by hand. Every other field (`_id`, `kind`, `captureMode`, `createdAt`, `url`) matches `Source`, and `path` is the only excess property, so no real mismatch is hidden today. `as Source[]` would be enough, because an excess property is allowed in an assertion. The double cast would silently hide a future required-field or type drift. Consumers do not read `path`: `knowledgeDirectoryModel.test.ts:11` asserts the resource has no `path`.
4. Note: the search matches the raw `url`, `hash` and `createdAt` strings, which are not necessarily shown. A non-http `url` string (for example a legacy path-shaped value) can therefore still be matched by search, although it is never rendered. Low severity, no action.

## Verified clauses

- Verify 1, no path-like string reaches the DOM: PASS. `grep` finds no `.path` read of a Source in `apps/web/src`. The label comes only from the http(s) url host+path or `kind (captureMode) date`. Mutation C (display re-reads `path`) is killed by the new DOM test.
- Verify 2, safe-url reuse: FAIL (finding 1).
- Verify 3, fixtures cast: PASS with a note (finding 3).

## Commands (from apps/web, node 24.19.0 prepended to PATH; exit codes and full output in qa/evidence/w19-sourcesweb-check/, untracked)

- vitest, 3 files (SourcesPage.test.tsx, KnowledgeDirectoryPage.test.tsx, KnowledgeDirectoryIntegration.test.tsx), `timeout 600`: exit 0, 3 files and 21 tests passed (vitest.exit, vitest.txt).
- tsc `--noEmit -p tsconfig.json`, `timeout 600`: exit 0 (tsc.exit).
- Mutations: `timeout 600` on each run, per-mutation byte backup, trap on EXIT/INT/TERM/ERR, restore, `cmp`, then HEAD-fidelity check.
  - A: remove the protocol check. 9/9 pass, so the mutant SURVIVED (finding 2).
  - B: add `(source as any).path` to the search fields. 1 failed, 8 passed, killed by the search test.
  - C: display returns `path` first. 1 failed, 8 passed, killed by the "no path-like string" test.
  - After the mutations, `git hash-object apps/web/src/pages/SourcesPage.tsx` = 72773f6f5ac5fcfe8880b90738c82c74dd6b3f46 = `HEAD:` blob (matches).

## Not verified / limits

- lint-loc `--all` not re-run (the maker reports the `dependencies` stage failing on the lane junction gap). Not independently produced.
- No browser run. Token and time metrics for the checker were not measured (null).
- No ledger rows are tied to this unit in what I read.

Ledger rows may be flipped: NO. Reason: FAIL. Re-check after the fix in findings 1 and 2.

