# Manifest - w27-spoolacl
**Status:** ready-for-check
**Fix cycle:** 0
**Lane:** C:\Users\product\Desktop\KnowledgeBase-lanes\w27-spoolacl (branch lane/w27-spoolacl)
**Base SHA:** 4264418c (origin/master)
**Candidate SHA:** see the commit that adds this file (git log -1 lane/w27-spoolacl)
**Contract:** qa/contracts/goal-t045.md C5/C7
**Issue addressed:** ISS-T045WORKER-001 (high, class security; shard qa/issues.T045WORKER.jsonl). Ledger row NOT flipped.

## Finding on part 1 (native ACL gate)
Already present on base. `PrivateSourceJournal` (apps/api/src/source-intake/jobs/private-journal.ts) is the default journal of
`createSourceJobStore`, and `buildConfiguredSourceJobStore` in composition/integrations/source-jobs.ts reaches it through
`createSourceJobStore`. It runs `verifyPrivateDirectory` on the root, the hashed tenant dir and `verifyPrivateArtifact` on every
audit/lock/recovery artifact, before and inside each transaction. The checker's stale evidence (HostingJournal built bare) predates it.
Not imported from packages/meeting-bot: @lkb/api does not depend on @lkb/meeting-bot (see package.json), so the helper is the in-package
copy apps/api/src/bot-privacy/private-acl.ts. That copy differs from the meeting-bot original only by the single ETIMEDOUT retry. No change made.
The four filed reproductions (WINACL-ROOT/TENANT/FILE-ALLOW-OTHER, WINACL-OWNER-OTHER) run in privacy.test.ts through the native-reader model.
A real Windows ACL receipt is still not produced here (test skipped without LKB_T045_NATIVE_ACL_PATH).

## What changed (part 2: bearer URL retention)
- apps/api/src/source-intake/jobs/store.ts: every transition into a settled state (finish, uncertain, stale lease in update/poll/claim)
  goes through `settle()`, which replaces `url` with `redacted:sha256:<hex of the url>` (exported `redactedSourceUrl`).
  `replay()` accepts a marker only on a succeeded/uncertain row whose prior row has the matching URL, same inputHash and same watchedSnapshot;
  otherwise `source_spool_corrupt`. Legacy settled rows that still hold the URL replay unchanged.
- apps/api/src/source-intake/jobs/url-redaction.test.ts: new, temp dirs only (3 tests).
- Consumers: worker.ts uses the URL only from the claimed (running) job; view/completed/poll never exposed it.

## Known limit (needs owner decision / out-of-scope file)
The journal is append-only (hosting/journal.ts, hash chained). The queued and running rows written before settlement still contain the URL
in audit.jsonl. Removing them needs a compaction/rewrite primitive in HostingJournal, which this unit may not edit. Not done, not hidden.
Native ACL privacy of the spool remains the control over those earlier rows.

## Checks a checker must run
- `cd apps/api && node --test --import tsx src/source-intake/jobs/jobs.test.ts src/source-intake/jobs/privacy.test.ts src/source-intake/jobs/onair-binding.test.ts src/source-intake/jobs/url-redaction.test.ts`
- `node <repo>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in apps/api
- `node scripts/lint-loc.mjs --all`

## Evidence (real output)
- tests: tests 31, pass 29, fail 0, skipped 2 (native ACL receipt, POSIX-only control). ISS-T045WORKER-001: 4/4 reproductions refuse (privacy.test.ts).
- tsc: exit 0.
- lint-loc --all: 9 of 10 stages exit 0; stage `tracker` was SIGTERMed by the wrapper's 120 s stage timeout under load. Same command run alone
  (`node scripts/tracker-audit.mjs --gate g1,g4,g5`) exit 0 after 4m26s.
- D-020 mutation (settle() drops the url redaction): url-redaction.test.ts pass 1, fail 2 (killed). Restored, cmp ok, hash-object (autocrlf=true) 84a1187bfd57395e7c90b86a13f0ec04ad4dbfb5 equals pre-mutation work file.
