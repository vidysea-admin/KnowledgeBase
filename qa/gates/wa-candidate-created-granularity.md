# Gate: granularity of the W12 `candidate.created` event

**Asked:** 2026-10-30, after the W12 `wa-events-feed` build. The builder emits one `candidate.created` event per review ingest batch, with a count.
**Answered:** 2026-10-30 by Umesh: "Per batch".

## What this means
- `candidate.created` stays one event per ingest batch. Its payload has a count and no candidate ids (R-39: ids, timestamps, counts and codes only).
- No follow-up unit for per-candidate events. Per-candidate detail stays in the review queue, not in the feed.
