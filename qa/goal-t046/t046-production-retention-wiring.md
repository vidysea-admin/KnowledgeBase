# t046-production-retention-wiring

**Handshake status:** in-progress
Status: in-progress
Fix cycle: 0
Task: T-046; tier: 3 roadmap; class: tenant/data-write security boundary, full ceremony.
Maker /root/qa_status/maker_t046; checker /root/qa_status/checker_t046.

## Scope and current state

Root granted isolated helpers, exact retention job/CLI/executor/report-state callers and affected tests, plus retention-only status/proof/stamp/re-emission hunks in scripts/webinar/sync-session.mjs. Actual callers now use the helpers. New helpers were relocated into retention/production/ under an exact lease; retention root remains 30 files without budget/enforcement changes. Source/tests are INPUT_FREEZE for central serial API/web typechecks/builds. New helper/caller tests have not executed. This candidate pin document is not ready-for-check or PASS.

No real media purge, live DB write, provider, browser, scheduler installation or publication was performed. Separate t046-retention-status-api-ui preserves its maker8/8 and pending independent verdict. Ground truth remains qa/contracts/goal-t046.md C2/C3/C4/C7 and D-008/D-145. Whole-task live/host acceptance stays open.

## Frozen candidate hashes

Five production helpers/tests and API writer-consumer test are new. Other rows are existing leased callers/tests. index-proof.mjs is unchanged central-owned dependency.

| Path | SHA256 |
|---|---|
| packages/ingest/src/retention/production/retention-processed-proof.ts | 5F78C759F8F331CE3E1C1D339CCE148F6004C53C9B487B8CDD2C9538934BA7BF |
| packages/ingest/src/retention/production/retention-processed-proof.test.ts | 8F11AF238D57186817CBD64FA03CC1FEEF520DBD4DBA86E19A0C18FFEA5B6246 |
| packages/ingest/src/retention/production/private-summary.ts | E78E427AB662036994C846B62F9B904334FFB7D1A8270956B40035B24AF50181 |
| packages/ingest/src/retention/production/private-summary-read.ts | 3F451BF9B51D76671F28A7AE132C84F99E8D370FE86F131564CF6C65BA5554F0 |
| packages/ingest/src/retention/production/private-summary.test.ts | CC06A52B3A10BE04A4657EAFAC6BDB77BD92DCB7815D86A96855CA69FA92CC0E |
| packages/ingest/src/retention/retention-purge-job.ts | 7D5256AB830CD07617AE2CCC8270CFB242B302EB815EC4AA40964850BFAD2912 |
| packages/ingest/src/retention/retention-purge-job-cli.ts | 4020A8E026AEDD3020139983DAAA1C7807D83FE72789DAF480EC4C37C238DE62 |
| packages/ingest/src/retention/retention-purge.ts | 83A9217D33279DFCC29CE56723336E7C14C20E8B0F2AF84BA85B0B8EAC602911 |
| packages/ingest/src/retention/retention-report-state.ts | 60A8D0548366703E3C252BA686B359BA216C49CE65823F1F844C8A2CE9943C64 |
| packages/ingest/src/retention/retention-purge-job.test.ts | E715A2CDA87B54841C360CCF8935A887389915792F65A786C50F49CA423DFF81 |
| packages/ingest/src/retention/retention-purge.test.ts | 1AB22DA66F581212A42515528B35109810DAC7067C155EBD3A7A19E066F73E53 |
| packages/ingest/src/retention/retention-live.test.ts | 11CD7133BC7CB2BA5DCC1060EF46FE43A45DC5B08369C0150D93FB355FEF265B |
| packages/ingest/src/retention/retention-report.nowrite.test.ts | 22EE35DDFB077855F4F3F1E684A1215665F278B4579A678690807D401A2DD27E |
| scripts/webinar/sync-session.mjs | 9896EFF9E8FDC9E6298ACA5CF751C708C45E8C24CFD2ACF8B42ACB96FD5A4012 |
| scripts/webinar/index-proof.mjs (dependency only) | 7E548F2C2F643D6D3F6AFBA6C2360AAF225A7B531B6DC7E2D0FB2439283843EB |
| apps/api/src/retention-status/writer-consumer.test.ts | 090697259504397A67D0F2E51950BE0A8667F6ADD6F6D08D877CD7D9343DBCBE |

Before-edit byte snapshots in this packet directory:
- base-retention-purge-job.ts: EF59D1197742BB5A9C12469DAD1512D868822A9CF9733EA9EDD929D8A1339BE2
- base-retention-purge-job-cli.ts: 9A08F9816D60973296C01839CFAA8F55A9C30ECC02A68199E14191176767D56E
- base-retention-purge.ts: 1CAB47BC43CD7B9BC98D05EBD03255D2171B362D600E4D12FEF8A44C949DC4FE
- base-sync-session.mjs: D6A2D14B454651992B189CFFBF612A8AC060679AE94640021B13C31BD3473A52

Base sync already includes T043 producer; its source discriminant and completion gates are preserved.

## Export and real producer/consumer contracts

- ProcessedProofBinding = {tenantId,sessionId,sourceId,workDb,generation,inputArtifact:"turns.json"|"knowledge-turns.json"}. markSessionProcessedFromProof(sessionDir,expected,now):MarkResult requires current physical regular source/session/proof/selected genuine input bytes, exact identities/current completed flags/generation/source-input hashes/entire actual row count. Stale/foreign/missing proof, invalid clock/lane and changed snapshots refuse. It preserves audit and valid processedAt, invokes existing guarded atomic marker idempotently, and never manufactures combined transcripts.
- setSessionIndexStatus(sessionDir,identity,index:"processing"|"done"|"failed") and emitSessionPreservingAudit(sessionDir,incoming) preserve metadata/audit/processedAt with guarded atomic CAS and 1MiB session-state cap. Actual sync sets processing before INDEX, done after strict actual completion/proof publication, then stamps; failure sets failed and propagates. T043 prepareWebinarIndexProof supplies actual selected input bytes/generation/completion gates.
- writeTenantRetentionSummary(dataRoot,tenantId,summary:LastRun):{ok:true,path}|{ok:false,reason} writes only <physical dataRoot>/<sha256(exact tenant)>/retention/last-run.json. Fixed projection includes exact private tenant metadata. Physical/no-link/hardlink checks, exclusive lock/temp, fsync, temp identity/content, CAS target and atomic publication apply. No stale lock takeover; cleanup removes only own entries. POSIX directory fsync failure after rename reports failure with potentially published bytes, never unsafe rollback.
- Strictly readonly private-summary-read.ts exports validation/physical/read helpers and imports no writer. report-state depends only on it. Operational retention folder is excluded only for safe exact-tenant v1 regular private state with known temp/lock names; foreign/malformed/unknown or genuine session artifacts remain counted/fail-closed. Standing nowrite test scans the actual transitive graph and rejects wider flags at both literal r opens.
- Actual job parses strict --tenant/--data-root, binds fixed private sidecar and propagates publication failure. Optional LKB_RETENTION_DATA_ROOT must normalize to actual --data-root; API factory uses exactly that root. LKB_RETENTION_LAST_RUN is refused; legacy lastRunFile cannot select another path. Readiness is adopted actual CLI/job writer source, not an invented flag or real purge run. Missing configured reader stays unavailable; no global fallback.
- Execute refuses missing clip dependency before evaluate/unlink. Dry-run emits no false CLIPS retained promise; clipsRetained=null. API fixture consumes actual exported dry-run CLI/job through private writer/auth middleware/reader/route, with fixture media untouched.

Security class: tenant/auth and file data writes. No frozen contracts/governance/enforcement/schema/unrelated sync mapping edits. Maker never writes checker verdicts.

## Pending evidence and exact broker queue

No new helper/caller tests or passing types are claimed. Central API typecheck receipt qa/goal-2026-10-14/api-types-current-freeze.json exited 2 (18553ms) and found TS18048 missing-stat narrowing at this module alongside other owners' errors. Runtime released freeze for the exact fix: sameReadFile now returns false if either stat is missing, without assertions or relaxed refusal. Source re-frozen at the new pin above; recheck remains pending. Sole broker /root/docker_checker executes commands and supplies receipts; maker has no active handles. Old8/8 does not prove these changed sources. All commands need fresh broker approval after central freeze builds.

1. cwd packages/ingest, outer45s: node --test --test-concurrency=1 --test-timeout=30000 --import tsx src/retention/production/retention-processed-proof.test.ts src/retention/production/private-summary.test.ts src/retention/retention-purge-job.test.ts src/retention/retention-purge.test.ts src/retention/retention-report.nowrite.test.ts — 7+6+11+12+4=40 cases. Executor delete tests use only disposable ten-byte fixture media and injected mock clips, never real media/provider.
2. cwd packages/ingest, outer45s: node --test --test-concurrency=1 --test-timeout=30000 --import tsx --test-name-pattern="the job writes|a last-run write failure|ISS-T046LIVE-003" src/retention/retention-live.test.ts — three selected sidecar cases; real ffmpeg/ffprobe cases excluded from changed scope, reported filtered, not PASS.
3. cwd apps/api, outer45s: node --test --test-concurrency=1 --test-timeout=30000 --import tsx src/retention-status/writer-consumer.test.ts — two actual producer→auth consumer fixtures; disposable loopback only, no provider/DB/purge.
4. cwd repo, bounded syntax only: node --check scripts/webinar/sync-session.mjs — no script execution.

Known TSX spawn may require broker direct escalation for approved commands. Central owns broad types/builds and source freeze. Frozen-validator reuse requires fresh exact pins and never substitutes affected-stage/downstream checks. No on-disk mutation testing requested.

## Remaining acceptance

Independent checker must rehash candidate and inspect actual callers before scoped PASS. Hosting factory and real MeetingBotPage mounts remain central-owned supplemental evidence, not live-host acceptance. Flat TOC directory versus SHAtenant gatherer layout remains an explicit consumption gate unless integration demonstrates reconciliation. Scheduler adoption, genuine today-run dry-run/retained-clips/purge behavior and host/live acceptance remain outside these fixtures. Whole T-046 stays in progress.
