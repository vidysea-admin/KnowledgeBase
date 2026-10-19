# Verdict: w29-wafetch (D-184 + WhatsApp archiver fetcher)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 17e312a6c8a433c3ab3514befde492824e85c231
Base: 4ca0271e. D-184 commit: ca604ec8.

## Evidence (independently produced)
1. D-184: diff vs base has 0 deleted lines (additions-only), follows D-183, carries `Approved-by: Umesh`; both quotes match the brief verbatim ("WhatsApp groups"; "whatsapp open krkee de ai connect krwa deta hu"). Chat provenance not verifiable here beyond the brief.
2. Privacy: MESSAGE_PROJECTION = {_id:0,text,ts,groupJid,messageId}; no sender/person field requested. Fetcher output goes only to the loader/extractor; candidates carry url/ts/hashes only (test asserts SECRETTEXT absent). Error log is class-name only.
3. Gates: needs LKB_WA_DISCOVERY=1 (fetcher env wiring + loader), non-empty WA_DISCOVERY_GROUPS, groups filter {jid in allowed, isTracked:true}, messages filter groupJid in tracked, ts >= now-7d, deletedAt null. Consent: loader refuses ids in WA_DISCOVERY_CONSENT_FALSE.
4. Read-only: only `find(...).toArray()` calls; grep for write verbs returned none.
5. createRequire(apps/api/package.json)("mongodb") resolves in the lane (pnpm symlink, mongodb@7.6.0, MongoClient is a function). Docker image copies apps/api/node_modules, so the anchor also exists there. No finding: the schedule tick runs from the repo on the host (REPO_ROOT = four dirs above src/calendar), and meeting-bot source is not in the runtime image.
6. Tests: whatsapp-archiver-fetcher + candidate-loader tests, 20 pass / 0 fail (exit 0). tsc --noEmit -p packages/meeting-bot exit 0.
7. Mutation (own): removed `isTracked: true` from the groups filter. Result 6 pass / 1 fail, killed by the allow-list test. Per-mutation backup, trap EXIT/INT/TERM/ERR, timeout 600. Restored; `git -c core.autocrlf=true hash-object` = 1a0209d0a591e23d312c9d435d5ab06959aefdbb = blob at HEAD.

## Notes (EXPLANATION, not issues)
- Consent "not false" is enforced only through the env list WA_DISCOVERY_CONSENT_FALSE in the loader; the fetcher reads no archiver-side consent field. This matches the existing loader contract; D-184 Rule 1 holds only while that env list is maintained.
- groups are per ownerUserId in the archiver; the fetcher does not scope by owner, so a jid tracked by two owners would be read once per jid (dedup is by hash downstream).
- D-184 Rule 3 (known-platform + allow-listed auto-schedule) is not implemented; disclosed in the manifest, outside Changes-authorized scope of this unit.

ISSUES-WRITTEN: none
Ledger rows may be flipped: yes (T-036/T-038 fetcher portion only; Rule 3 remains open).
Not verified: real Mongo/network behaviour (forbidden), the lint-loc gate, chat provenance of quotes.
