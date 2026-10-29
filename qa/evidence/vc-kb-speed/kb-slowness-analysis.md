# t057 KB /search slowness: root-cause analysis

Date: 2026-10-29 (IST ~08:25 to 08:35). Read-only: no code edit, no restart, no DB write, no browser, no secret value printed (key NAMES only). 19 sequential `/search` probes, plus 3 health/root GETs. One probe run overlapped for a moment with a second (see Method notes).

## 1. Where the KB is

- VC config (names/values, worktree `.env`): `VC_KB_BASE_URL=https://34.47.136.12:8081/api`, `VC_KB_API_KEY`, `VC_KB_ANON_API_KEY` (redacted), `VC_KB_TIMEOUT_MS=8000`.
- The KB is NOT a local process. It is a remote host (34.47.136.12:8081, TLS, `/api` prefix). No local listener on the KB port: local listeners are 8787 (VC API, pid 38456), 8000 (gateway), 3001, 5000, 8790, none of them the KB. So CPU%, working set, pagefile and worker count of the KB process cannot be observed from here.
- Source repo on disk: `D:\KnowledgeBase` (HEAD `82b9b177`, 2026-10-29 08:22 IST). ASSUMPTION: the deployed build equals this checkout. The behaviour measured below matches the code, which supports it, but the deploy SHA is not verifiable from here.
- VC caller: `mcp/university-kb/src/kb-client.ts:164-167` (`KB_ASK_TIMEOUT_CAP_MS = 8_000`, `KB_SEARCH_TIMEOUT_CAP_MS = 8_000`), search call `kb-client.ts:494`, ask call `kb-client.ts:607`; student search site `mcp/university-kb/src/source-kind.ts:201` (`client.search(query, STUDENT_SEARCH_K)`).
- Local machine at probe time: 1130 MB free of 24284 MB, CPU 74% (browser walk running). This does not affect the KB timings (server is remote; network is fast, see below).

## 2. What /search actually does (KB repo, no embeddings, no LLM)

`GET /search` is plain LEXICAL retrieval. There is no embedding model, no vector store, no reranker, no LLM call and no model cold start in `/search`.

- Route `apps/api/src/routes/search.ts` (`createSearchRouter`): runs `deps.search` and `deps.searchNative` in parallel, 503 on any throw.
- Store `apps/api/src/search-store.ts:127-155`:
  1. `:134` `buildTurnPrefilter(query)` -> `apps/api/src/search-prefilter.ts:56`: one `$or` branch per query token, each a case-insensitive SUBSTRING regex (`$regex`, `$options: "i"`). Tokens come from `lexicalQueryTokens` (`packages/index/src/search/lexical.ts`), which has NO stopword removal and NO minimum length, by design (the superset invariant, ISS-072/075). So "in", "for", "of", "uk", "the" are tokens and match as substrings of most turns.
  2. `:136` `readSearchCandidateTurns` (`apps/api/src/transcript-review/search-reader.ts`): `turns.find({$or:[regex...]})`, an unindexed collection scan (the docstring at `search-store.ts:40-43` states `turns` has only `_id_`, `tenantId_1`, `tenantId_1_sessionId_1`, no text index). Hard bounds: `MAX_CANDIDATES = 5000`, `READ_TIME_MS = 5000`, `maxTimeMS` 1500 per query; exceeding throws -> 503. Then a second `$or` regex scan over `transcript_reviews.overlay.text`, then `readEffectiveTurns`.
  3. `:137` `visibility.filterTurns(tenantId, candidates)` -> `apps/api/src/visibility/knowledge.ts:157-168`. This is a SEQUENTIAL N+1 loop over EVERY candidate, one at a time (`for (const row of rows) { await ... }`). Per candidate it does: `currentTurn` (`:97-104`: `turns.findOne` + `readEffectiveTurns` -> `transcript_reviews.findOne`, and if the session has a review head, an extra `turns.find` of ALL turns of that session, `effective-reader.ts:18`), then `allowedTurn` (`:105-116`): `context` (`:41-50`: `sessions.findOne`, `sources.findOne`, `whatsapp_candidates.findOne`) plus `currentTurn` AGAIN. That is about 7 to 8 sequential Mongo round trips per candidate, with no per-session memoisation (the same session/source is re-read for every turn of that session). For whatsapp-batch sources it additionally runs `approvedClaims` per turn (heavier).
  4. `:138` `lexicalSearchTurns` (pure in-memory scoring, measured by the KB's own comment at 38 ms for 2118 turns) and `safeCitationSession` per distinct returned session (cheap).
- The time bound (`boundedSearchDb`) wraps ONLY step 2. Step 3 (`filterTurns`) uses the plain `db` with no deadline, so a query with many candidates has no upper bound on latency except the client's own timeout.

Conclusion from the code: latency is roughly `candidates x ~8 sequential DB round trips`, where candidates = number of turns whose text contains ANY query token as a substring.

## 3. Measurements (commands and raw timings)

Auth: `Authorization: Bearer <VC_KB_API_KEY>` loaded from `.env` inside the script, never printed. TLS cert not verified (`curl -k`, IP host). Network is not the cost: `GET /api/health` -> 200, connect 0.046 s, TLS 0.098 s, TTFB 0.150 s total; `GET /` -> 200, 0.17 s; `GET /api/search?q=toronto&k=1` -> 200, 0.178 s.

Command shape (PowerShell + curl.exe):
`curl.exe -sk -m <T> -H "Authorization: Bearer $key" -o <file> -w "code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total} size=%{size_download}" "$base/search?q=<q>&k=5"`

A. Representative natural-language student questions, k=5, curl `-m 40`, 3 rounds x 4 queries (12 probes, run via the first background loop):

| query | round 1 | round 2 | round 3 |
|---|---|---|---|
| cost of living in Toronto for students | TIMEOUT 40.01 s, no byte received | TIMEOUT 40.02 s | TIMEOUT 40.01 s |
| IELTS requirement for UK masters | TIMEOUT 40.02 s | TIMEOUT 40.01 s | TIMEOUT 40.01 s |
| best universities in Canada | TIMEOUT 40.01 s | TIMEOUT 40.02 s | (loop ended before the 12th probe was recorded in the output file; 11 of 12 recorded) |
| visa requirements for Germany | TIMEOUT 40.01 s | TIMEOUT 40.07 s | not recorded |

Every one of the 11 recorded probes: HTTP 000, TCP connect 0.03 to 0.05 s, TLS done 0.07 to 0.14 s, TTFB 0, size 0 at the 40 s kill. So the TLS handshake and routing work instantly and the server sits on the request for more than 40 s. These queries would all have timed out against VC's 8 s cap, p50 = p95 = timeout (greater than 40 s; true value unknown). A 2-token follow-up `q=toronto%20students&k=5` also exceeded 20 s (curl `-m 20`, exit 28).

B. Single-token queries, k=5 (isolates candidate count; each ran once unless noted):

| query | HTTP | ttfb / total | hits | body size |
|---|---|---|---|---|
| toronto (k=1) | 200 | 0.178 s | 0 | 53 B |
| ielts (run 1) | 200 | 0.750 s | 5 | 7726 B |
| ielts (run 2, repeat) | 200 | 0.784 s | 5 | 7726 B |
| visa | 200 | 5.737 s | 5 | 7535 B |
| students | 200 | 23.602 s | 5 | 7254 B |

Warm vs cold: the repeat of `ielts` is identical (0.75 vs 0.78 s). There is no result cache and no warm-up effect; there is also no cold start. Latency is a pure function of how many turns the token substring-matches (rare token 0.2 to 0.8 s, mid 5.7 s, common 23.6 s). Multi-word questions OR the tokens together (and include stopwords like "in", "for", "uk"), so the candidate set is the union and always lands at the slow end.

p50/p95 per query cannot be given with statistical meaning from 1 to 3 samples: the A-queries never completed (greater than 40 s); the B-queries are deterministic (repeat differs by 0.03 s).

Stage attribution: the prefilter scan (step 2) is bounded by the server at 5 s and would 503 (not hang) if it were the dominant stage and exceeded 5 s; we saw no 503 and no response at all for more than 40 s, so the unbounded stage 3 (`filterTurns`, sequential per-candidate DB round trips) is what dominates. Per-stage server timings are not exposed (no metrics endpoint tried, the host is remote, no log access), so this attribution is from code plus the scaling behaviour (0.2 s -> 0.75 s -> 5.7 s -> 23.6 s as candidate counts grow), not a direct stage timer. Rough implied cost: 23.6 s / 8 round trips per candidate is about 3 s per 1000 candidate-round-trips; at about 1 to 2 ms per Mongo round trip, "students" would be around 1500 to 3000 candidate turns (inference, not measured; candidate count was not queried).

Method notes: the first background loop was still running when I issued the health/root and `toronto` probes, so those few single probes overlapped with one tail query; the ordering of single-token results (rare fast, common slow) is repeatable on its own and does not depend on that overlap. Health stayed at 0.15 s while a search was hung, so the server event loop is not blocked: the slowness is per-request work (awaits on Mongo), not CPU starvation of the process.

## 4. How this produces VC's 14 to 15 s turns

VC's student KB turn makes a `/search` (8 s cap) and then an `/ask` (8 s cap) (`kb-client.ts:164-167`, `:494`, `:607`). Natural-language questions make `/search` exceed 40 s, so VC aborts at 8 s, the ask stage also runs to its own 8 s cap, and the turn lands at 14 to 15 s before general guidance (matches the R2/R3b/R4 probes in `qa/evidence/t057/fix-round-live.md`: 13.6 to 16.6 s on every KB-then-general turn, unchanged by the model switch). Result: the KB never contributes in practice for multi-word questions; it only "works" for a single rare word.

## 5. Root causes, ranked

1. (dominant) Sequential N+1 visibility check over all candidates, unbounded in time: `apps/api/src/visibility/knowledge.ts:157-168` (with `:41-50`, `:97-116`, `effective-reader.ts:9-40`). About 8 sequential Mongo round trips per candidate, no memoisation by session/source, no deadline, applied to up to 5000 candidates. Evidence: latency scales with token commonness (0.75 / 5.7 / 23.6 s), repeat identical, health unaffected.
2. (amplifier) The prefilter has no stopword/short-token handling and ORs every token as a case-insensitive substring: `apps/api/src/search-prefilter.ts:56-59`, `packages/index/src/search/lexical.ts` (`tokenize`/`lexicalQueryTokens`). A natural question contributes "in", "for", "of", "uk", "the" which substring-match most of the corpus, so candidates approach the 5000 ceiling. The superset invariant (ISS-072) deliberately forbids dropping tokens, which is what prevents a cheap fix here.
3. (amplifier) No text index on `turns` (`search-store.ts:40-43`): the candidate fetch is a full scan with regex per call (bounded 5 s, but it adds up to that to every call and ships up to 5000 turn bodies). Secondary: second regex scan on `transcript_reviews.overlay.text`.
4. (not a cause) Embeddings, reranker, in-search LLM, cold model load, cache: none exist in `/search`. Network RTT: 0.15 s. Machine RAM/pagefile on the VC side: not on the path.
5. (VC side, amplifier of user-visible time) Two serial 8 s caps (`/search` then `/ask`) stacking to 14 to 16 s per turn, plus the fact that a timed-out `/search` is not remembered across turns (no negative cache / circuit breaker).

## 6. Fixes ranked by gain / effort, with expected latency

KB repo (`D:\KnowledgeBase`, NOT ours to edit without approval):

| # | fix | where | expected `/search` latency | effort |
|---|---|---|---|---|
| K1 | Memoise per request: load each distinct `sessionId` context (session, source, whatsapp_candidates, review head) once, and fetch turns/heads in batch (`$in`) instead of per row. Cuts about 8N sequential reads to about 3 x (distinct sessions) + a few batched reads. | `visibility/knowledge.ts:157-168`, `search-store.ts:137` | rare 0.2 s, mid about 0.5 to 1 s, common about 1 to 2 s (from 23.6 s) | M (needs the same security/visibility tests; it is a read-only perimeter so ISS-style checker review) |
| K2 | Rank first, check visibility after: score the candidate texts with `lexicalSearchTurns` (cheap, 38 ms per 2118 turns) BEFORE `filterTurns`, then run the visibility filter only on the top about k x 5 hits, stopping when k pass. Cost becomes O(k), not O(candidates). | `search-store.ts:134-146` | about 0.3 to 0.8 s for any query | M (must keep "filter before score" correctness for hits dropped by visibility: take top-M, filter, refill) |
| K3 | Add a real Mongo text index (or a `tokens` array multikey index) on `turns`, and replace the substring `$or` with `$text`/token equality. | index + `search-prefilter.ts` | cuts the 0.2 to 5 s scan stage to tens of ms; does not fix stage 3 alone | M-L (breaks the substring superset invariant, needs a design decision) |
| K4 | Stopword + minimum length handling for the PREFILTER and SCORER together (keep the symmetric-superset invariant by changing both sides). | `lexical.ts`, `search-prefilter.ts` | reduces candidates 5x to 20x for natural questions | S-M (answer-changing, needs a decision; ISS-072 notes) |
| K5 | Hard deadline on `filterTurns` and a 503/partial return, plus a per-query result cache (TTL 60 s). | `knowledge.ts`, route | bounds the worst case at about 2 s instead of unbounded | S |

VC repo (ours):

| # | fix | where | expected effect | effort |
|---|---|---|---|---|
| V1 | Send a reduced query to `/search`: strip stopwords and keep 2 to 3 content words (for example "toronto living cost"), and pass `k` small. Note, with the current KB, even a mid-common content word is 5 to 23 s, so V1 alone helps only if the kept words are rare. | caller of `client.search` (`source-kind.ts:201`) / query builder | 8 s timeouts become hits only for rare-term queries; partial | S |
| V2 | Circuit breaker / negative cache: after one `/search` timeout for a thread (or process), skip `/search` and `/ask` for N minutes, or run `/search` and `/ask` concurrently instead of serially with a shared 8 s budget. Turns drop from 14 to 16 s to about 8 s, or about 4 to 5 s with the breaker open. | `mcp/university-kb/src/kb-client.ts:164-167,494,607` and its caller | immediate, no KB change | S |
| V3 | Lower `VC_KB_TIMEOUT_MS` / caps to about 3 s for student chat while the KB is this slow (a config change). | `.env`, `kb-client.ts:164-167` | turn about 6 to 7 s total; KB effectively disabled for non-rare queries, so pair with V2 | S |

Recommended order: V2 now (VC-only, no approval needed from KB owners), then request K2 + K1 in the KB repo (the real fix, takes common queries from about 24 s to under 2 s), K5 as a safety net, K3/K4 later as design decisions.

## 7. Not measured / limits

- KB host CPU, RAM, swap, worker count: remote, not observable (the "single worker/blocking" question: health stayed fast during a hung search, so the process is not event-loop-blocked; per-request awaits are the cost).
- Candidate counts per query and per-stage server timings: not exposed; the stage-3 attribution is code plus scaling behaviour.
- The 12-probe set A produced only timeouts; no p50/p95 of a completed natural-language `/search` exists (it is above 40 s).
- `/ask` latency not probed (kept to the 20-query budget; `/ask` calls a model and is expected to be separately slow).
