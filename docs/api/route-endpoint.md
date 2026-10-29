# GET /route - vectorless retrieval (D-206)

Same hits as `GET /search`, found the way the operating brain finds pages: a small map decides WHERE to look, a
lexical index ranks inside it, and only 1-3 sessions are read in full. No embeddings, no per-request tree load, no LLM on
the common path. Code: `apps/api/src/route/route-router.ts` (HTTP), `apps/api/src/route/*` (retrieval).

## Request

`GET /route?q=<text>&k=<n>` with `Authorization: Bearer <key>`. The key needs the `search` scope (same as `/search`);
the tenant comes only from the verified key, never from the request.

| Param | Rule |
|---|---|
| `q` | required, non-empty, at most 512 characters (else 400 `bad_request`) |
| `k` | default 5, maximum 20; invalid or non-positive falls back to 5 |

## Response (200)

Exactly the `/search` shape: `{ "query": "<q as sent>", "hits": SearchHit[] }`.

```json
{ "query": "visa requirements for Germany",
  "hits": [ { "turnId": "...", "sessionId": "...", "score": 0.61, "turn": { "...full turns row..." }, "session": { "...safe session label..." } } ] }
```

- `turn` and `session` are the same objects `/search` returns (the effective turns row; the visibility-safe session label).
- `score` is in (0, 1]: the turn's BM25 score divided by the best score a turn could reach for this query. It orders hits
  within one response; it is not on the same scale as `/search` overlap ratios. Hits are transcript turns only (no
  `nativeSourceLocator` hits, no `nativeTruncated`).
- Answer text always comes from `turns` rows. The tree only chooses which sessions to read.
- Hits come from at most 3 sessions. A query with no match returns `{ "query": ..., "hits": [] }`.

## Errors

| Status | Body | Meaning |
|---|---|---|
| 400 | `{error:"bad_request", message}` | missing/blank/oversized `q` |
| 401 / 403 | auth middleware | no or bad key / key lacks `search` scope |
| 404 | `{error:"not_found", message}` | the tenant has no tree index yet (fall back to `/search`) |
| 503 | `{error:"route_timeout"}` | the 3 s hard deadline was exceeded (never a hang) |
| 503 | `{error:"route_unavailable"}` | any other failure (tree or database unavailable) |

Failures are never cached.

## How a request is answered

1. **Step A (deterministic, no LLM).** BM25 over the tree's session nodes and topic nodes (title + summary, topic nodes
   also carry their session's title). Each node also gets derived facet tokens, built from node text only: country
   (`fc:canada`), topic axis (`fa:cost`, `fa:visa`, `fa:tests`, ...) and university name (`fu:xavier-university`); the
   query is expanded the same way ("Toronto" implies `fc:canada`). Sessions are ranked by their best node.
2. **Step B (only when step A is unsure).** Step A is confident when the 3 kept sessions beat the best session left out
   by a ratio of at least 1.25 (or nothing was left out). Otherwise ONE `selectNodes` round runs over a flat frontier of
   the top BM25 nodes padded with session nodes (only sessions that currently pass the session gate are offered), using
   the injected fast model with a hard timeout (default 1.2 s, never more than the remaining deadline). On timeout,
   provider error or an empty/garbage reply, step A's result is used. The model's picks come first, step A fills the rest.
3. **Step C (data).** The selected sessions (max 3) are re-checked: the session must exist for the tenant, have
   `status.index = "done"`, and pass `visibility.sessionVisible` (withdrawn consent, missing or non-allowed source, and
   index-failed sessions are dropped here, after selection). Their turns are fetched with one indexed
   `{tenantId, sessionId: {$in}}` read, the review overlay is applied, turns are ranked in memory (BM25), and
   `visibility.filterTurns` runs only on the best-ranked slice, refilled in up to 3 rounds if some are dropped.

## Caching and tenancy

- Result cache: per tenant first (`tenantId -> k + normalised query`), 20 s TTL, at most 100 entries per tenant. A
  consent withdrawal can therefore still be served from cache for up to 20 s.
- Routing index cache: per tenant, built from the trusted tree reader (ineligible sessions already excluded), 60 s TTL,
  single-flight refresh, stale index served while refreshing. It holds routing text only. A session withdrawn inside that
  window is still removed by step C and is not offered to the model in step B.
- Every read goes through the tenant-scoped collection accessors; the tests assert the tenant filter on every query.

## Latency targets

| Path | Target |
|---|---|
| Step A on a warm index (22 sessions, 110 topics) | under 300 ms (measured single-digit ms) |
| Whole request, confident (no LLM), warm index | well under 1 s (dominated by the turn reads and visibility) |
| Whole request, step B | step A + at most 1.2 s model budget |
| Hard ceiling | 3 s, then 503 `route_timeout` |
| First request after a cold start or index expiry with no stale copy | pays the trusted tree read (the same cost `/graph` pays, seconds) and may hit the ceiling; later requests are warm |

## Wiring

`ServerDeps.route` (optional; absent means the route is not mounted) is set in `composition/production.ts` with
`createRouteDeps({ tree: createMongoTreeStore(...), complete })`. `complete` currently uses the `ask` provider chain.
Routing to Gemini 3.5 flash-lite with minimal thinking needs an `ai-routing.yaml` chain and a thinking-level option in
the provider layer; both are outside this unit's authorised files and are noted as a follow-up.
