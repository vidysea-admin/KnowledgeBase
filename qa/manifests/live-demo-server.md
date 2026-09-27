# Manifest — live-demo-server

Status: checked-PASS (see qa/verdicts/live-demo-server.md)
Contract: `qa/contracts/live-demo-server.md`
Fix cycle: 1

## What changed

1. **`apps/api/src/store.ts`** — `createMongoTreeStore().load` now queries
   `node_id: \`tenant:${tenantId}\`` instead of the bare `tenantId`, matching what
   `packages/index/src/tree/build.ts`'s `buildTree` actually writes as a root node's `node_id`.
2. **`apps/api/src/server.ts`** — `createCompetePageRouter()` moved BEFORE `requireAuth` in the
   middleware chain. Every other router (ask, compete POST routes, stubs) stays behind auth.
3. **`apps/api/src/index.ts`** — direct-execution guard now uses
   `pathToFileURL(process.argv[1]).href === import.meta.url` instead of hand-built
   `` `file://${process.argv[1].replace(/\\/g,"/")}` ``.
4. **`packages/ai/src/json.ts`** (new) — `parseJsonLoose(text)`: raw `JSON.parse`, then a
   markdown-code-fence-stripped retry, else `null` (never throws). Exported from
   `packages/ai/src/index.ts`.
5. **`packages/ask/src/select-nodes.ts`**, **`packages/ask/src/refine.ts`**,
   **`apps/api/src/score.ts`** — each now imports and uses `parseJsonLoose` from `@lkb/ai`
   instead of its own private `tryParseJson`/inline `JSON.parse`-in-try/catch.
6. **`scripts/seed-demo-server.mjs`** (new) — builds tenant `"toc"`'s tree index from real
   `sessions`/`session_pages` and upserts it into `tree_index`; mints one real `api_keys` doc.
7. **`apps/api/src/routes/compete-page.ts`** — full rewrite: real CSS, verdict badge, per-source
   citation cards built via `document.createElement`/`textContent` (not `innerHTML`, per the
   repo's XSS guard — flagged on the first draft, which did use `innerHTML` string-concat).
8. **`apps/api/src/routes/compete.ts`** — `/compete/start`'s stored+returned `aiAnswer` now
   includes `scored` and `verdict` (previously only `text`+`sources`), which is what the
   rewritten page renders as "Cited sources".
9. **`apps/api/Dockerfile`**, **`.dockerignore`**, **`docker-compose.yml`** (new) — real
   multi-stage Docker build. Mongo is NOT containerized (points at the real external cluster's
   `lkb` database only, per D-003/ARCHITECTURE §5 — never any other database on that cluster).

## Real bugs found and fixed during this unit (disclosed, not hidden)

1. **Tree lookup node_id mismatch** (store.ts) — would have made every real `/ask` return
   `insufficient_coverage` forever, even with a correctly-built tree, because the query never
   matched anything `buildTree` produces.
2. **`/compete` page unreachable in a real browser** (server.ts middleware order) — a plain
   browser navigation sends no `Authorization` header, so the blanket `requireAuth` 401'd before
   the HTML that would even prompt for a key ever loaded.
3. **`main()` silently never ran on Windows** (index.ts) — the hand-built `file://` URL comparison
   is missing a leading slash for Windows absolute paths, so the guard always evaluated false;
   the process exited 0 with zero output, looking like a clean but silent no-op rather than an
   error.
4. **Every real `/ask` call returned "no candidates"** (select-nodes.ts / refine.ts / score.ts) —
   Gemini wraps its requested-JSON-only replies in a ` ```json ` fence even when told not to;
   three independent `JSON.parse` call sites each threw on that and silently degraded (empty
   node_ids array, or a fallback to the cruder heuristic scorer) rather than ever surfacing the
   parse failure.
5. **Docker image: `ERR_MODULE_NOT_FOUND` for every `@lkb/*` package at container start** — the
   runtime stage's `COPY packages ./packages` / `COPY apps/api ./apps/api` (from the build
   context, which has no `node_modules` per `.dockerignore`) was overwriting the directories the
   `deps` stage had already populated with pnpm's per-package `node_modules` symlinks. Fixed by
   copying the whole `deps` stage's `/app` first, then overlaying source on top (merge, not
   clobber).
6. **`/compete`'s "Cited sources" section always rendered empty** (compete.ts) — even after fix
   #4, `/compete/start`'s response only ever forwarded `{text, sources}`; `scored` (which the
   rewritten page reads for per-source relevance/reasoning) was never in the payload at all.

## Real evidence

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core test:  tests 7   pass 7   fail 0
packages/index test: tests 19  pass 19  fail 0
packages/ai test:    tests 54  pass 54  fail 0
packages/ingest test: tests 34 pass 34  fail 0
packages/ask test:   tests 30  pass 30  fail 0
packages/meeting-bot test: tests 40 pass 40 fail 0
apps/api test:        tests 18 pass 18  fail 0
$ echo $?
0
```
Total: 202 tests, 202 pass, 0 fail, across 7 workspace packages.

### Local dev server (Windows path-guard fix)
```
$ MONGO_URL=... MONGO_DB=lkb GEMINI_API_KEY=... PORT=3300 npx tsx apps/api/src/index.ts
@lkb/api listening on :3300
$ curl -o /dev/null -w '%{http_code}' http://localhost:3300/compete   # no Authorization header
200
```

### Docker build + run (fresh, this session)
```
$ docker build -f apps/api/Dockerfile -t lkb-api:demo .
...
#24 naming to docker.io/library/lkb-api:demo done
#24 DONE 0.2s
$ echo $?
0

$ docker run -d --name lkb-api-demo -p 3400:3000 -e MONGO_URL=... -e MONGO_DB=lkb -e GEMINI_API_KEY=... lkb-api:demo
7f28b62001046492ad65f75c07d43e5b5afc83aa7cdc0b4e3f18409ef79d464d
$ docker logs lkb-api-demo
@lkb/api listening on :3000

$ curl -o /dev/null -w '%{http_code}' http://localhost:3400/compete
200
```

### Real /ask against the containerized server, showing non-empty scored[] (the JSON-fence fix)
```
$ curl -X POST http://localhost:3400/ask -H 'authorization: Bearer <key>' \
  -d '{"query":"What did students learn about New Zealand post-study work visas?"}'
verdict: correct
scored count: 1
answer: Students learned that New Zealand offers a guaranteed 3-year post-study work visa for
Bachelor's or Master's graduates, which does not require employer sponsorship. Kshitij Garg
also mentioned a rough...
```

### Real browser screenshot (Playwright, against the Docker container on :3400)
`qa/evidence/live-demo-server-docker-compete.png` — shows a real round trip: verdict badge
"CORRECT", a real synthesized answer citing Kshitij Garg (Estero Education) by name, and one
"Cited sources" card: "In Focus #3", "90% relevant", `toc/year:2026/month:07/session:2026-07-30-in-focus-3`,
with the judge's real reasoning text — confirming both the citation-forwarding fix (#6) and the
DOM-based (non-innerHTML) rendering.

### Seed script, real idempotent re-run
```
$ node scripts/seed-demo-server.mjs
loaded 23 sessions, 23 session_pages for tenant "toc"
wrote tree_index root "tenant:toc" (1 year node(s))

API key (save this, shown once): demo_7b948c12fc42bcb81278383f21bf6ed28d068f6f93984ab1
tenantId: toc
```

## How to verify (for the checker)
1. `pnpm -r test` from repo root — expect exit 0, 202/202.
2. `docker build -f apps/api/Dockerfile -t lkb-api:demo .` from repo root — expect exit 0.
3. Run the container with real `MONGO_URL` (from `.env`'s `MONGODB_URL`), `MONGO_DB=lkb`,
   `GEMINI_API_KEY` (from `.env`), mapped to a free host port — expect
   `@lkb/api listening on :3000` in `docker logs`, and `curl -o /dev/null -w '%{http_code}'
   http://localhost:<port>/compete` with NO Authorization header to return `200`.
4. `curl -X POST http://localhost:<port>/ask -H 'authorization: Bearer <the real minted key>'
   -d '{"query":"<a question the real seeded sessions actually answer>"}'` — expect
   `verdict` ∈ {`correct`,`ambiguous`} and a non-empty `scored` array, not `insufficient_coverage:
   true` with `scored: []`.
5. Read `apps/api/src/store.ts`, `server.ts`, `index.ts`, `packages/ai/src/json.ts`,
   `select-nodes.ts`, `refine.ts`, `score.ts`, `compete.ts`, `compete-page.ts`, `Dockerfile` to
   confirm the described fixes are actually present (not just claimed).
6. Grep `compete-page.ts` for `innerHTML` — expect zero matches on any value built from
   server/LLM-derived data (a literal empty-state string via `textContent` is fine; there should
   be no string-concatenation into `innerHTML` at all in the current version).

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
