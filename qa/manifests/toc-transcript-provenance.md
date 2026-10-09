# TOC transcript provenance

**Handshake status:** BUILDING
Status: BUILDING
Fix cycle: 1
Task: U2.2 / TOC citation integrity; security/data-write safety class
Priority: tier 2 newly evidenced stale-citation integrity, following tier3 U2.2 continuation.
Authorization: user requested goal understood/build on Desktop; root precisely authorized source paths and strict-loader integration; independent checker reviewed plan. No human gold/threshold decision implied.

## Incident and scope
Checker traced old T002 supporting passages at git907c9c9 versus changed T003 turns at e0fef9c: same positional turn IDs were reused for different text while claims/pages survived. Structurally valid references could silently cite unrelated text.
New scripts/lib/transcript-provenance.mjs and .test.mjs; existing short/long transcribers, seed-toc, sync-real-turns, watcher ingest-chain, webinar sync-session and session-rows strict loader. No frozen contracts/schema/enforcement or actual corpus/DB changed.

## Behavior
Turn IDs hash tenant/session/speaker/time/text and duplicate occurrence. Changed transcripts archive byte-original turns and persist stale derived provenance before atomic replacement. Historical claims/pages remain preserved. Seed refuses absent/stale/foreign proof and consumes a frozen snapshot parsed/hashed from the same bytes. Explicit combined selection uses the existing full speech/screen/frame validator with a memoized-byte callback; exact hash key sets/values include optional inputs and frames. Default speech never adopts leftover combined files.
Only fresh generating producers bind artifacts; binding proves generation integrity, not extraction or semantic acceptance. Seed uses source-derived tenants and explicit isolated work Mongo target, no production fallback. Sync preflights every session before its first delete and refuses changed transcripts that still have derived knowledge.

## Maker evidence
node --test scripts/lib/transcript-provenance.test.mjs: 13/13 PASS, zero skips, 4085.375ms; repeat in affected union all13 PASS.
Includes actual short/long provider path using native local Node hooks (paid/network calls0), exact-byte archive/order/failure tests, same-ID stale refusal, fresh seed source tenant/work DB, live sync refusal before delete/insert, both real file generators, same-buffer concurrent replacement, strict combined frame evidence and optional-file removal.
Immediate downstream/audio tests (session-rows, ingest-chain, find-audio-file): 29/29 PASS, zero skips.
Affected union with process-video tests: 54/55 PASS; real FFmpeg fixture FAIL spawn ffmpeg ENOENT. No skip, timeout extension or assertion weakening. FFmpeg installation/media acceptance remains open.
Node --check all8 touched source scripts exit0; git diff --check exit0. Global lint-loc retains six unrelated existing failures; local modified files stay within their existing budgets. Directory gate retains baseline apps/api/src32vs31 and scripts33vs32 failures.
No mutation-on-disk harness, real provider/DB/browser, production/backfill, transcript archive or scheduler operation executed.

## Acceptance limits
No live Mongo concurrency/transaction or full historical72claim correctness claim. The seven independently reviewed reconciliation mappings remain proposals and65 claims unreviewed. Original corpus14/80 invalid references and3 invalid-time sessions remain. R1/R2/R3 full product gates stay open.

## Checkpoint disposition
Independent checker27/27 focused checks pass and both identified source blockers are repaired. Required affected-stage gate remains54/55: real FFmpeg fixture fails ENOENT; unit is HOLD/BUILDING, not done. Current storage cannot safely provision FFmpeg/FFprobe. contracts/verify_contracts.py fresh exit0 is explicitly vacuous. No production/whole-corpus acceptance follows.
