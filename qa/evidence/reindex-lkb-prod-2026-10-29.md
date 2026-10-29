# Reindex of 3 failed lkb_prod sessions (2026-10-29) - PARTIAL, BLOCKED on provider credentials

Authority: qa/gates/kb-speed-wa-h3-2026-10-29.md; D-204 (three-part production opt-in), D-207 (--index-existing). Secrets redacted; no connection string or .env value was printed.

## Before-state (read-only, lkb_prod)
| Session | Tenant | status.index | indexFailure | Turns | session_pages | chunks (sourceRef=id) | participants / platform |
|---|---|---|---|---|---|---|---|
| 2026-04-21-visa-blueprint-part2-italy-france-nz | toc | failed (preflight, turnCount 291) | none | 291 | 1 | 237 | none / none |
| 2026-08-10-ucas-what-changed-what-matters | toc | failed (preflight, turnCount 230) | none | 230 | 1 | 0 | none / none |
| 2026-10-13-zoom-webinar-p2 | vidysea | failed (no attempt) | none | 73 | 0 | 0 | [] / zoom |

Bad turns: Visa t141 tStart 2008 > tEnd 213 (prod and turns.json agree). UCAS t114 tStart 1883 > tEnd 1868 (t113 is 1815-1883, t115 starts 1868);
the approved repair "t114 tStart -> tEnd of t113" is already true (1883), so it does not fix the inversion. UCAS is PARKED until Umesh picks a value.

## Backup (Node EJSON export; mongodump is not installed on this host)
Path: C:\Users\Lenovo\AppData\Local\Temp\claude\D--KnowledgeBase\6b53d24e-d383-4e23-be0e-0cc3e334e1f4\scratchpad\reindex-backup-2026-10-29\ (one `<collection>.ejson.gz` per collection + MANIFEST.json; canonical EJSON, re-read and counted after writing). Total about 4 MB. KEPT.
| Collection | Docs queried | Docs re-read from file |
|---|---|---|
| sessions | 3 | 3 |
| sources | 3 | 3 |
| turns | 594 (291+230+73) | 594 |
| session_pages | 2 | 2 |
| chunks | 237 | 237 |
| claims | 9 | 9 |
| graph_edges | 3 | 3 |
| topics / tree_index | 0 | 0 |

## Zoom p2 (tenant vidysea)
Dry run: `node scripts/webinar/sync-session.mjs 2026-10-13-zoom-webinar-p2 --index-existing --tenant vidysea --dry-run` passed.
Live: `MONGO_WORK_DB=lkb_prod MONGODB_DB=lkb_prod node scripts/webinar/sync-session.mjs 2026-10-13-zoom-webinar-p2 --index-existing --tenant vidysea --i-know-this-is-production`
Printed `PRODUCTION WRITE ENABLED (D-204)`, then FAILED at summarize:
`strict webinar index incomplete: strict grounded summary incomplete: all providers failed for jobKind "summarize": ollama-cloud (ollama cloud credentials unavailable); ollama-cloud-verifier (ollama cloud credentials unavailable)`.
Cause: OLLAMA_API_KEY is not in this checkout's environment/.env (runbook: copy it from the Windows bot host's .env). Recorded on the row:
`sessions.indexFailure = {via: index-existing, phase: preflight, state: failed, generation: 13445fe2-0421-4f0f-ac54-7cb6d228b88d, reason: <above>}`.
After-state: status.index failed; turns 73 (unchanged); session_pages 0; chunks 0; participants [] / platform zoom (unchanged). The only prod write was the indexAttempt/indexFailure bookkeeping.

## Visa (tenant toc)
- Compare: turns.json (291) vs lkb_prod (291): same ids, same text, same tStart/tEnd/speakerRef/tenantId, 0 differences (t141 identical before the fix).
- Fix applied to data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json line 1268: t141 `"tEnd": 213` -> `2013`. Only that line changed.
- Dry run `node scripts/webinar/sync-session.mjs 2026-04-21-visa-blueprint-part2-italy-france-nz --dry-run --index`: PASSED (turns 291, 237 lexical chunks planned, no timing refusal).
- Real `--index` run NOT executed: it needs the same LLM summarize provider (ollama-cloud) that just failed with unavailable credentials, and it would rewrite the 291 prod turn rows before failing. Prod Visa rows untouched (still t141 2008/213, status.index failed).
- Confirmed right before: prod participants/platform are still none/none.

## UCAS
Not touched. Parked pending Umesh's choice of the t114/t113 timing value.

## To finish
1. Put OLLAMA_API_KEY into this environment (not committed, not printed).
2. Re-run zoom `--index-existing --tenant vidysea` and Visa `--index` (commands above / runbook), then read the after-state (status.index done, indexFailure unset, turns 73 / 291, session_pages and chunks non-zero).
3. Umesh picks the UCAS value, repair turns.json, dry run, real run.
