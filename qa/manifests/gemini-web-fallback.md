# Manifest — gemini-web-fallback
**Contract:** qa/contracts/gemini-web-fallback.md
**Goal task:** none
**Date:** 2026-10-28
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no
**Persona walk:** skip (no new user type or flow; one wizard row renamed)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** Tier M multi-file behaviour unit, single builder owning the web-fallback seam files.

## What changed
- apps/api/src/ask/ask-web-fallback.ts:50-150 — added `createGeminiWebSearchFn`, `mapGroundedResponse`, `GeminiWebSearchError`, `WEB_GROUNDING_DEFAULT_MODEL` (Gemini generateContent + `tools:[{google_search:{}}]`, key in `x-goog-api-key` header, model from `LKB_WEB_GROUNDING_MODEL`, free-tier 429 via `detectGeminiFreeTier`). Tavily fn kept (existing tests use it).
- apps/api/src/composition/production.ts:24,197 — wires `createGeminiWebSearchFn()` into the unchanged `tavilySearchFn` dependency name (packages/ask untouched).
- apps/api/src/activity-health/setup-status.ts — `configured.tavily` replaced by `configured.webSearch` (GEMINI_API_KEY present).
- apps/web/src/pages/setup-wizard/setupModel.ts:85, SetupWizardPage.tsx:24 — wizard row `web-search` "Gemini web search configured (optional)" replaces the Tavily row; AskPage.tsx comment text.
- apps/api/src/ask/ask-web-fallback.test.ts, apps/api/src/activity-health/setup-status.test.ts, apps/web/src/pages/setup-wizard/SetupWizardPage.test.tsx — new/updated tests (fetch mocked).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (multi-file behaviour, external provider seam; no auth/tenancy/data write)
Round: 9 files, 6 criteria, est 30 min — one builder, TDD, mocked fetch
Owners: web-fallback seam (api ask + composition + setup-status + web wizard)
Base / checked state: a0699b1a; code at b22c2ab1 (manifest-only commit follows)
Gate answers: none (no qa/gates line applies; authority D-202 chat rulings)
Affected tests / full-suite trigger: apps/api ask-web-fallback, setup-status, production tests, src/ask/*.test.ts (incl. tenant isolation/hostile), packages/ask ask-graph/ask-v2/bounded-ask, web setup-wizard; none (no safe-fallback file touched; builder ran no full suite)
Tests[C1]: apps/api/src/ask/ask-web-fallback.test.ts::[C1] x3 — URL/model/tools/header, env model override, production.ts wiring source shape
Tests[C2]: apps/api/src/ask/ask-web-fallback.test.ts::[C2] x2 — chunk+support mapping, no-chunks -> []
Tests[C3]: apps/api/src/ask/ask-web-fallback.test.ts::[C3] x5 — no key, HTTP statuses, free-tier 429, transport error redaction, audited text
Tests[C4]: apps/api/src/ask/ask-web-fallback.test.ts::[C4] x2 — body is contents+tools only; answer-workflow internal-source strip pinned (existing behaviour tests in src/answer-policy/answer-workflow.test.ts lines 34/52 unchanged)
Tests[C5]: apps/api/src/activity-health/setup-status.test.ts (6) + apps/web/src/pages/setup-wizard/SetupWizardPage.test.tsx (20)
Tests[C6]: packages/ask/src/ask-graph.test.ts, packages/ask/src/ask-v2.test.ts, packages/ask/src/bounded-ask.test.ts, apps/api/src/ask/ask-tenant-isolation.test.ts, apps/api/src/ask/ask-tenant-hostile.test.ts — run unmodified (the wider src/ask/*.test.ts set, 183 tests, also green)
Tests[I1]: none — invariant; every new test installs a mocked fetch via withGemini()
Falsification[C1]: copy-mutant `tools: []` -> [C1] Gemini fn calls generateContent... red
Falsification[C2]: copy-mutant content = answer only -> [C2] maps groundingChunks... red
Falsification[C3]: copy-mutant unset key returns [] -> [C3] no GEMINI_API_KEY... red
Falsification[C4]: copy-mutant adds tenantId to body -> [C4] only the query text is sent... red
Falsification[C5]: mutant webSearch reads TAVILY_API_KEY -> [C5] webSearch follows GEMINI_API_KEY alone red; wizard text mutant -> "missing integrations are optional To do" red
Falsification[C6]: NO ISOLATING FALSIFICATION — criterion is "unchanged and green"; discriminator is `git diff a0699b1a --stat -- packages/ask` empty plus the unmodified suites green
Falsification[I1]: NO ISOLATING FALSIFICATION — invariant
Pre-check[C1]: b22c2ab1 cd apps/api && node --test --import tsx src/ask/ask-web-fallback.test.ts -> exit 0, 16 tests ok t=1 blobs=apps/api/src/ask/ask-web-fallback.test.ts:2448ec0
Pre-check[C2]: b22c2ab1 cd apps/api && node --test --import tsx src/ask/ask-web-fallback.test.ts -> exit 0, 16 tests ok t=1 blobs=apps/api/src/ask/ask-web-fallback.test.ts:2448ec0
Pre-check[C3]: b22c2ab1 cd apps/api && node --test --import tsx src/ask/ask-web-fallback.test.ts -> exit 0, 16 tests ok t=1 blobs=apps/api/src/ask/ask-web-fallback.test.ts:2448ec0
Pre-check[C4]: b22c2ab1 cd apps/api && node --test --import tsx src/ask/ask-web-fallback.test.ts -> exit 0, 16 tests ok t=1 blobs=apps/api/src/ask/ask-web-fallback.test.ts:2448ec0
Pre-check[C5]: b22c2ab1 cd apps/api && node --test --import tsx src/activity-health/setup-status.test.ts && cd ../web && npx vitest run src/pages/setup-wizard/SetupWizardPage.test.tsx -> exit 0, 6 + 20 tests ok t=69 blobs=apps/api/src/activity-health/setup-status.test.ts:5b2d340,apps/web/src/pages/setup-wizard/SetupWizardPage.test.tsx:674a6cb
Pre-check[C6]: b22c2ab1 cd packages/ask && node --test --import tsx src/ask-graph.test.ts src/ask-v2.test.ts src/bounded-ask.test.ts && cd ../../apps/api && node --test --import tsx src/ask/ask-tenant-isolation.test.ts src/ask/ask-tenant-hostile.test.ts -> exit 0, 86 + 86 tests ok t=31 blobs=packages/ask/src/ask-graph.test.ts:4933e27,packages/ask/src/ask-v2.test.ts:e2a0a41,packages/ask/src/bounded-ask.test.ts:d5dd04d,apps/api/src/ask/ask-tenant-isolation.test.ts:0086d26,apps/api/src/ask/ask-tenant-hostile.test.ts:1cd1b46
Pre-check[I1]: b22c2ab1 cd apps/api && node --test --import tsx src/ask/ask-web-fallback.test.ts -> exit 0, 16 tests ok, fetch mocked t=1 blobs=apps/api/src/ask/ask-web-fallback.test.ts:2448ec0
mutant-cap-raise: .8-4 requires one falsification per changed criterion C1-C5 (5 mutants), each a single named edit
Metrics: start=2026-10-28T12:55:00Z end=2026-10-28T13:25:00Z wall_min=30 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=6 mutants=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 builder_min=30 check_min=0

## How to verify (commands + expected)
- `cd apps/api && node --test --import tsx src/ask/ask-web-fallback.test.ts src/activity-health/setup-status.test.ts "src/ask/*.test.ts"` -> expected: 0 fail
- `cd packages/ask && node --test --import tsx src/ask-graph.test.ts src/ask-v2.test.ts src/bounded-ask.test.ts` -> expected: 86 pass, 0 fail
- `cd apps/web && npx vitest run src/pages/setup-wizard` -> expected: 20 passed
- `cd apps/api && npx tsc --noEmit -p .` and same in apps/web -> expected: exit 0
- `git diff a0699b1a --stat -- packages/ask` -> expected: empty

## Actual outputs (from maker's own run)
- ask-web-fallback.test.ts: `tests 16 pass 16 fail 0`; setup-status: `tests 6 pass 6`; src/ask/*.test.ts: `tests 183 pass 183`; packages/ask: `tests 86 pass 86`; web wizard: `Tests 20 passed (20)`; api and web `tsc --noEmit` exit 0; `git diff a0699b1a -- packages/ask` empty.
- TDD red: the first run of ask-web-fallback.test.ts before implementation failed (missing exports, `fail 1`).
- Design notes: a grounding chunk that no segment cites falls back to the synthesized answer text as `content` (never an invented url); a response with no chunks/uri yields `[]`. The API key travels in the `x-goog-api-key` header (not the URL) and is redacted from transport errors.

## Capability coverage (each new claim -> its isolating falsification)
| Criterion | capability | check | falsifying edit | observed |
|---|---|---|---|---|
| C1 | grounded generateContent with google_search tool, default/env model, header key | ask-web-fallback.test.ts `[C1] Gemini fn calls generateContent...` | copy-mutant `tools: [{ google_search: {} }]` -> `tools: []` | baseline copy `pass 16 fail 0`; mutant `✖ [C1] Gemini fn calls generateContent with the google_search tool...` `pass 15 fail 1` |
| C2 | chunk+support text mapping, honest [] | `[C2] maps groundingChunks + supports...` | copy-mutant `content = answer` | `✖ [C2] maps groundingChunks + supports to WebSource items...` `pass 15 fail 1` |
| C3 | unset key -> TavilyUnavailableError, no network | `[C3] no GEMINI_API_KEY: rejects...` | copy-mutant `throw` -> `return []` | `✖ [C3] no GEMINI_API_KEY: rejects with the unavailable error...` `pass 15 fail 1` |
| C4 | only query text sent | `[C4] only the query text is sent...` | copy-mutant adds `tenantId: "t1"` to body | `✖ [C4] only the query text is sent: body is contents[query] + tools...` `pass 15 fail 1` |
| C5 | setup status + wizard name Gemini web search | setup-status.test.ts `[C5] webSearch follows GEMINI_API_KEY alone`; wizard test `missing integrations are optional To do...` | in-place mutants (per-mutation backup, restored, `git hash-object` == HEAD blob verified): webSearch reads TAVILY_API_KEY; wizard action text TAVILY_API_KEY | api `✖ [C5] webSearch follows...` `pass 5 fail 1`; web `× ... missing integrations are optional To do ...` `1 failed, 19 passed` |
| C6 | ask tests untouched and green | packages/ask + src/ask tests | NO ISOLATING FALSIFICATION — unchanged-and-green criterion; `git diff -- packages/ask` empty | 86/86 and 183/183 pass |
| I1 | no real Gemini call | NO ISOLATING FALSIFICATION — invariant; `withGemini()` installs the mocked fetch in every new test | none | none |

C5 note: its falsification is in-place (setup-status.ts is loaded through server.ts, so a copy cannot be substituted), not a throwaway copy; both files verified byte-identical to HEAD after restore.

## Live browser evidence
Not UI-touching is FALSE: apps/web/src/pages/setup-wizard/setupModel.ts and SetupWizardPage.tsx changed (one row's text and id). SKIP — no browser smoke was run by the builder (no browser instrument in this subagent); the gap is stated: the rendered wizard row is covered only by the jsdom/vitest wizard test (20 pass), not a live page. Also not run: any real Gemini grounded call (I1, no live API by instruction), so the real response shape of groundingMetadata is verified against the documented fields only, via mocks.

## Status: checked-PASS (qa/verdicts/gemini-web-fallback.md, cycle 0, commit 3316dd82)
