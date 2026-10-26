# w29-wafetch: real WhatsApp archiver fetcher (flag OFF) + D-184

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w29-wafetch.md
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w29-wafetch (branch lane/w29-wafetch)
Base: 4ca0271e (origin/master)
Candidate: see `git log -1` of the lane branch. Unit A commit ca604ec8 (D-184); Unit B is the commit after it.

## Changed paths
- docs/DECISIONS.md (D-184 appended via scripts/append_decision.ps1, Approved-by: Umesh, both quotes verbatim)
- packages/meeting-bot/src/calendar/whatsapp-discovery/whatsapp-archiver-fetcher.ts (+ .test.ts)
- packages/meeting-bot/src/calendar/schedule-tick.ts (+1 import, loader now receives the fetcher)

## Behaviour
Fetcher reads `groups` {jid, isTracked:true, jid in WA_DISCOVERY_GROUPS} then `messages` {groupJid in tracked, deletedAt null, text non-null,
ts >= now-7d} with projection {text, ts, groupJid, messageId} (no sender). Output goes to the existing loader/extractor which discards the text.
Built only when LKB_WA_DISCOVERY=1 AND WA_DISCOVERY_GROUPS non-empty; Mongo opened lazily on first fetch (WHATSAPP_MONGO_URL / WHATSAPP_MONGO_DB);
failure logs the error class only and returns [].

## Deviations (for the checker)
- Fetcher lives in meeting-bot, not apps/api: the schedule tick runs in meeting-bot (buildRealScheduleTickDeps) and apps/api cannot be imported from it. The mongodb driver is only in apps/api, so the opener resolves it via createRequire anchored at apps/api/package.json (no package.json change).
- The `tracking` collection is not read: `groups.isTracked` is the tracked-group join (tracking is per-person).
- D-184 Rule 3 (known platform + allow-listed group => scheduled like an authenticated sender) is NOT implemented here; Changes-authorized covers only the fetcher and flag. Candidates stay senderAuthenticated undefined (needs-approval). Follow-up unit if wanted.

## Checks
- `node --test --import tsx src/calendar/whatsapp-discovery/*.test.ts` (packages/meeting-bot): tests 38, pass 38, fail 0 (7 new)
- tsc --noEmit -p packages/meeting-bot: exit 0, no output
- `node scripts/lint-loc.mjs --all`: OK (10 stages, 0 failed)
- D-020 mutation (per-mutation backup + trap, script outside repo): add `personId: 1` to MESSAGE_PROJECTION -> pass 6, fail 1 (projection test kills it); restored, cmp RESTORED.
- No real Mongo or network used; tests use fake collections.
