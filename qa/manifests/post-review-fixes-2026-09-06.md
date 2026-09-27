# Manifest — post-review-fixes-2026-09-06

Status: checked-PASS (see qa/verdicts/post-review-fixes-2026-09-06.md)
Contract: `qa/contracts/post-review-fixes-2026-09-06.md`
Fix cycle: 1

## What changed

1. **`apps/api/src/production.ts`** — `OllamaProvider` imported and registered in `providers`.
2. **`packages/ingest/src/sources/whatsapp.ts`** — `_id` hash drops message count (stable per
   group+owner); `WhatsAppMessage` gains a real `messageId` field.
3. **`packages/ingest/src/sources/whatsapp.test.ts`** — fixtures updated with `messageId`, new
   idempotency test.
4. **`apps/api/src/whatsapp-store.ts`** — `MessageDoc` gains `messageId`/`groupJid`; sort is
   `{ts:1, _id:1}`; `ingestGroup` resolves `ownerUserId` server-side from `listTrackableGroups()`,
   uses a stable `sessionId`, and upserts sources/sessions/turns (turns keyed by real
   `messageId`).
5. **`apps/api/src/routes/whatsapp.ts`, `.test.ts`** — body no longer accepts `ownerUserId`;
   `WhatsAppRouteDeps.ingestGroup` signature drops the param; new regression test proving a
   client-supplied `ownerUserId` is ignored.
6. **`apps/api/src/fixtures.ts`** — `fakeWhatsAppDeps` fixture signature updated to match.
7. **`apps/web/src/api/whatsapp.ts`, `pages/WhatsAppPage.tsx`, `.test.tsx`** — frontend updated
   to the new 2-arg contract.
8. **`apps/web/src/pages/CalendarPage.tsx`, `.test.tsx`** — `handleDecision` gets a `.catch`; new
   failure-path test.

## Why (this session's own review process caught these)

Three fresh-context review agents (data-engineer, ai-engineer, senior-software-engineer) were
dispatched per the Stop hook's lifecycle "review" gate. Findings: a Block (summarize's LLM chain
never actually worked in production), a Critical (WhatsApp ingestion had no idempotency), a High
(cross-owner data exposure via a client-supplied `ownerUserId`), and a Medium (a missing
`.catch` in the Calendar review UI). All four are fixed here, each with live evidence.

## Real evidence

### Reproduced-bug-then-fix (summarize routing, live real Gemini API)
```
$ npx tsx verify_bug.mjs
CONFIRMED BUG - threw: router.route: unknown provider "ollama" in chain "summarize"
$ npx tsx verify_fix.mjs
FIXED - real completion via provider: gemini text: OK.
```

### Idempotency, live against real whatsapp_msg data (no mocks)
```
$ npx tsx verify_idempotency.mjs
source A _id: 45e3b9e8e0cc60a61bf6bc6ce8d7ce693970fbda0659c399ef9a93c60d02b369
source B _id: 45e3b9e8e0cc60a61bf6bc6ce8d7ce693970fbda0659c399ef9a93c60d02b369
STABLE (idempotent): true
turns: 50, unique turn ids: 50 (must match)
turn ids identical across two independent runs: true
```

### Typecheck
```
$ cd packages/ingest && npx tsc --noEmit -p tsconfig.json   # exit 0
$ cd apps/api && npx tsc --noEmit -p tsconfig.json           # exit 0
$ cd apps/web && npx tsc --noEmit -p tsconfig.json           # exit 0
```

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/ai:          56/56 pass
packages/ingest:      41/41 pass   (was 40, +1)
packages/index:       38/38 pass
packages/ask:         32/32 pass
packages/meeting-bot: 40/40 pass
apps/api:             66/66 pass   (was 65, +1)
apps/web:             40/40 pass   (was 39, +1)
Total: 320 tests, 320 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (206 file(s) within budget)
lint-dirsize: OK (74 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (239 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (996 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (115 lines, budget 200)
✔ no dependency violations found (239 modules, 701 dependencies cruised)
```

## Real, disclosed limitation (unchanged from prior units)

Main Mongo host (`13.202.206.101:27017`) unreachable this entire session (re-confirmed via
`ping`, 100% packet loss). A full live `POST /whatsapp/ingest` HTTP round-trip is deferred; the
pure adapter/store logic (the actual bug surface) IS verified live against real data with no
mocks, as shown above.

## How to verify (for the checker)
1. `pnpm --filter @lkb/ingest typecheck`, `pnpm --filter @lkb/api typecheck`,
   `pnpm --filter @lkb/web typecheck` — expect exit 0 each.
2. `pnpm -r test` — expect exit 0, 320/320.
3. `pnpm lint:structure` — expect exit 0.
4. Read the changed files listed above — confirm each of the 5 findings is genuinely fixed as
   described (not just claimed).
5. If `whatsapp_msg`'s Mongo is reachable, independently re-verify the idempotency claim.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
