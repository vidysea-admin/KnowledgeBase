# t046-retention-purge-executor

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap T-046; owner decision D-145 (pending append): raw media purged 90 days after capture; transcripts, notes, claims, citations kept forever). Class: DATA DELETE: FULL ceremony. Verdict by the checker only.
Lane: lane/t046purge. No ledger issue is being fixed; no new issues filed. Round cap: seam t046 retention has 2 prior PASSed verdicts (planner, dry-run report); this is a new capability (the executor those units deferred), not a round N+1 on the report.

## Scope
New: `packages/ingest/src/retention-purge.ts` (executor + `runRetentionPurge`), `retention-purge-cli.ts` (entry, not wired into `lkb`, not scheduled), `retention-purge.test.ts`.
Changed (additive, read-only): `retention-report-state.ts` records `SessionInfo.capturedAt` = source.json `createdAt` (written by scripts/upload/submit.mjs). The report modules do not import the executor; `retention-report.nowrite.test.ts` still passes.
Media is on the local filesystem under `--media-root` (no GridFS / object storage), so no stop condition applied.

## Behaviour
- DRY RUN by default (`WOULD-PURGE path= age_days= size_bytes=`). `--execute` is the only way to delete; repeated or unknown flags are usage errors (exit 2).
- Deletes only the single media file a session's source.json names, located inside `--media-root` by the existing read-only probe, for records that are ALL of: planner purge-eligible; no dry-run guard veto (same `assess`: quiet period, pipeline in-progress state, shared file, cross-tenant file, incomplete scope, unconfirmed clock); captured strictly more than 90 days ago; media extension (webm mp4 mkv mov avi m4v m4a mp3 wav ogg opus aac flac). Nothing under the data root is touched; .json/.txt/.md/.vtt are refused (`not-a-media-file`).
- Execute mode re-runs the whole evaluation from disk immediately BEFORE EACH item (`VETOED path= reason=`).
- One `unlink` per item (atomic); a failure is logged `FAILED path= error=<code>`, others continue, exit 4. Log lines: path, age, size only.
- Tenant scoped: state read only from the tenant's directory; a file also referenced by another tenant is kept.

## Evidence
```
packages/ingest/src/retention-purge.test.ts: ℹ tests 11 ℹ pass 11 ℹ fail 0
all retention-*.test.ts + retention-report/*.test.ts (existing 85 + 11 new): ℹ tests 96 ℹ pass 96 ℹ fail 0
tsc --noEmit -p packages/ingest: clean
```
Tests: 89 d kept / 90 d kept / 91 d deleted; old transcripts and notes (media-root and data-root) survive, including sessions whose source path points at notes.md / turns.json / talk.vtt; veto arriving after planning (pipeline processing; claim no longer verified; file touched) blocks deletion; dry run leaves a byte-identical tree and calls no unlink; partial failure (EBUSY) reported, others deleted, exit 4; no transcript/title text in logs; other tenant's file survives; cross-tenant shared file kept; missing createdAt kept.
Mutation (8, in-worktree harness, per-mutation byte backup restored in finally, deleted before commit; final file hash == committed blob): KILLED 8/8: ignore veto (stale plan) 3 failing tests; delete transcripts (media-type rule dropped); age threshold 90 to 60; boundary `<=` to `<`; dry-run deletes; failure swallowed; failure aborts run; guard verdicts ignored.

## Not delivered / not verified
Never run against real data, not scheduled. No `purgedAt` is written back (the data root is not written by this unit), so a re-run sees the file as not found (kept, "media-not-found"). Real state carries no `processedAt` (the report notes this), so the planner currently reports nothing eligible on real data until a writer records it. Capture time = source.json `createdAt` (upload instant): if the owner means another instant that is a one-line change. Evidence clips (D-008 / ADR-0003) are never extracted by any shipped code and D-145 names none; executor never touches `evidence-clip` kind. A race between the final re-check and `unlink` (microseconds) is not closed.
