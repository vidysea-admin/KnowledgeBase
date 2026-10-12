# t045-adapter-intake-path

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (next unblocked roadmap task T-045, "More sources"). Class: data-write planning (persist is injected, none wired): full ceremony.
Lane: lane/t045intake. Lane ledger `qa/issues.t045intake.jsonl`: ISS-T045INTAKE-001 (medium, file-don't-fix).
Authority: D-135 (pending append): re-ingesting already-ingested media (same content-hash source _id) is idempotent: return the existing session id with an "already ingested" indication; create and delete nothing.

## Scope (packages/ingest only)
- `src/intake.ts` (new): `intakeFromSource(input, consent, {adapters, sink, newId, now})`. Picks the adapter with `detectSource`, runs `fetch`, looks the source up in the injected `IntakeSink.findSessionBySource(tenantId, sourceId)`; if found returns `{status:"already-ingested", sessionId, sourceId}` with no `toTurns` and no `save`. Otherwise `toTurns`, builds `sources`+`media`+`sessions`+`turns` docs the way `apps/api/src/ingest-store.ts` `ingestUrl` does, calls `sink.save(plan)` once.
- `src/index.ts`: export. `src/intake.test.ts` (new, 10 tests). No apps/api wiring, no real sink.

## Assumptions (maker choices, not contract text)
- Planner lives in packages/ingest, persistence injected, API wiring a later unit.
- Session title = `sourceMeta.title` if a non-empty string (trimmed), else `source.url`, else `_id`. Current adapters emit no title, so today it is the canonical URL.
- `status = {transcribe:"done", index:"pending"}` as ingestUrl; session date = `now().slice(0,10)`; turn ids `<sessionId>-tNNN`.
- Zero turns is refused (`no-turns`), not stored. Tenant on the input is required; adapter source for another tenant is refused (`tenant-mismatch`). A failed `save` becomes `sink-failed` with the underlying message dropped (may echo a Zoom token). `save` must be all-or-nothing (sink contract).
- Dedupe is checked after `fetch` because the hash needs the downloaded bytes; so a re-ingest still downloads once but never re-transcribes or writes.

## Evidence (packages/ingest, node off PATH, fixtures only: fake exec/downloader/reader/hasher/transcribe/in-memory sink)
- `node --test --import tsx src/intake.test.ts` -> tests 10, pass 10, fail 0.
- tsc `--noEmit -p tsconfig.json` -> exit 0.
- Per source (youtube, cloudonair, zoom-recording): created plan shape; re-ingest returns same sessionId, saves stay 1, transcribe call count unchanged. Cross-tenant same media -> created for both. Title fallback table (4 rows). Fail-closed: missing tenant (object and string input), unmatched input, no turns, tenant mismatch, sink failure message free of the token, consent refusal persists nothing.
- Mutations (harness untracked, deleted, byte backup restored in `finally`): idempotence check disabled KILLED; tenant check removed KILLED; zero-turn check removed KILLED; title read broken KILLED. `git hash-object src/intake.ts` after = 84a7e6e75e0ae1c0559c5993475e6574e5287b4b (intended).

## NOT covered
- No real sink or API route; no Mongo; no live YouTube/OnAir/Zoom run; no downloader exists for OnAir/Zoom. ISS-T045INTAKE-001: source `_id` is a global content hash, so cross-tenant identical media would collide on a real unique index.
- Not run: full ingest suite (CPU).
