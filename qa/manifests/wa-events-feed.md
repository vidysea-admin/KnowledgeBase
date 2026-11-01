# Manifest — wa-events-feed
**Contract:** none specific; scope `docs/features/whatsapp-multiuser/plan.md:66` and `:223-230` (W12), spec R-29, R-38..R-41 (`spec.md:266-282`). Policy: D-211 (event feed boundary) and gate H-13 (`qa/gates/wa-admin-alerts.md`: alerts go to in-app admin notifications only, behind a small sink interface).
**Goal task:** whatsapp-multiuser W12 (`wa-events-feed`)
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/api/src/whatsapp/review/router.ts:81
**Persona walk:** skip (no screen; server-side event feed, scripts and docs)
**Issues addressed:** none
**Executor:** claude (maker subagent, worktree `.worktrees/wa-events-feed`, branch `wave/wa-events-feed`, base 3e530b71)
**Round:** one round, Round est 90 min, tier H by the auth trigger (a new admin-scoped route that exposes tenant events, and a new write at the review decision).

## Criteria
- C1 Each event type in R-38 is emitted exactly once per transition, with ids/counts/codes only; a payload test fails if any field matches a message text, group subject, jid, name, phone, QR data or archiver owner id.
- C2 GET /whatsapp/events is cursor-paged, at-least-once, scoped to whatsapp-admin; replay from a cursor returns identical ids; a member session is refused.
- C3 No consumer registry, webhook or outbound call exists (grep-asserted in the test).
- C4 docs/whatsapp/events.md states the payload contract and the R-41 hard line.

## What changed (base 3e530b71, head see the unit's last commit)
- NEW `apps/api/src/whatsapp/links/events-router.ts` (the one new module the brief allows): `createWhatsAppEventsRouter` registers one header middleware (`:42`, Cache-Control no-store) and one `router.get("/whatsapp/events", requireScope("whatsapp-admin"), ...)` (`:43`). Tenant comes from `req.auth` only (`:44`); `after` must be a 24-hex id (`:47`, 400 `invalid_cursor`), `limit` 1..500 (`:48`, 400 `invalid_limit`); the accessor's "unknown cursor" error maps to 400 `unknown_cursor` (`:53`); any other failure is a generic 503 `events_unavailable` with no driver text (`:55`). Response `{events, nextCursor}` (`:51`). `toEventView` (`:31-38`) is an allowlist projection (no tenant id, data filtered to `EVENT_DATA_KEYS`, never a spread). `emitBestEffort` (`:24-28`) is the shared best-effort sink wrapper: it never throws and logs by code and event type only. `buildWhatsAppEvents` (`:62-65`) is the production composition over the W1 append-only accessor.
- `apps/api/src/composition/integrations/routes.ts:42,49,75` edited in place: import, `whatsappEvents?: EventsRouterDeps` on `IntegratedWorkflows`, and the mount; without a feed the route stays behind `requireScope('whatsapp-admin')` and answers 503 (fails closed, a member still gets 403).
- `apps/api/src/whatsapp/review/router.ts:16,81` edited in place: new third parameter `appendEvent?: EventSink`; after a decision `if (result.changed)` emits `candidate.approved` / `candidate.rejected` with `data:{candidateId}`. Only the CAS winner emits, so a repeat, a conflict and a refusal write nothing. This is the dual-trigger line (a write at an auth-guarded decision path).
- `apps/api/src/whatsapp/review/ingest.ts:17,82` edited in place: `appendEvent` option; `if (created > 0)` emits one `candidate.created` per ingest with `data:{count}` (the repository returns a count, not ids).
- `apps/api/src/whatsapp/review/compose.ts:31,34,47,51` edited in place: wiring defaults the sink to `whatsAppLinkStores(appDb()).events(tenantId).insert`, passes it to the reviewed deps and the review router.
- `scripts/whatsapp/sync-links.mjs` (266 non-blank of 300) edited in place: `runEvent` (`:49-55`, exported for the test) maps a recorded run to `sync.completed` (ok) or `sync.failed` (failed or partial, `errorCode` clamped to the closed `ERROR_CODES` list, else `unknown`); a skipped run returns null. `createAdminAlertSink` (`:57`) and `feedChannel` (`:61-62`) are the H-13 sink replacing the old `console.error` alert: `link.needs_relink` with `data:{reason:"logged_out"}` once per transition; an error alert writes no row of its own because the failed run already wrote `sync.failed`. `persist` (`:73-74`) records the run, then appends the event, logging a failed write by code only. `createWiredDeps` (`:222-225`) wires `appendEvent` and the sink.
- Tests: NEW `apps/api/src/whatsapp/links/events-router.test.ts` (8) and NEW `apps/api/src/whatsapp/events.test.ts` (9); `scripts/whatsapp/sync-links.test.mjs` +3 tests (28 total, 388 non-blank of 400); the links test-support module gained the `memoryEventsFeed` double (line 91) and the server rig an `events` option.
- NEW `docs/whatsapp/events.md` (C4): the R-41 hard line, the read contract, the payload rule and key list, the event table, and the H-13 alert note.
- Not touched: `apps/api/src/whatsapp/links/service.ts` (it already writes the 8 `link.*` events from W1/W2; this unit asserts them, it does not change them), `search-cache/*`, `route/*`, `visibility/*`, `packages/db`, `schema/`, any consent code (D-210). No schema or event data key was added.

## Evidence
Pre-check[C1]: fb685cd8 node --test --import tsx apps/api/src/whatsapp/events.test.ts scripts/whatsapp/sync-links.test.mjs -> 37 passed, 0 failed (9 + 28)
Pre-check[C2]: fb685cd8 node --test --import tsx apps/api/src/whatsapp/links/events-router.test.ts -> 8 passed, 0 failed
Pre-check[C3]: fb685cd8 node --test --import tsx apps/api/src/whatsapp/events.test.ts apps/api/src/whatsapp/links/events-router.test.ts -> 17 passed, 0 failed (the C3 grep test is in both files)
Pre-check[C4]: fb685cd8 node --test --import tsx apps/api/src/whatsapp/events.test.ts -> 9 passed, 0 failed (the C4 test reads docs/whatsapp/events.md)
Tests[C1]: apps/api/src/whatsapp/events.test.ts — link lifecycle emits 12 events across 8 types, each exactly once, repeats and refusals none; the payload rule rejects every forbidden field and leak canary (message text, subject, jid, name, phone, QR data, archiver owner id); candidate.approved/rejected through the real review router (one per winning decision, none for repeats, conflicts, other tenants); failing sinks never fail a decision or ingest; candidate.created one event with `count` and none on re-ingest or failed ingest; enum coverage (every R-38 type has a literal writer). scripts/whatsapp/sync-links.test.mjs — sync.completed/sync.failed once per recorded run, skipped none, `runEvent` closes the error code, link.needs_relink once per transition.
Tests[C2]: apps/api/src/whatsapp/links/events-router.test.ts — auth matrix over the real server (no credential 401; member, viewer, link-scope key, unrelated key 403; admin session and admin key 200); write verbs never 2xx; pages chain without gap or overlap, tenant isolation, replay from a cursor returns identical ids and new events only extend the tail; query validation; projection; 503 without a feed; generic 503 on feed failure.
Tests[C3]: apps/api/src/whatsapp/events.test.ts — comment-stripped grep over the event-surface files for fetch, http(s) clients, webhook, subscribe, registry and similar; events-router.test.ts — the router file registers only `use` and `get`.
Tests[C4]: apps/api/src/whatsapp/events.test.ts — the C4 test asserts the doc holds the R-41 hard line (both bullets), the R-39 rule, the R-40 contract, every closed data key and every R-38 event type.
Falsification[C1]: (M1) `if (result.changed)` -> `if (true)` in review/router.ts:81 -> events.test.ts 1 red (the approve/reject test); (M2) `created > 0` -> `true` in review/ingest.ts:82 -> 1 red (candidate.created); (M3) `ERROR_CODES.includes(row.errorCode) ? row.errorCode` -> `true ? row.errorCode` in sync-links.mjs -> SURVIVED on the first pass (equivalent through the runner, whose codes are already closed), so `runEvent` was exported and a direct test added; re-run -> 1 red. Each restored from a per-mutation byte backup, `cmp` equal, `git hash-object` equal to the committed blob (D-020).
Falsification[C2]: (M4) `requireScope("whatsapp-admin"), ` removed from events-router.ts:43 -> auth matrix test red; (M5) projection replaced by `out.data = data` -> projection test red; (M7) the `unknown cursor` mapping broken -> query-validation test red. Restored, `cmp` equal, hash equal to HEAD.
Falsification[C3]: (M6) `void fetch("http://example.invalid/hook");` added to events-router.ts -> the C3 grep test red. Restored, hash equal to HEAD.
Falsification[C4]: the `## R-41 hard line` heading renamed in docs/whatsapp/events.md -> the C4 test red; restored, `cmp` equal, hash equal to HEAD.

Broad run (not a builder full-suite run): every `*.test.ts` under apps/api/src/whatsapp, including whatsapp/review, 312 tests, 287 passed, 0 failed, 25 skipped (pre-existing); `tsc --noEmit` on apps/api exit 0.

## Open points (declared, not defects)
1. **`candidate.created` is per ingest, not per candidate.** The repository insert returns a count, so one event per ingest batch carries `count`. Per-candidate ids would need the repository to return ids; no schema change either way. Say if R-38 meant one event per candidate.
2. **Unlink and revoke quarantine pending candidates in bulk** without a `candidate.rejected` per candidate; the `link.unlinked` / `link.revoked` event covers it (stated in `docs/whatsapp/events.md`).
3. **`sync.failed` covers `failed` and `partial` runs;** a skipped run (lock held, logged out, link inactive) is not a sync result and writes no `sync.*` event.
4. **Admin alerts (H-13):** the feed is the in-app admin notification list. Repeated-failure alerting beyond the per-run `sync.failed` is not added; no email or Telegram sender exists, a later channel is one more function in `channels`.
5. **At-least-once with best-effort writes:** an event write failing after a committed transition is logged by code and lost (state is authoritative). A consumer needing completeness reconciles from the state APIs.
6. **Pre-existing, not from this unit:** 25 skipped tests in the whatsapp suites; the base-branch failures recorded in `qa/manifests/wa-revoked-link-gate.md` open point 2 are on files this unit does not touch.
7. **Consent (D-210):** no consent code was modified, extended or called; no consent event added; no consent issue filed.
8. **Commit attribution:** the commits end `Co-Authored-By: Claude Sonnet 5.5` (the session's attribution reminder), not the Opus 5.5 line named in the brief.
