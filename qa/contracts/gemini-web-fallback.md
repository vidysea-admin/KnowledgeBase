# Contract — gemini-web-fallback
Authority: D-202 (draft; Umesh chat rulings 2026-10-28): Tavily dropped; the `/ask` web fallback uses Gemini with Google Search grounding on the existing paid `GEMINI_API_KEY`. Approver: Umesh.

## Acceptance criteria
- [C1] In production composition (apps/api/src/composition/production.ts:197) the ask web-fallback function is a Gemini grounded-search function (`generateContent` with `tools: [{ google_search: {} }]`); Tavily is no longer called anywhere in apps/api. Model comes from env `LKB_WEB_GROUNDING_MODEL`, default `gemini-2.5-flash`. The dependency keeps its existing name `tavilySearchFn` so packages/ask is untouched. (serves: intent#O2)
- [C2] Mapper: Gemini `groundingMetadata` (`groundingChunks[].web` uri/title + `groundingSupports[]` segment text) maps to `WebSource[]` items `{title, url, content}`, where `content` is the supported text tied to that chunk (evidence, not only the synthesized answer). A response with no grounding chunks yields `[]` (honest "no web sources"); urls are never fabricated. (serves: intent#O2)
- [C3] Degrade honestly: `GEMINI_API_KEY` unset -> same unavailable-error behaviour as today's `TavilyUnavailableError` path (ask continues internal-only, no 5xx). HTTP/quota errors (packages/ai/src/gemini-quota.ts semantics) throw a typed error that apps/api ask-graph.ts:132-147 already degrades on. The API key never appears in logs, errors or audit entries. (serves: intent#O2)
- [C4] `filters.sources = "internal"` still sends nothing to the web provider; only the query text is sent (no tenant id, student id or session data). (serves: intent#O3)
- [C5] Setup status and wizard name Gemini web search instead of Tavily (apps/api/src/activity-health/setup-status.ts, apps/web/src/pages/setup-wizard/setupModel.ts:85); their tests are updated. (serves: intent#O2)
- [C6] Unchanged and green unmodified: packages/ask tests (ask-graph, ask-v2, bounded-ask) and tenant isolation tests. (serves: intent#O1)

## Invariants
- [I1] Tests use a mocked `fetch`; no test calls the real Gemini API. No DB writes, no schema change.
