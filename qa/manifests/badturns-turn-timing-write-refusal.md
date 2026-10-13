# badturns-turn-timing-write-refusal

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap/live-run finding, T-043). Class: data writes (turn writers): FULL ceremony. Lane: lane/badturns. No ledger issue is being fixed; no reproduction corpus in qa/issues*.jsonl.

## What was wrong
T-043 live run (lane/t043live f3f3f945, qa/evidence/t043-live-2026-10-12/summary.md, Finding 1): two legacy turns have tEnd < tStart (visa-blueprint-part2 t141: 2008 > 213; ucas t114: 1883 > 1868). `apps/api/src/ask/source-context.ts` validTurn throws BoundedAskError("invalid scoped source row") for the WHOLE request, so every /ask returned 503 once those sessions were in the tree. Nothing at write time refused them.

## Change (write side only)
- `scripts/lib/turn-timing.mjs` (new) and mirror `apps/api/src/turn-timing.ts` (new): tStart/tEnd finite numbers, tStart >= 0, tEnd >= tStart (zero-length allowed, as in validTurn). Throws ONE error listing every bad turn: `invalid turn timing, write refused (N turn(s)): session <id> turn <id>: tEnd 213 is before tStart 2008`. Values are never swapped, clamped or repaired.
- seed-toc: `artifactGeneration` (transcript-provenance.mjs) calls it, so `loadSessionArtifacts` (--legacy-unbound and bound), `bindDerivedArtifacts` and `--dry-run` all refuse before any DB connection.
- sync-session: `loadWebinarSession` (session-rows.mjs) calls it before its generic check, so the message names session and turn.
- ingest-store (`ingestUrl`): validation runs BEFORE the first write (source insert moved after it). New optional test seam `createMongoIngestDeps(indexSession?, { urlSource? })`.
- WhatsApp store NOT changed: its adapter clamps offsets to >= 0 with tEnd == tStart, so it cannot produce an invalid turn.
- `scripts/lib/legacy-unbound.test.mjs`: the existing seed-toc dry-run test used visa-blueprint-part2 as its VALID session; that session is now correctly refused, so it uses funding-dreams-loans-forex and also pins the refusal of the two real bad sessions.

## /ask side: exclude-with-warning (Umesh chose option B; D-153 (pending append))
- `apps/api/src/ask/source-context.ts`: `validTurn` split. Scope breach (foreign tenant, session outside the admitted set) STILL refuses the whole request. A row of the right tenant and session that is itself malformed (empty id/speakerRef, non-string text, non-finite/negative timing, tEnd < tStart) is EXCLUDED per turn, not per session. Chunks covering an excluded turn are dropped with it. A session whose every turn is excluded is skipped; if EVERY row in scope is invalid the existing "invalid scoped source row" refusal is thrown (never an empty success).
- Warning: `SourceHydration.excludedTurns[{sessionId,turnId,reason}]` (packages/ask/src/source-context.ts), surfaced in the /ask response as an `auditLog` entry `ask.source_rows_excluded` with the structured `excludedTurns` plus a readable step (the existing way /ask reports degradation, e.g. `ask.retrieval_degraded`). `validateHydration` refuses any hydration that cites an excluded turn.

## Evidence
- `node --test scripts/lib/turn-timing.test.mjs`: 6/6. With legacy-unbound.test.mjs and session-rows.test.mjs: 17/17.
- `apps/api: node --test --import tsx src/tenant-guards/turn-timing-write.test.ts`: 9/9. Neighbours store-guards.test.ts 114/114, source-context.test.ts 24/24. `tsc --noEmit -p apps/api`: clean.
- Real data replay (inside legacy-unbound.test.mjs): seed-toc --dry-run --legacy-unbound refuses visa-blueprint-part2 (t141) and ucas-what-changed-what-matters (t114), message names session and turn.
- Mutations on the write side (6/6 killed, per-mutation byte backup restored in finally): seed loader check removed; `tEnd <= tStart`; sync-session check disabled; ingest-store check removed; TS negative-tStart check disabled; error no longer names the turn.
- /ask exclusion: `apps/api/src/ask/source-exclusion.test.ts` 8/8 (one bad turn; end-to-end askV2 with warning; no warning when clean; real visa t141 and ucas t114 shapes; fully-excluded session skipped; all rows bad refuses; foreign tenant/session still refuses; excluded turn never cited). Run with a temp tsconfig path mapping @lkb/ask to this worktree.
- Mutations on /ask (7/7 killed, restored identical): timing check dropped; all-invalid guard removed; scope check disabled; never-cite check removed; warning not emitted; fully-excluded session not skipped; exclusion made per-session.
- Suites: packages/ask 122/122; apps/api src/ask + routes/ask + compete 131/131 (older store-guards 114/114, turn-timing-write 9/9); tsc clean for packages/ask and apps/api (worktree path mapping).
