# Manifest — whatsapp-consent-race

**Handshake status:** in_progress
Status: in_progress
Fix cycle: 1
Task: T-007
Issue: ISS-WAVECTORLESS-002 (uncapped source-consent/data-write security).
Priority tier: 2 — open high security finding; exact lane assigned by root.
Contract: qa/contracts/whatsapp-ingestion-first-slice.md C9–12; qa/contracts/goal-t007-visibility.md C1–3/C6.
Packet: qa/packets/whatsapp-consent-race.md

Central integration_control approved optional `sourceMeta.whatsappReviewFence` UUID-string seam, absent legacy/default and no backfill. Central owns shared schemas/composition. Only the approved review paths below are leased. Store.test.ts remains unchanged from prior cycle2 (SHA BD3B077E9E473B0B2ED1F60E82EF4C050BA4FC394E03F1067671FC1BA2878985).

| Changed path | Pre-unit SHA256 | Final SHA256 |
| --- | --- | --- |
| apps/api/src/whatsapp/review/store.ts | 3FC69E145C88BE966CB37427FB9E7586FD570005FFDDE7F7CA94E476DB96F8B2 | EDE283F9F87666A4F93EE146900A796704AEADE851F784602573F08C4104BE37 |
| apps/api/src/whatsapp/review/test-fixtures.ts | F104CEDFB1A68AF13D80BDD9426314028C746695F88AE9530A6842222C80DBE8 | 9818A498C41CBE9E2363BE07738F27C84AC54A97E3398236A80E4A87D6F09713 |
| apps/api/src/whatsapp/review/wire-fixtures.ts | 1472CADA1FCBDE87DC8C5E8A0E5CEAB281C281159B577F23BB43AC7F461929F4 | 34EBF7581F98CB5DE07363533F5F041C7F7A58C47BA95206DD6C28F2E03B1446 |
| apps/api/src/whatsapp/review/consent-race.test.ts | New file, no base | 5C6CF9ED8D315A954F21F1F88F6DB34F7B8A76AB2FAB9FE3D527E5D765EBF8FB |
| apps/api/src/whatsapp/review/consent-race-mongo.test.ts | New file, no base | E09BA616A47F3BC0E5B4D64AAF2D6FB4F94782D5716BDA19A94CA6D5FDFA9D00 |

Changed files preserved pre-unit byte backups in TEMP/wa-consent-race-backup. Earlier user's work retained. New QA files had no base. No keys, DB/provider/browser calls or local tests performed by maker.

Security flags: source authorization, tenant-qualified data writes, transactional publication/retries. Initial and idempotent approvals genuinely write the same source under current consent predicate before success. Required result: acknowledged=true, matchedCount=1, modifiedCount=1. No standalone fallback or external effects inside retried materializer.

## Evidence and gates

Mock protocol/rollback tests authored five; targeted standing suite expected64 total including unchanged issue0013/3 and issue0033/3 floors. Broker execution and fresh independent checker pending; no PASS claimed. Prior unit59 receipt is historical and does not certify changed race-unit bytes.

Native original issue002 reproduction authored exactly: pause approval after real source snapshot read, commit source consent=false from owner, resume approval. Includes reverse commit order, idempotent retry, current trusted-reader visibility and native rollback. Separate explicitly opt-in isolated replica-set test; no native proof executed. Issue002/full T007 stay HOLD until actual replica-set proof, independent review and integrated downstream acceptance. No mock PASS substitutes for Mongo write-conflict semantics.

Prospective maker phase start2026-10-15T09:24:53Z; tokens:null (runtime telemetry unavailable). End timestamp/active duration to be recorded on freeze; broker waiting excluded. Narrow search of apps/api/src source consent predicates found read guards but no application source-consent withdrawal endpoint; no broader source-owner implementation is inferred. Reingest writer is initialize-only and preserves consent/fence metadata, outside this unit's lease and unchanged.

Prospective phase ended/source freeze2026-10-15T09:29:17.5608405Z; elapsed/active264.561seconds, no explicit idle waits. Tokens:null. Later broker waiting excluded. No source edits after these final pins without next cycle/fingerprint update.
