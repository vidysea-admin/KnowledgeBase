# t045-source-intake-wiring

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap task T-045 "More sources"; audit: "Intake planner only; no sink or API; no one-run-per-source live check"). Class: data-write + tenancy: full ceremony.
Lane: lane/w045 (wiring lane). No new ledger issues.
Authority: D-135 (re-ingest within a tenant is idempotent), D-136 (tenant-scoped source ids).

## Scope (apps/api only; packages/ingest consumed unchanged)
- `src/source-intake/store.ts`: `createMongoIntakeSink` (implements `IntakeSink` over `@lkb/db` tenant-scoped accessors: `sources`, `sessions`, `turns`, and `scopedCollection(getDb(),"media")`); `save` validates turn timing first, inserts sources -> media -> sessions -> turns and on failure deletes exactly the rows it inserted (by `_id`, tenant-scoped); `createSourceIntakeDeps` (consent = public/given/"web-ingest", as `ingestUrl`; indexing after create, failure swallowed as `ingestUrl` does).
- `src/source-intake/adapters.ts`: `buildSourceIntakeAdapters` composes the ordered registry (recording, document, youtube via yt-dlp, onair, zoom-recording, url via Jina). STT `transcribe` and the OnAir/Zoom `downloader` stay INJECTED.
- `src/source-intake/wiring.ts`: flag gate `LKB_SOURCE_INTAKE=1`; anything else returns `undefined`.
- `src/routes/ingest-source.ts`: `POST /ingest/source` `{url}`, scope `ingest`, tenant from the key only. 201 created, 200 already-ingested (D-135), 400 bad body, 422 no turns, 502 adapter/sink failure, 503 unconfigured. Only known adapter errors echo their message.
- `src/server.ts`: optional `ServerDeps.sourceIntake`; router mounted only when set. `src/composition/production.ts`: passes `buildSourceIntakeDeps(process.env, boundIndexer)`.

## Flag-off identity
`LKB_SOURCE_INTAKE` unset/"0"/"true": `buildSourceIntakeDeps` is `undefined`, the route is not mounted; test compares the response of `POST /ingest/source` with `POST /ingest/no-such-route` (identical body after path substitution).

## Assumptions (maker choices, not contract text)
- Flag ON but no STT composed (none exists in apps/api; provider/credentials are an owner decision) mounts the route answering 503 `source_intake_unconfigured`, so nothing is silently dropped.
- "Recording" submission = a recording URL (Zoom share, OnAir). File upload needs multipart handling the repo lacks (as noted in routes/ingest.ts); NOT done. The recording/document adapters take server paths, so the route never passes client input to them.
- A concurrent duplicate submit can lose the `sources._id` insert race: it fails 502 with nothing deleted (rollback only covers rows this call inserted); retry returns already-ingested.
- Legacy bare-hash ids (D-136 dual-form reads) are the migration unit's concern, not this one.

## Evidence (apps/api; node off PATH; fakes only: in-memory tenant-scoped collections, fake exec/reader/downloader/STT)
- `node --test --import tsx src/source-intake/source-intake.test.ts` -> tests 13, pass 13, fail 0. Covers per source (youtube, cloudonair, zoom-recording): 201 + rows all under tenant-1, repeat 200 already-ingested with byte-identical tables and transcribe called once; two tenants same media -> distinct ids, body `tenantId` ignored; url adapter; missing downloader -> 502, no rows, token not echoed; 401/403/5 bad bodies; turns-insert failure rolls back only this unit and retry succeeds; bad timing and zero turns write nothing; indexing failure swallowed; flag off; flag on without STT -> 503.
- `tsc --noEmit -p tsconfig.json` in apps/api -> exit 0.
- Full apps/api suite (`src/**/*.test.ts`): 803 tests, 800 pass, 3 fail: `activity-health/router.test.ts` (fails identically on the base tree with changes stashed: "upload queue operation timeout"), `ai-transport.test.ts` stdout-overflow (timing under shared CPU; rerun 17/17 pass), and my test file (run while I was relocating it; rerun 13/13). server.test.ts 8/8, routes/ingest.test.ts 4/4, production.test.ts 2/2.
- `lint-loc` OK (886 files); `lint-dirsize` OK (first run failed at 34 files vs budget 31, fixed by moving the new files into `src/source-intake/`); full `lint:structure` earlier: only the pre-existing `lint-tests` stage unavailable (SIGTERM), not touched here.
- Mutations (untracked harness, byte backup restored in `finally`, deleted before commit; all restored byte-identical): rollback loop removed KILLED; flag gate removed KILLED; idempotence lookup disabled KILLED (3 fails); scope gate removed KILLED; already-ingested status 200->201 KILLED (3 fails).

## Acceptance: met in code vs needs a live run
- Met in code (fakes): persistence sink; authenticated tenant-scoped API; D-135 idempotence; D-136 tenant-scoped ids; per-source adapter selection and fail-closed behaviour; flag off by default.
- STILL needs a live run / owner input (not done): one real run per source (YouTube with yt-dlp+ffmpeg, Zoom recording, OnAir). OnAir needs a Google login. No `HostedRecordingDownloader` exists for OnAir/Zoom. No production STT provider is composed, so with the flag on the route answers 503 until one is injected. Real Mongo not touched (tenant-scoped accessors only exercised through fakes; the `media` collection through `scopedCollection` is untested against a real driver). Upload of recording files not built.
