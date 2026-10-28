# Verdict: gemini-web-fallback
VERDICT: PASS
Cycle checked: 0
Commit checked: e0b938b2 (wave/gemini-web-fallback; code b22c2ab1, base a0699b1a)
Policy-Version: proportional-verification/2026-10-19.17 (tier M, single coordinator, blind)

## EXPLANATION
Identity: worktree clean at e0b938b2; maker blob ids not trusted blindly, every suite below was re-run by the checker at this head (no live Gemini call, .env not read, no DB write; fetch is mocked in every Gemini test).

- C1 PASS. production.ts:197 `tavilySearchFn = createGeminiWebSearchFn()`; ask-web-fallback.ts:126-161 POSTs `.../models/<model>:generateContent` with `tools:[{google_search:{}}]`, model = `LKB_WEB_GROUNDING_MODEL` else `gemini-2.5-flash`. `grep createTavilySearchFn|api.tavily|TAVILY_API_KEY` outside ask-web-fallback.ts: tests only (no production caller); packages/ask diff vs base empty. Checker copy-mutants (own, not the maker's): key moved into URL `?key=` -> RED (2 tests); default model changed -> RED (1).
- C2 PASS. mapGroundedResponse maps chunk uri/title + supporting segment text; chunk with no supporting segment falls back to the synthesized answer (not a url); no chunks / no uri / `{}` -> `[]`. Copy-mutant: fabricate a url when empty -> RED ([C2] no-chunks test).
- C3 PASS. Unset/blank key -> async fn rejecting `TavilyUnavailableError` with no fetch call (the exact class ask-graph.ts:142-147 catch handles; message audited as `web_fallback_unavailable: <message>`). HTTP !ok -> `GeminiWebSearchError(status)` or `GeminiFreeTierQuotaError` via `detectGeminiFreeTier` (gemini-quota.ts semantics); transport throw -> `GeminiWebSearchError(0, redacted)`. The key is only in the `x-goog-api-key` header (never the URL, error text, or audit string); the response body is never put in the error message. Copy-mutants: remove redaction -> RED; put response JSON into the error detail -> RED (2 tests). A crash path is not reachable: every non-ok and thrown path is a typed rejection and ask-graph catches any rejection.
- C4 PASS (with a low note). Request body is exactly `{contents:[{role:user,parts:[{text:query}]}], tools}`; copy-mutant adding `labels:{tenant}` -> RED. `filters.sources=internal`: answer-workflow.ts:187 sets `tavilySearchFn: undefined` so the web fn is never reached; copy-mutant removing that clause -> RED, but only via the maker's source-regex test (see note 2).
- C5 PASS. setup-status.ts `webSearch: present(env,"GEMINI_API_KEY")`, wizard row `web-search` "Gemini web search configured (optional)". HEAD-fidelity verified: `git hash-object` == `git rev-parse HEAD:<file>` for setup-status.ts (da7baa1f) and setupModel.ts (85d68c21); worktree clean. Because setup-status.ts is loaded through server.ts a copy cannot be substituted for the repo test, so I ran a checker probe on a copy of setup-status.ts: baseline {GEMINI-only -> webSearch true, TAVILY-only -> false, no `tavily` key} all true exit 0; mutant reading TAVILY_API_KEY -> probe fails exit 1. Maker's in-place C5 mutants accepted (reported red, restore verified by the hash check above).
- C6 PASS. `git diff a0699b1a HEAD --stat -- packages/ask` empty; packages/ask ask-graph/ask-v2/bounded-ask `tests 86 pass 86 fail 0`; apps/api ask-tenant-isolation + ask-tenant-hostile + answer-workflow `tests 104 pass 104 fail 0` (test files unmodified per diff).
- I1 PASS. Every Gemini test installs a mocked fetch via withGemini() and restores it; no real call, no schema/DB change (diff touches no db package).
- Other runs at head: ask-web-fallback 16/16, setup-status 6/6, production.test.ts (with them) `tests 26 pass 26 fail 0`; web setup-wizard `20 passed (20)`; `tsc --noEmit` apps/api and apps/web both exit 0.
- Mutation hygiene: all mutants ran in a scratchpad copy with a node_modules junction; originals backed up per mutation, `cmp` against the backup and the worktree file confirmed identical after each; worktree `git status` clean afterwards.

Notes (low, not backlog items):
1. apps/api/src/production.test.ts:20-31 still toggles `TAVILY_API_KEY`, which production no longer reads. It still asserts something real (`typeof deps.ask.askDeps.tavilySearchFn === "function"`, i.e. the seam is wired unconditionally) but its "no key" arm no longer controls the relevant variable (GEMINI_API_KEY) and its title/comment are stale. Not vacuous, so no FAIL.
2. The only pin that `filters.sources=internal` keeps the Gemini fn uncalled is a source-shape regex on answer-workflow.ts:187; the existing behaviour tests (answer-workflow.test.ts:52 uses `sources: "internal"`) do not assert `webCalls()==0` for it. Brittle to reformatting but it does fail on the real regression (copy-mutant RED).
3. mapGroundedResponse dedupes by url keeping the first chunk, so supporting text attached only to a later duplicate-url chunk is dropped. Cosmetic.
4. Real groundingMetadata shape verified only against documented fields via mocks (no live call by instruction).

ISSUES-WRITTEN: none
