# t036-youtube-calendar-discovery

Status: checked-PASS
**Handshake status:** checked-PASS
Fix cycle: 0
Priority tier: 3 — next unblocked roadmap task T-036; new Calendar wiring behavior (existing pure extractor seam has one PASS).
Lane: discovery (MAIN, coordinator-authorized reserved files); no Git commit or provider action authorized.
Authority: user requested parallel remaining-task closure; coordinator GO for owned paths. D-165 automatic discovery authorization retained; this slice leaves YouTube discovery OFF by default.
Contract: qa/contracts/gmail-meeting-candidates-approval.md (literal evidence and acquisition failure floor); qa/manifests/t036next.md / qa/verdicts/t036next.md define next wiring slice. No new whole-feature acceptance or contract amendment claimed.

## Behavior and boundaries

- Actual Calendar mapper calls existing resolveYoutubeLive, only enabled by exact LKB_YOUTUBE_LIVE_DISCOVERY=true or injected enabled:true. No environment file or deployment config changed.
- UpcomingMeeting gains separate optional youtubeWatch {url,videoId,source} and youtubeWatchIssue:ambiguous. No meetingUrl, approval or capture is derived from them.
- Native acquisition/sourceEvents and discovery HTTP projection preserve watch evidence; default joinable UI projection stays unchanged.
- ISS-T036NEXT-001 recorded suffix-lookalike corpus adds three exact-host regression cases in existing extractor tests. Maker does not close the ledger issue; checker verifies it.
- Gmail completeness already rejects all partial list/body failures; no justified Gmail parser/persistence change made. Real complete-mailbox proof remains operational work.
- Security: authenticated read path only; no new auth/tenancy implementation, database writes, credential reads, subprocess/provider execution or recording. Existing Calendar owner check unchanged.

## Changed paths and dependency map

Base HEAD: 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd. These source files were clean when reserved; unrelated concurrent MAIN edits remain outside scope.

1. apps/api/src/gws/gws-calendar.ts: imports resolver; additive fifth injectable option on existing overloads; mapping spreads separate watch evidence. Existing createGwsCalendarReadDeps invokes the default option in production; owner binding unchanged.
2. apps/api/src/routes/calendar.ts: UpcomingMeeting type only, no route runtime logic changed.
3. apps/api/src/join-rules/youtube-live-extract.test.ts: three hostile-host assertions, replaying ISS-T036NEXT-001.
4. apps/api/src/gws/youtube-calendar.test.ts: new synthetic actual mapper/native acquisition/HTTP consumer checks (no tracked base).
5. This manifest (new, no tracked base).

Immediate consumers: apps/api/src/routes/calendar.ts discovery/native route and default joinable projection; packages/meeting-bot/src/calendar/auto-join.ts must ignore watch-only rows. T-045 owner may consume watch evidence separately; this slice does not wire capture.

Bound final SHA256 (2026-10-14):
- gws-calendar.ts: B5866AB4779F1CBE6E88AFA78C5FF6B027275E66932BAE678C052395DD507537
- routes/calendar.ts: 944C49E42590A1E27E624F8F497EF46BB44ACB66E2614E5A62F33AB65DD6DC16
- youtube-live-extract.test.ts: 6FFCDC1CE1A5EB0296F37CD5B3B91C99C0C2AD8E1CCB81A05D1D62F09ED7E514
- gws/youtube-calendar.test.ts: 51961D7B17B49A2FA34BA10DD22F82CCF9EE7749F9560C6E5FDAEF9CFD6C4D83

## Evidence

All commands from C:/Users/product/Desktop/KnowledgeBase, node C:/Program Files/nodejs/node.exe, coordinator CPU slot2 granted. No browser/provider/database calls. No subprocess test workers: approved synchronous local TypeScript loader replaces unavailable esbuild transport; actual application TypeScript executes in-process.

- `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/gws/youtube-calendar.test.ts apps/api/src/join-rules/youtube-live-extract.test.ts apps/api/src/routes/calendar.test.ts`: exit0, 26 tests /26 pass /0 fail /0 skipped, wall4.952s, Node duration4532.418ms. Includes actual mapper, native source coverage, owner-bound authenticated local HTTP projection, existing Calendar sync/cancellation floors, and suffix-host refusal.
- `node --import ./.cache/coordination/safe-test-runtime/register.mjs .cache/coordination/discovery-downstream.mjs`: exit0, wall1.077s; exact output `actual mapper -> actual selectAutoRecordItems: 0 watch-only joins; ISS-T036NEXT-001: 3/3 refused`. Repro artifact retained; imports actual Calendar adapter, extractor and scheduler, using synthetic provider only.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json`: exit1, wall5.752s; own seven initial diagnostics corrected; sole current diagnostic is unrelated concurrent apps/api/src/grounded-content/reader.test.ts(97,54): TS2571 Object unknown. No global typecheck PASS claimed.
- `python contracts/verify_contracts.py`: exit0, wall0.440s, `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`; no release assurance.
- `node scripts/lint-loc.mjs`: exit1 wall0.645s, unrelated packages/meeting-bot/py/test_sb_join_ownership.py408/budget400. All owned paths fit bounds.
- `node scripts/lint-dirsize.mjs`: exit1 wall0.359s, unrelated scripts/webinar32/budget30. Own gws test adds no violation.

No broad suite or mutation run. Known esbuild/worker spawn EPERM is bypassed only through coordinator-approved no-spawn test runtime; no escalation or runtime guard change. Global gates require coordinator final verification after concurrent lanes settle.

## Remaining gates

Real Calendar description shapes, actual complete configured Gmail body acquisition, scheduler deployment, YouTube capture intake and whole T-036/live R1 completion remain unverified. No task completion claim.

## Independent close-out

Checker PASS cycle0: qa/verdicts/t036-youtube-calendar-discovery.md, persisted2026-10-14T09:15:53.061Z. Four bound source hashes verified unchanged before maker close-out. Independently reran focused26/26 tests and13/13 additional probes, including actual exact-literal environment enablement, conference/watch coexistence, ambiguity preservation, both selectors/modes with zero watch-only joins, and ISS-T036NEXT-001 exact3/3 refused. Checker attributes a later final API typecheck PASS from coordinator evidence; maker's earlier sole unrelated error remains historical evidence. Scoped code-slice PASS only; remaining live and broad structure gates above preserved. No source/config/environment changes after check.
