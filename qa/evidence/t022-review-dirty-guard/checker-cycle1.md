# Checker cycle 1 evidence (t022-review-dirty-guard)
Real-browser (Chrome headless via CDP, http://127.0.0.1:18722 served from a scratch copy of the current HTML) result, fictional inputs only:
{"items":30,"sub0":0,"navBlocked":true,"fieldsKept":true,"noticeNav":true,"exportBlockedDirty":true,"unloadWarnsDirty":true,"discardCleared":true,"subAfterDiscard":0,"unloadCleanNoWarn":true,"navAfterDiscard":true,"sub1":1,"exportAfterSave":true,"cleanAfterSave":true}
Focused tests: tests 2 pass 2 fail 0 skipped 0 (node --test --test-name-pattern='dirty form|async restore' scripts/eval/t022-offline-review.test.mjs).
Regeneration: renderOfflineHtml(embedded snapshot) == current HTML after LF normalisation (59963 chars).
Processes started by this check (http.server, Chrome) were stopped.
