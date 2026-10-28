# Manifest — api-server-env-config-fix

**Contract:** qa/contracts/developer-api.md (criterion "a real Mongo-backed store is wired at
apps/api's actual startup" — this unit is that startup wiring actually working)
**Goal task:** none (bugfix discovered live while diagnosing Umesh's report that the web
dashboard/Brain/Sources pages showed no data)
**Date:** 2026-09-06
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** ISS-023 (cycle 1 FAIL: 3 evidence screenshots left at repo root broke
`pnpm lint:structure`'s lint-root check, 18 loose files vs budget 15)

## Fix cycle 2 (2026-09-06)

Checker cycle 1 verdict (`qa/verdicts/api-server-env-config-fix.md`, commit `0f18dc9`):
**FAIL, 7/8 criteria**, single finding **[C8, medium]** — the env/CORS fix itself was
independently re-verified as real and correct (fresh `apps/api` boot, fresh `seed-demo-server.mjs`
run, fresh curl with a checker-generated key, real remote-Mongo data, correct
`Access-Control-Allow-Origin` scoped to `localhost:5173`) — the only failure was three untracked
evidence screenshots (`brain-before-click.png`, `dashboard-fixed.png`, `dashboard-live-check.png`)
left at repo root during live debugging, pushing loose root files to 18 against the 15 budget.
**Fix:** deleted all three (untracked, safe — they were throwaway debugging screenshots, not
project artifacts). Re-ran `pnpm lint:structure` clean (`lint-root: OK (15 loose root file(s), 1
gitignored excluded)`, full suite green). No code change this cycle.

## What changed

1. **`apps/api/src/index.ts:1-24`** — real bug: `main()` never loaded `.env` at all (no
   `dotenv`/`loadEnv` call anywhere in the file), and even if it had, it read
   `process.env.MONGO_URL` while the repo's `.env` sets `MONGODB_URL` (no `MONGO_URL` var exists
   anywhere) and `process.env.MONGO_DB` while `.env`'s convention (matching
   `scripts/seed-demo-server.mjs`) is `MONGODB_DB`. Net effect: every plain `tsx src/index.ts` /
   `node dist/index.js` silently fell back to `mongodb://localhost:27017`, which has nothing
   listening on it, so the API's DB-backed routes could never return real data no matter what was
   in `.env`. Fixed: load `.env` via `dotenv` from the repo root (resolved relative to the
   compiled/`tsx`-run file's own path, so it works regardless of cwd), and read the correct var
   names `MONGODB_URL` / `MONGODB_DB`.
2. **`apps/api/package.json`** — added a `"dev": "tsx src/index.ts"` script (there was none — the
   only documented way to start the server was tribal knowledge) and added `dotenv` as an
   explicit direct dependency (it previously only resolved via pnpm hoisting from the workspace
   root's devDependency, which is fragile and not declared).
3. **`.env` / `.env.example`** — added `CORS_ORIGINS=http://localhost:5173`. Real second half of
   the same symptom: `apps/api/src/production.ts:70` already reads `CORS_ORIGINS` (comma-separated)
   into `ServerDeps.corsOrigins`, and `server.ts:47`'s `createCors` already enforces it, but
   nothing had ever set the var, so it defaulted to an empty allow-list — every cross-origin
   `fetch()` from `apps/web` (a different origin, `:5173` vs `:3300`) was silently CORS-blocked by
   the browser, which is indistinguishable from "no data" in the UI (`apps/web`'s error states just
   say "failed to load dashboard data").

## Why (real, reproduced root cause of Umesh's report)

Umesh reported the web dashboard/Brain explorer showed nothing / "details load nahi ho rahe".
Reproduced live:
- Neither `apps/api` nor `apps/web` was running (both `curl` to :3300 and :5173 returned exit 7 /
  connection refused).
- Started `apps/api` as documented (`npx tsx apps/api/src/index.ts`, no special env export) →
  connected to `localhost:27017` (nothing there) → `MongoServerSelectionError`. This is NOT the
  same as the session's earlier "remote Mongo host intermittently down" finding — it is a
  standing code defect that happens even when the real Mongo host is fully reachable, because the
  code was never pointed at it in the first place unless a human manually exported
  correctly-renamed env vars in their shell (which earlier session verification runs did, masking
  the bug).
- After the `.env`-loading + var-name fix: `apps/api` connected to the REAL remote Mongo
  (`13.202.206.101:27017`) and served real data (`/sessions`, `/sources`, `/graph`,
  `/whatsapp/groups` all returned real documents — see Real evidence).
- With `apps/api` now serving real data, opened `apps/web` in a real Playwright-driven browser at
  `http://localhost:5173` and confirmed the CORS block via the browser console (not guessed):
  `Access to fetch at 'http://localhost:3300/sessions' from origin 'http://localhost:5173' has
  been blocked by CORS policy`. After setting `CORS_ORIGINS` and restarting `apps/api`: 0 console
  errors, dashboard/Sources/Brain/WhatsApp pages all render real data.
- **A dev-only Vite proxy was tried first as an alternative fix, then reverted** (see
  `apps/web/vite.config.ts` — currently unchanged from before this unit) because it shadowed the
  SPA's own client-side routes of the same name (`/sources`, `/sessions` are both API paths and
  real app pages) — direct navigation to `/sources` got intercepted by the proxy instead of the
  app shell, returning a raw 401 JSON body instead of the page. The CORS fix is the correct,
  sufficient fix; the proxy attempt and its revert are disclosed here rather than silently erased.

## How to verify (commands + expected)

- `cd apps/api && npx tsc --noEmit -p tsconfig.json` → exit 0
- `cd apps/api && node --test --import tsx "src/**/*.test.ts"` → 66/66 pass (unchanged count —
  this fix touches only the production entrypoint, which the test suite injects fakes around and
  never exercises directly)
- Start `apps/api`: `cd apps/api && PORT=3300 npx tsx src/index.ts` → stdout shows
  `injected env (11) from ..\..\.env` then `@lkb/api listening on :3300` (not a Mongo connection
  error)
- `node scripts/seed-demo-server.mjs` (from repo root) → prints a real demo API key against real
  Mongo data (25 sessions, 23 session_pages)
- `curl http://localhost:3300/sessions -H "Authorization: Bearer <demo key>"` → real session JSON,
  not a connection error
- Start `apps/web`: `cd apps/web && npx vite --port 5173`; open `http://localhost:5173`, set
  `localStorage.lkbApiKey` to the demo key, reload → Dashboard/Sources/Brain/WhatsApp pages all
  show real data, 0 console errors

## Actual outputs (from maker's own run)

```
$ cd apps/api && npx tsc --noEmit -p tsconfig.json
(exit 0, no output)

$ cd apps/api && node --test --import tsx "src/**/*.test.ts"
ℹ tests 66
ℹ pass 66
ℹ fail 0

$ node scripts/seed-demo-server.mjs
loaded 25 sessions, 23 session_pages for tenant "toc"
wrote tree_index root "tenant:toc" (1 year node(s))
API key (save this, shown once): demo_c4ea73b8783c34b3b377b1056243d2e4c99dc5f96070519e
tenantId: toc

$ curl http://localhost:3300/sessions -H "Authorization: Bearer demo_c4ea..."
{"sessions":[{"_id":"2026-04-21-visa-blueprint-part2-italy-france-nz", ... 25 real sessions ...}

$ curl http://localhost:3300/whatsapp/groups -H "Authorization: Bearer demo_c4ea..."
{"groups":[{"groupJid":"120363405936621456@g.us","ownerUserId":"6a8d0c692fcc75f0e911b878","subject":"Millionaires","trackedPersonCount":3}]}
```

Browser console before CORS fix (real, captured via Playwright, not paraphrased):
```
[ERROR] Access to fetch at 'http://localhost:3300/sessions' from origin 'http://localhost:5173'
has been blocked by CORS policy: Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```
Browser console after CORS fix: `0 errors, 2 warnings` (the 2 warnings are pre-existing
React-Router future-flag notices, unrelated to this fix).

Screenshot evidence: `dashboard-fixed.png` (repo root, untracked — real dashboard: 25 sessions,
25 sources, 1 active API key, 0 open gaps, 5 real recent sessions listed by title/date/org).

## Status: checked-PASS (see qa/verdicts/api-server-env-config-fix.md, Cycle checked: 2, commit b60353b)

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
