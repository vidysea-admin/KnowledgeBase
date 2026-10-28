# lint-tracker-g4-qualify-issue-refs

**Handshake status:** checked-PASS
**Fix cycle:** 0
**Lane:** g4refs (branch lane/g4refs)
**Slug:** lint-tracker-g4-qualify-issue-refs

## What
The `tracker` stage of `lint:structure` (`scripts/tracker-audit.mjs --gate g1,g4,g5`) was red with 9 gating G4 "ambiguous issue ref" findings, all in `qa/manifests/`. The 9 manifests mix qualified `ISS-<LANE>-NNN` ids with bare `ISS-NNN`, and a lane shard numbers the same number. Only the reference token was changed; no wording or history. No source, lint script, config, ledger row, verdict or contract was touched.

The accepted forms are `ISS-<LANE>-NNN`, or a bare id followed by `(canonical)` (`scripts/lib/tracker-audit.mjs` auditIssueRefs).

## Before / after
Before: 9 gating, 12 advisory (all in `qa/verdicts/`). After: 0 gating, 12 advisory (unchanged, verdicts are the checker's record).

## Requalified (row refs, resolved by the row title against the manifest's own subject)
| manifest | old ref | new ref | evidence |
|---|---|---|---|
| r1-attention-alerts.md | bare 002, bare 003 | ISS-R1ALERTS-002, ISS-R1ALERTS-003 | lane r1alerts; 002 = sessionKey id, 003 = time zone label; both match the sections they head |
| t034-tab-capture-extension-logic-tests.md | bare 001, 003, 005 (and the 001..005 list) | ISS-T034EXT-001, 003, 005 (list prefix) | lane t034ext; 001 queued chunks after loss, 003 racy double start, 005 foreign-sender onMessage; titles match the prose |
| t036-calendar-description-link-scan.md | bare 002, 003, 005 (incl. fix-cycle-2 heading) | ISS-T036CAL-002, 003, 005 | lane t036cal; 002 embedded redirect, 003 passcode-less duplicate, 005 `/s/` host links; verdict line 73 confirms 005 "12th shape" |
| t037-join-rules-stale-lock-takeover.md | bare 004 (x3), bare 005 | ISS-LOCKTAKE-004, ISS-LOCKTAKE-005 | lane locktake; 004 aged dead lock takeover (high), 005 live holder / lying probe, owns() narrows but does not close |

## Not row references (number mentioned as a number)
These cite the ambiguous number itself, in prose or in quoted lint output, not a ledger row, so no lane could be chosen and `(canonical)` would be false. The `ISS-` prefix was dropped from the token (001, 002) and nothing else: medium-fix-batch-2-2026-10-10.md (1 line), t-031-audio-watchdog.md (3), t-033-bot-tests.md (3), u3-notify-channels.md (1), u4b-heartbeat-collection.md (1).

## Left as is (advisory, verdicts, not edited)
qa/verdicts/: iss-298-ledger-id-allocator, medium-fix-batch-2-2026-10-10, r1-alert-title-policy-and-reasons, r1-attention-alerts, t-031-audio-watchdog, t-047-controller, t034-tab-capture-extension-logic-tests, t036-calendar-description-link-scan, t037-join-rules-stale-lock-takeover, t039-send-now-command, t040-strict-quote-verifier-and-windowing, t046-retention-dry-run-report. Not gating.

## Evidence
`node scripts/tracker-audit.mjs --gate g1,g4,g5` before: 9 finding(s) gating; after: exit 0, no gating findings.
