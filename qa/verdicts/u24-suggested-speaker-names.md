# u24-suggested-speaker-names - independent checker

VERDICT: PASS
Cycle checked: 0
ISSUES-WRITTEN: none

Checked HEAD d189a29b (code ebca1cea + fix d189a29b) in lane/u24suggest. Class: security (tenancy + data writes), full ceremony. No model calls, no browser, no Mongo, no merge, no push.

EXPLANATION:
1. Tenancy. Probed the real router + scoped accessor over the in-memory Db with my own throwaway test (deleted): tenant B key on A's session/suggestion id, A's id under another session (s2 id under s1), forged `x-tenant-id` / `x-lkb-tenant` headers and `tenantId` in the body, and operator-style / traversal ids. List returns only the caller's rows; confirm and reject return 404 (no oracle), nothing is written, B's confirm only produces tenant-B rows. Tenant comes only from `req.auth`.
2. Final-vs-suggested. A suggestion lives in `speaker_suggestions`; its only readers are the router/db accessor (served as `suggestedName`, never displayName/aliases/personId). No other code reads that collection; the `speakers` collection has no production reader beyond the accessor and the writer; /sessions, /ask, /search checked by existing test, Explorer "Speakers" tab uses graph nodes, not either collection.
3. Concurrency. Confirm and reject flip status with an updateOne guarded on `status:"suggested"`, then re-read; 20 interleaved confirm/reject races gave exactly one winner and a speakers row iff confirmed; triple concurrent confirm gave one row and one confirmation. Not a transaction: a crash between the status flip and the speakers upsert leaves a confirmed suggestion without a final row until the retry, which heals it (idempotent). Acceptable, noted.
4. Re-index. reindex-survival.test.ts 7/7 on 5 consecutive runs; writer skips confirmed rows before any delete; tombstone is `$setOnInsert`; extractor honours `rejected` and `confirmed`.
5. Migration 20261013100000: createCollection guarded by listCollections, createIndex idempotent, indexes loaded from schema/index.json (tenantId; tenantId+sessionId+status; unique tenantId+sessionId+speakerRef+personId; none expiring), down() drops only speaker_suggestions. Fake-DB test 2/2. Not run against Mongo. Note: down() destroys decisions and tombstones (repo precedent).
6. `suggest` defaults off; the only `suggest: true` is in tests; `extractSpeakersGrounded` has no production caller; config/ai-routing.yaml untouched.
7. Web: dashed amber frame, "Suggested:" prefix, "unconfirmed" badge, quote with kind; confirmed card solid green. Client calls GET and POST .../confirm|reject on the encoded session path with strict response validation. Quote is a text child (no innerHTML); the `<img onerror>` test passes.
8. Mutations (8, lane-unique harness, per-mutation byte backup restored in finally, hash == HEAD blob each time, harness deleted): tenant scope dropped KILLED (13 fail); suggestion shown final KILLED; reject writes final row KILLED; overwrite of confirmed row KILLED; tombstone overwritten KILLED; extractor ignores rejected KILLED; quote as raw HTML KILLED; confirm-of-rejected-allowed SURVIVED, but it is an equivalent mutant (the guarded updateOne cannot match a rejected row and the re-read still returns conflict).
9. Results: tsc clean for core, index, db, api, web (temp paths mapping, deleted); api/db/index/migration suites 112/112 (incl. server.test, production.test); web vitest 22/22 across sessions + client; schema/validate.py 29/29; gen-types --check OK.

Notes (low, not backlog): (a) writeSpeakerDocs is findOne then deleteMany then insertOne, so a confirm landing inside that window could lose its speakers row; the writer is only used by the manual deterministic sync script and a re-confirm heals it. (b) A confirmed person's row is skipped on re-index for all sessions, so fresher auto evidence for that person is not merged. (c) Owner-pending: schema/ is 31 files vs lint-dirsize budget 30; not a FAIL.
