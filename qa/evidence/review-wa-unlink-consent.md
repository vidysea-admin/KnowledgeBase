# Senior review: wa-unlink-consent (74568a6c..26416d51), 2026-10-30
VERDICT: Warning (no critical or high defect)
- medium: review/store.ts:200-207 + :60-75. A retry after a partial failure loses legacy (unstamped) sources: the consent overwrite drops the recordedBy match, so their needs-review candidates stay pending while the response says candidates:"done".
- medium: links/service.ts:171,179. Only the archiver step is durable (archiverUnlinkPending). quarantine_failed and consent_withdraw_failed leave no owed marker.
- medium (declared): R-10 accountChanged/suspendForAccount has no production caller.
- low: service.ts:193. The reconcile transition is not wrapped in step(); if it throws, archiverUnlinkPending is never set.
- open question: review/ingest.ts does not check link state; sync after unlink may create new candidates.
Fold-in: medium items are repairs only if a checker fails a criterion on them; otherwise they become Candidates rows at close-out.
