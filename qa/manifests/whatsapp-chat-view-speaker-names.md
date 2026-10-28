# Manifest — whatsapp-chat-view-speaker-names

**Contract:** qa/contracts/whatsapp-ingestion-first-slice.md (this fixes F6, the explicitly
disclosed follow-up: "resolved `displayName` computed then discarded")
**Goal task:** none — direct response to Umesh's live request ("agar isme proper tracking ho rhi
hai tho, iska ui tho whatsap jaisa rakh... isme dekh paau what all is being ingested")
**Date:** 2026-09-06
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** F6 (disclosed limitation in `qa/contracts/post-review-fixes-2026-09-06.md`
and the original `whatsapp-ingestion-first-slice.md` contract)

## What changed

1. **`packages/ai/src/stt/transcribe.ts`** — `Turn` interface gains two optional fields:
   `speakerLabel?: string` (human-readable speaker name) and `occurredAt?: string` (real
   wall-clock ISO datetime, distinct from the existing relative-offset `tStart`/`tEnd`). Additive,
   shared by every adapter (`Turn` is `@lkb/ai`'s canonical pre-persistence turn shape).
2. **`packages/ingest/src/sources/whatsapp.ts`** — `toTurns()` now sets `speakerLabel` from the
   already-fetched `m.displayName` (previously fetched onto the `WhatsAppMessage` and never used
   anywhere) and `occurredAt` from the real `m.ts`.
3. **`apps/api/src/whatsapp-store.ts`** — `ingestGroup`'s `turnDocs` mapping now persists
   `speakerLabel`/`occurredAt` onto the real `Turns` Mongo doc when present (previously computed
   `displayNameOf(...)` and discarded it — same F6 gap, API-layer half).
4. **`schema/turns.schema.json`** — added `speakerLabel`/`occurredAt` as documented optional
   properties (schema already had `additionalProperties: true`, so this is a documentation/type
   -generation improvement, not a behavior change to validation). Regenerated
   `packages/core/src/generated/turns.ts` via `pnpm gen:types`.
5. **`apps/web/src/api/types.ts`** — `Turn` interface gains the matching optional fields.
6. **`apps/web/src/pages/sessions/SessionDetailPage.tsx`** — the Transcript section now renders
   as WhatsApp-style chat bubbles (sender name in a stable per-speaker color, message text, real
   send time bottom-right) whenever any turn in the session carries a `speakerLabel` (today: only
   WhatsApp-sourced sessions). Sessions with no `speakerLabel` (audio/document/URL sources)
   render exactly as before — this is additive, not a replacement of the existing plain-list view.

## Why

Umesh: "agar isme proper tracking ho rhi hai tho, iska ui tho whatsap jaisa rakh aur mai chaau
tho... isme dekh paau what all is being ingested" — wants (a) confirmation that tracking is
genuinely capturing real messages, and (b) a WhatsApp-style view of what's actually been ingested.
(a) was verified independently against `sources/whatsapp_msg`'s own Mongo (see Real evidence) —
59 real messages captured for "Millionaires" with real content/timestamps, `capturedAt` within
seconds of `ts`. (b) required actually wiring the already-resolved-but-discarded display name and
adding the real per-message timestamp (WhatsApp turns previously only carried a relative-offset
second count, useless for "what time was this said").

## Real evidence

### Tracking is genuinely capturing real data (queried `sources/whatsapp_msg`'s own Mongo directly)
```
message count for "Millionaires" (120363405936621456@g.us): 59
latest message: { text: "Kaha ho tum?", ts: "2026-08-27T09:28:45.000Z",
                   capturedAt: "2026-08-27T09:27:50.594Z" }   <- capturedAt ~1min before ts
                                                                  (real near-live capture)
```
Real people documents resolve to real names (not fabricated): `savedName: "Navnit Chaubey
Vidysea"`, `savedName: "Harshita Srivastava (Main)"`.

### Real end-to-end ingest + chat view, against the live running server (no mocks)
```
$ curl -X POST http://localhost:3300/whatsapp/ingest -H "Authorization: Bearer <demo key>" \
    -d '{"groupJid":"120363405936621456@g.us"}'
{"sessionId":"45e3b9e8...","sourceId":"45e3b9e8...","turnCount":50}

$ curl http://localhost:3300/sessions/45e3b9e8... -H "Authorization: Bearer <demo key>"
# turns[0]:
{
  "speakerRef": "6a8d3d5830e77d6ead3d2360",
  "text": "Harshita jeb kaato",
  "speakerLabel": "Navnit Chaubey Vidysea",
  "occurredAt": "2026-08-25T09:43:21.000Z"
}
```

Real browser (Playwright, live app on :5173 against live API on :3300) rendering the chat view:
0 console errors; real transcript shows real names ("Navnit Chaubey Vidysea", "Himanshu Tomar")
with real per-message timestamps ("Aug 25, 3:13 PM" through "Aug 27, 2:58 PM"), matching the raw
Mongo data exactly. Screenshots saved to scratchpad (not repo root, to keep `lint-root` clean):
`whatsapp-chat-view.png` (session overview + claims), `whatsapp-chat-view2.png` (chat bubbles).

**Disclosure:** the real transcript includes a genuine Claude OTP code shared in the group in
plaintext ("633259"). This is real, already-captured data (not introduced by this unit) rendered
faithfully — flagging it because a chat-style view makes such content much more visually visible
than the previous plain list, which is worth Umesh's awareness for what ends up in a knowledge
base view, not something this unit's scope covers redacting.

### Typecheck (every touched package)
```
$ pnpm -r typecheck
apps/web, packages/core, packages/ai, packages/db, packages/ask, packages/ingest,
packages/index, apps/api, packages/meeting-bot -- all "Done", exit 0
```

### Schema validation
```
$ python schema/validate.py
PASS: 24 collection schema(s) validated correctly.
```

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
apps/api:        66/66 pass
apps/web:        40/40 pass (vitest)
packages/ingest:  41/41 pass
(+ core/ai/ask/index/meeting-bot: all pass, no failures anywhere in the run)
```

### Structure lint
```
$ pnpm lint:structure
lint-loc: OK (206 file(s) within budget)
lint-dirsize: OK (74 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (239 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (1014 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration
✔ no dependency violations found (239 modules, 702 dependencies cruised)
```

## Disclosed non-scope

- No new "WhatsApp-native" page/route was built — the chat rendering was added to the existing,
  already-real `SessionDetailPage` (reached the same way as before: WhatsApp tab -> "View it"
  after ingest, or Sessions list). Building a dedicated `/whatsapp/:sessionId` route with a
  WhatsApp-app-shell look (header bar, group icon, etc.) was considered but not done this unit —
  the data-correctness fix (real names + real times) is the part that was actually broken; a
  cosmetic app-shell wrapper is a follow-up if Umesh wants it after seeing this.
- "with my account as admin" — no new auth/role model was added. The existing single API-key
  model already gates all of this data behind Umesh's own key; there is no multi-user concept in
  this product yet to have a separate "admin" role against.
- Only WhatsApp-sourced turns get `speakerLabel`/`occurredAt` today; no other adapter
  (recording/document/url) was changed to populate them (they have no real per-message speaker
  name or absolute time to offer).

## How to verify (for the checker)
1. `pnpm -r typecheck` — expect exit 0 across all 9 packages/apps.
2. `pnpm -r test` — expect 0 failures (apps/api 66/66, apps/web 40/40 via vitest, packages/ingest
   41/41, rest unaffected but should still be green).
3. `pnpm lint:structure` — expect exit 0.
4. Read `packages/ingest/src/sources/whatsapp.ts`'s `toTurns()` — confirm `speakerLabel`/
   `occurredAt` are set from the already-fetched `m.displayName`/`m.ts`.
5. Read `apps/api/src/whatsapp-store.ts`'s `turnDocs` mapping — confirm both fields are persisted
   onto the real Mongo doc when present.
6. Read `apps/web/src/pages/sessions/SessionDetailPage.tsx` — confirm the chat-bubble branch only
   activates when a turn has `speakerLabel` (i.e. never changes rendering for non-WhatsApp
   sessions) and that the plain-list branch is otherwise byte-identical to before.
7. If the real `apps/api`/`apps/web` dev servers and Mongo are reachable, independently re-ingest
   the real "Millionaires" WhatsApp group and confirm the rendered transcript shows real names and
   real per-message times matching what's in `sources/whatsapp_msg`'s own Mongo directly — the
   strongest possible check, no mocks anywhere in this path.

## Status: checked-PASS (see qa/verdicts/whatsapp-chat-view-speaker-names.md, Cycle checked: 1, commit d43f3ab)

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
