# Manifest — web-settings-keys

Status: checked-PASS (see qa/verdicts/web-settings-keys.md)
Contract: `qa/contracts/web-settings-keys.md`
Fix cycle: 1

## What changed

1. **`schema/api_keys.schema.json`** — added typed `label` field; `pnpm gen:types` regenerated
   `packages/core/src/generated/api_keys.ts`.
2. **`apps/api/src/routes/keys.ts`** (new) — `GET /keys`, `POST /keys`, `DELETE /keys/:id`,
   injected `KeysDeps`.
3. **`apps/api/src/store.ts`** — `createMongoKeysDeps()`.
4. **`apps/api/src/server.ts`**, **`production.ts`**, **`fixtures.ts`** — `keys` wired into
   `ServerDeps`; real stateful `fakeKeysDeps()` (not read-only like the other fakes — create/
   list/revoke stay consistent within one test).
5. **`scripts/seed-demo-server.mjs`** — added `"keys"` to the minted demo key's scopes.
6. **`apps/web/src/api/keys.ts`** (new) — `listKeys`/`createKey`/`revokeKey`.
7. **`apps/web/src/api/client.ts`** — `apiFetch` extended with `method`/`body` options (was
   GET-only), reused by `keys.ts` instead of duplicating fetch boilerplate.
8. **`apps/web/src/pages/SettingsPage.tsx`** (new) — list/create/revoke UI, one-time raw-key
   banner.
9. **`apps/web/src/layout/NavSidebar.tsx`**, **`App.tsx`** — `/settings` nav entry + route.
10. **`TASKS.md`** — T-010 marked `done`.

## Real evidence

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/index:       25/25 pass
packages/ai:          54/54 pass
packages/ask:         30/30 pass
packages/ingest:      34/34 pass
packages/meeting-bot: 40/40 pass
apps/api:             44/44 pass   (+7 keys route tests, was 37)
apps/web:             17/17 pass   (+4 SettingsPage tests, was 13)
Total: 251 tests, 251 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (178 file(s) within budget)
lint-dirsize: OK (70 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (218 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (876 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration
✔ no dependency violations found (200 modules, 559 dependencies cruised)
```

### Real browser evidence (Playwright, dev server :5173/:3300, real seeded data)
`qa/evidence/spa-settings-create.png` — a real key minted live
(`lkb_6c12db2158b14e664dbc124e7814d54f4b60ac63d8143325`), shown once in the "copy it now" banner;
"Existing keys" list shows both the real `demo-server` key (all real scopes, real creation
timestamp) and the newly-created "Test Integration" key. A follow-up live click on that key's
Revoke button (confirmed via accessibility snapshot, not just the screenshot) flipped its badge
from "active" to "revoked" and removed its Revoke button — a real, working end-to-end revoke.

## How to verify (for the checker)
1. `pnpm -r test` from repo root — expect exit 0, 251/251.
2. `pnpm lint:structure` — expect exit 0.
3. Read `apps/api/src/routes/keys.ts`, `apps/api/src/store.ts`'s `createMongoKeysDeps`,
   `apps/web/src/pages/SettingsPage.tsx` — confirm tenant isolation, masked listing, one-time
   raw-key semantics as described.
4. Start the real server, mint a key via `scripts/seed-demo-server.mjs`, real-`curl` `POST
   /keys`, `GET /keys` (confirm no `keyHash`/raw key in the response), `DELETE /keys/:id`, and a
   cross-tenant DELETE attempt (expect 404, key NOT revoked).
5. Real browser: navigate to `/settings`, create a key, confirm the raw value only appears once,
   revoke it, confirm the badge updates.
6. Confirm `TASKS.md`'s T-010 line says `done`.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
