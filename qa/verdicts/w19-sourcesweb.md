# Verdict - w19-sourcesweb

VERDICT: FAIL
Cycle checked: 1
Reviewed SHA: 6fbc6b41d1751473130b76e5feb49dc6e17cf15a
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

ISSUES-WRITTEN: none
