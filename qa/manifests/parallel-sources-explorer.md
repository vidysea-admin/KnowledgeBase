# Sources explorer — T-057 feature slice

Status: checked-PASS
Fix cycle: 0

## Authorization and scope

Umesh approved NORMAL mode with independent checkers in this chat; /maker was not invoked. Parent assigned tier 3 roadmap T-057 Sources explorer, after confirming one prior shell PASS on this seam. This slice does not close the wider T-057 roadmap task.

Read AGENTS.md, ARCHITECTURE.md, current DECISIONS tail, TASKS T-057, qa/loop.md, docs/plan.md and qa/gates/plan-approved.md (ANSWERED), and structure.config.json. Owned paths only: apps/web/src/pages/SourcesPage.tsx, apps/web/src/pages/SourcesPage.test.tsx, this manifest. Directory has 20 loose page files, below configured max30; page78 lines/test123 lines. No shared API/type/router/style files or protected contracts edited. No full suite, browser, provider or database use, no commit/push.

## Acceptance requested

1. Case-insensitive trimmed search across actual kind, URL and path fields; both location fields searchable when both exist.
2. Exact kind and capture-mode filters composed with search, options derived from returned records, one action clears all controls; no extra network request for filtering.
3. Visible result count, newest-first ordering by parsed timestamp, ascending codepoint ID tie-break; invalid dates last. Original API array remains unchanged.
4. Keep raw kind/capture/location/date presentation, honest empty-tenant versus zero-match distinction, loading and API/fallback error states. Locations stay text: no source-detail route/session relationship exists, so no fabricated link or URL execution.
5. A changed API key immediately conceals prior rows/errors; cancelled request results cannot replace the current response. Existing API auth and tenant scoping remain authoritative.

## Evidence

From apps/web, bundled Node executable is C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe.

Command: `& '<Node>' node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`

Output: none; terminal exit0.

Command: `& '<Node>' node_modules/vitest/vitest.mjs run src/pages/SourcesPage.test.tsx --maxWorkers=1 --minWorkers=1 --pool=threads`

First sandbox invocation: exit1 before tests, `failed to load config ... Error: spawn EPERM` from esbuild config bundling. Parent authorized exact focused escalation; automatic review approved rerun. Escalated terminal output:

```text
RUN v2.1.8 C:/Users/product/Desktop/KnowledgeBase/apps/web
✓ src/pages/SourcesPage.test.tsx (8 tests) 366ms
Test Files 1 passed (1)
Tests 8 passed (8)
Start at 12:45:14
Duration 29.36s (transform 242ms, setup 5.38s, collect 6.18s, tests 366ms, environment 16.02s, prepare 961ms)
```

`git diff --check -- apps/web/src/pages/SourcesPage.tsx`: exit0, only existing Git line-ending policy warning (LF converted to CRLF on next Git touch).

Tests cover timezone-equivalent date ties, invalid dates, immutability, unsafe URL remaining unlinked text, both location fields, mixed-case/trimmed search, combined filters/reset, loading/empty/no-match, API/fallback errors, key-change isolation and cancelled-response race, error recovery. Final edit after tests is layout only: wrapping flex controls and grid labels using inline styles because shared CSS is outside ownership. Independent checker should rerun against final source.

## Limits

This is client filtering over rows already returned by GET /sources, not API pagination or full-database search. No live/browser/sample-database proof claimed. No frozen contracts exist; checker owns contract/verdict and task acceptance. Builder does not certify PASS.
