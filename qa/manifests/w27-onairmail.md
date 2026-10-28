# w27-onairmail: join Google Cloud OnAir webinars announced by mail

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w27-onairmail.md
Fix cycle: 2
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-onairmail (lane/w27-onairmail)
Base SHA: a9b202b422af6436c52f61dc9850ecb12fd21fc4
Commits: U2 c79b3fc4 (resolver); U1 = candidate SHA (git log -1 on the lane branch)

## Behaviour
- U2 `packages/meeting-bot/src/calendar/onair/onair-link-resolver.ts`: `go.cloudplatformonline.com/dc/<token>` -> GET (no cookies, DNS pinned via
  `pinnedRegistrationGet`/`publicRegistrationAddress` reused from registration-link-resolver.ts, which is NOT edited), parse JS `redirecturl`,
  accept only host exactly `cloudonair.withgoogle.com` + path `/events/<slug>`, drop all query/fragment. 256 KiB cap, 15 s deadline, 3 hops. T-052 sendibm scope untouched.
- U1 `onair-mail-source.ts` (+ `onair-mail-window.ts`): authenticated google.com sender only (existing senderAuthenticated, D-178 ruling 1), classify
  registered/reminder/starting-soon/on-demand, slug via U2, window from matching calendar event else mail text (US DST aware), dedup per slug,
  candidates carry `platform:"cloudonair"`, `source:"gmail"`. Mail with two distinct events is rejected as ambiguous; liveless mail without window dropped.
- Hook `onair-mail-loader.ts` wrapped around the candidate loader in `schedule-tick.ts buildRealScheduleTickDeps` (2-line edit). OFF unless `LKB_ONAIR_MAIL=1`
  (then returns the base loader object itself). `onair-gmail-fetch.ts`: read-only gws list/get; authenticated = dmarc=pass + header.from=google.com.
- Fixtures `onair-mail.fixtures.ts`: synthetic, fake tokens, no personal data.

## Not done / assumptions
- The Gmail query and Authentication-Results parsing have not been run against a live mailbox (gws is faked in tests). Real mail wording of the time line is unverified; unparsable mails drop with reason `no-window` (calendar event still wins).
- Candidates are `status:"pending"`; whether the tick's trust rules admit them without a join-rules approval is not exercised end to end.

## Checks to run
cd packages/meeting-bot; node --test --import tsx src/calendar/onair/*.test.ts src/calendar/schedule-tick.test.ts
node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json ; node scripts/lint-loc.mjs --all (root)

## Evidence
onair tests: 11 (resolver) + 14 (mail source) + 7 (loader/fetch) = 32 pass; with schedule-tick.test.ts 46 pass 0 fail. tsc meeting-bot exit 0.
lint-loc (loc stage alone) OK 1736 files; --all see final report. No D-015 corpus (new feature, no ledger issue).
D-020 mutations (per-mutation backup, restore verified identical, HEAD hash check): host pin removed -> 1 fail (host pin test);
dedup removed (slots keyed per message) -> 1 fail; sender auth gate loosened -> 1 fail; flag default-on -> 1 fail. Script: scratchpad w27/mut.mjs.

## Fix cycle 1 (checker FAIL 1a5b33f7, sender-gate bypass)
New onair-address.ts: RFC 5322 From parser (quoted names, comments, single mailbox only) and per-clause Authentication-Results check (authserv-id
mx.google.com only; one dmarc=pass clause whose header.from equals the From domain exactly). Multiple From headers -> unauthenticated, from="".
Tests added: google.com.evil.com (checker bypass, now refused), cross-clause pass, quoted display name, foreign authserv-id, multiple From, subdomain mismatch.
51 pass (onair 37 + schedule-tick 14); tsc exit 0. D-020: exact-domain match replaced by startsWith -> caught by loader test; restored identical.

## Fix cycle 2 (checker FAIL dc1529ad, forged Authentication-Results)
dmarcPassesFor now trusts only the topmost Authentication-Results header (must be authserv-id mx.google.com) and refuses when more than one header
carries that id. Tests: forged pass above/below Google's fail, two passing mx.google.com headers, foreign topmost header. 51 pass, tsc exit 0.
D-020: dropped topmost-authserv check and dropped single-header check, each caught by the loader test; files restored identical.
