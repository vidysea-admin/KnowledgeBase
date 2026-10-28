# Verdict — iss-322-333-sender-authentication

VERDICT: PASS
Cycle checked: 0
Checked commit: 111d587 (maker). Security class (auth/trust): full ceremony, uncapped. Checker: independent subagent, 2026-10-10. Timing not instrumented (unknown).
Scope: Approver ruling 2026-10-10, option (a) of qa/gates/iss-322-multifile-shape.md (D-122): the three spoof routes (config allowlist, preTrusted from auto_approved, scan-time auto-approve) gated on a receiver-attributed authentication verdict. Remaining gate outside this unit: see ISS-376 (production everyWebinar mode bypasses all trust checks).

## Commands (my own execution; node v24.19.0 from the codex runtime; each under `timeout`)
- core `node --test --import tsx src/domain/sender-authentication.test.ts` -> tests 6 / pass 6 / fail 0.
- meeting-bot `node --test --import tsx src/calendar/{auto-join,schedule-tick,trusted-sender,sender-authentication,join-rules}.test.ts` -> tests 82 / pass 82 / fail 0 (prints `ISS-322: 4/4 refused`, `ISS-333 (meeting-bot side, d+e): 2/2`, `ISS-CAPTURE-001: 3/3 refused`).
- apps/api `node --test --import tsx src/gws-gmail.test.ts src/routes/meeting-candidates.test.ts` -> tests 39 / pass 39 / fail 0 (prints `ISS-333 (api side, a+b+c): 3/3`, `ISS-CAPTURE-003: 1/1 refused`).
- `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/core, packages/meeting-bot, apps/api: exit 0, 0, 0.
- Dependency boundary: root package.json has no depcruise script (`lint:structure` = lint-loc); not run. core is pure and apps/api -> core is the allowed edge (gate file, `.dependency-cruiser.cjs` rules cited there).
- File budgets (non-blank): gws-gmail.ts 296, store.ts 291, auto-join.ts 238, calendar-client.ts 237, schedule-tick.ts 279, sender-authentication.ts 85, webinar-types.ts 113. All <= 300 (matches manifest).

## Independent probes (scratchpad probe1/2/3, run against the committed sources)
1. Header trust, 37 cases vs expected (probe1.mts). 36 matched. Refused as required: two mx.google.com headers (either order); `mx.google.com.`, `mx.google.com.evil.tld`, `evilmx.google.com` authserv-ids; a comment before the authserv-id; `dmarc=fail ... ; dmarc=pass` duplicate results; dmarc=pass for another / sub / super domain; dmarc=pass inside a comment or quoted string; two From headers; From address list; ARC-Authentication-Results and X-Authentication-Results look-alikes; absent header; From with trailing dot; punycode look-alike; dmarc=none/fail with an aligned dkim/spf; dmarc=pass without header.from; mixed dkim fail/other-domain pass. Accepted as required: genuine header, folded (CRLF+tab) header, MX.Google.COM upper-case, `mx.google.com 1` version token, 200 KB header, upper-case From and header names, display name containing another address.
   - Forged-only (zero genuine) `mx.google.com` header IS accepted (by design; maker limit 2). The Gmail fetch is `users.messages.get format=full` reading `payload.headers` (gws-gmail.ts:fetchOne), i.e. the server-stamped header is present for every message Gmail delivered; only API-imported/unstamped mail could lack it. Residual, low.
   - ONE accepted input outside what Gmail can emit, see Observation A.
2. Fallback (no dmarc result): compares dkim `header.d` OR `header.i` domain == From domain exactly, or spf `smtp.mailfrom` domain == From domain exactly. SPF: the compared property is the envelope domain, but equality with the From domain makes it DMARC-style strict SPF alignment; an attacker needs an SPF-authorised sender for the victim domain, so no spoof from a domain they do not control. Spoofs tried: spf=pass smtp.mailfrom=x@evil.com with From ashoka.edu.in -> refused; dkim header.i/d=evil.com -> refused; envelope-other-domain -> refused. Matches gate option (a) ("require Gmail Authentication-Results", exact alignment).
3. Routes, end-to-end (probe2.mts: fake `gws` runner -> scanGmailForMeetingCandidates -> createMeetingCandidatesDeps with a trusted_senders stub that always says autoApprove -> selectAutoRecordItems):
   | message | scan verdict | stored status | selectAutoRecordItems (everyWebinar off) |
   |---|---|---|---|
   | genuine pass (dkim+spf+dmarc) | auth=true | auto_approved | scheduled |
   | dkim=fail / dmarc=fail | false | pending | untrusted-sender |
   | no Authentication-Results | false | pending | untrusted-sender |
   | forged pass + genuine fail (2 headers) | false | pending | untrusted-sender |
   | genuine pass for evil.com, From ashoka | false | pending | untrusted-sender |
   | From `x@ashoka.edu.in@evil.com` | candidate dropped | none | none |
   Route 1 (allowlist, `senderVerified && isTrustedSender`), route 2 (`preTrusted` needs `senderAuthenticated === true` for auto_approved), route 3 (store.ts: getTrustedSender only if verdict) all enforced. Other derivations found by `rg` (isTrustedSender, auto_approved, preTrusted, getTrustedSender, senderDomain, extractEmail, autoApprove): apps/api routes only expose approve/reject (human), db `decide()` sets approved only; calendar-attendance-policy.mjs uses Gmail snapshots only for rejected/cancelled/registration barriers (no trust); the reconciliation snapshot now carries the boolean; fixtures.ts is test-only. Calendar organizers are `senderVerified: true` (Calendar API, not a From header; out of scope per manifest). Only exception: everyWebinar, point 4.
4. everyWebinar. `buildRealScheduleTickDeps` (schedule-tick.ts:199-202) and scripts/webinar/run-pipeline.mjs:126 both run `everyWebinar: true`; the HTTP loader then passes EVERY candidate status (schedule-tick.ts:96), and auto-join.ts:190 skips the trust check when everyWebinar is set. Probe3: a `pending`, unauthenticated `attacker@evil.com` candidate titled "Webinar: T" with a zoom URL -> `toSchedule` length 1 (rejected -> 0). So in the production configuration an unauthenticated email can lead to a recording/join with no human. RULING: separate finding, not this unit's scope (the gate and ISS-322/333 fix the three trust routes; everyWebinar is a deliberate "record every webinar" mode from commit 9f46fae/D-058 whose title/URL/registration filters are unchanged here, and the unit did not claim to touch it). Filed as ISS-376 (high) for an Approver product decision. Practical consequence stated plainly: until ISS-376 is resolved the fix protects only non-everyWebinar runs and the stored/UI trust state.
5. Legacy rows: `auto_approved` without a verdict -> `untrusted-sender` (refused); `approved` without a verdict -> scheduled; `pending` without a verdict from a default-trusted domain -> `untrusted-sender`. Confirmed (probe2).
6. Parser parity: ran the core strict parse and meeting-bot `parseStrictEmail` over 31 hostile From strings. Core's accepted output re-parses identically in meeting-bot in 31/31 (0 divergences). Core is intentionally more lenient on RAW From headers (display names, angle brackets, which meeting-bot rejects when given the raw header); both routes consume core's single normalised `senderEmail`/`senderDomain` (stored once), so no route parses a different sender. Both reject: multi-@, trailing dot, address list, `a@b..com`, `a@-b.com`, IP-literal, underscore, non-ASCII, single-label domains.
7. D-015, recorded reproductions re-run by me (probe3 plus the maker's printed tests):
   - ISS-333: 5/5 as recorded. (a) dkim=fail -> pending, (b) header absent -> pending, (c) aligned pass -> auto_approved (probe2 rows m_dkimfail, m_nohdr, m_pass; api test 3/3); (d) unauthenticated auto_approved -> toSchedule 0; (e) human approved no verdict -> toSchedule 1 (probe3). Refusals 3/3, positives 2/2.
   - ISS-322: 4/4 refused, 4/4 authenticated still accepted (karunn@vidysea.com, umeshsugara@vidysea.com, theoutreachcollective.in, ashoka.edu.in; each with verdict false AND absent). The ledger row records no numbered reproductions, only "all 4 default entries" in its title and evidence plus fix_direction (a)/(b); enumerating the four defaults (auto-record-policy.ts:67-68) is the faithful reading, not a substitution. Fix_direction (b) (SENT label) is an alternative design, not a recorded attack.
   - ISS-CAPTURE-003: 1/1 (`x@ashoka.edu.in@evil.com` -> assessSender undefined, candidate dropped).
   - ISS-CAPTURE-001 (still must hold): 2/2 ledger-quoted calls refused (`isTrustedSender('evil@x.com@ashoka.edu.in', undefined)`, `('evil@x.com','ashoka.edu.in')`), and the maker/trusted-sender test prints 3/3 refused.
8. Mutations (each: byte backup taken per mutation, restore in `finally` plus SIGINT handler, 150 s timeout per test command, then `git hash-object` == `git rev-parse HEAD:` check; driver in scratchpad mut.mjs):
   | # | Mutation | Result |
   |---|---|---|
   | M1 | `ours.length === 1` -> `>= 1` (accept two mx.google.com headers) | KILLED |
   | M2 | drop `header.from === domain` comparison | KILLED |
   | M3 | authserv-id `=== authservId` -> `.includes("google.com")` | KILLED |
   | M4 | auto-join preTrusted: drop `senderAuthenticated === true` | KILLED |
   | M5 | store.ts: `senderAuthenticated === true ?` -> `true ?` | KILLED |
   | M6 | allowlist: drop `item.senderVerified &&` | KILLED |
   6/6 killed, 0 survived. (First batch of 6 had M3 pattern miss, re-run as M3 above; all other restores verified.)
   HEAD fidelity after all mutations (hash-object == HEAD blob): sender-authentication.ts 51a0cd323e5fec4064bfccc14e87f8c694b9d2d4; store.ts d0f92105829df03935ed4d3427fbefabacbd08e1; auto-join.ts 44529befd2bc9c149a2bce04720566c907c5011d. `git diff HEAD` on source: empty.
9. Scope/test weakening: `git show 111d587` test diffs: auto-join.test.ts and schedule-tick.test.ts each change one line, adding `senderAuthenticated: true` to an existing auto_approved fixture; no assertion changed or removed. The three plumbing files (webinar-types.ts, schedule-tick.ts, calendar-client.ts) are needed to carry the verdict (calendar-client's `shape()` allow-list rejects unknown keys); the one new file is the authorised core file. Deviation (`isTrustedSender` unchanged, verdict applied at its call site) is acceptable: it enforces the same property with a smaller blast radius, confirmed by M6.

## ISSUES-WRITTEN
ISS-376 (high, outside this unit's scope; does not fail it): production `everyWebinar: true` mode schedules unauthenticated pending candidates with no sender trust check at all. Reproductions recorded verbatim in the row.

## EXPLANATION
- Observation A (low, not filed): the DKIM fallback accepts `header.d` OR `header.i` independently, so `mx.google.com; dkim=pass header.d=evil.com header.i=@ashoka.edu.in` (no dmarc result) is accepted. A compliant verifier cannot emit it (RFC 6376 6.1.1: i= must be within d= or the signature is invalid), and it only matters for From domains with no DMARC record. Hardening suggestion: if both are present, require both to equal the From domain. Not an exploitable spoof given Gmail's verifier, so it does not block PASS.
- Observation B (low): live Gmail was not available; the header grammar was exercised with Gmail-shaped samples. A shape the parser rejects (e.g. a `reason="..."` quoted string, which makes the whole header unparseable) fails closed (sender stays pending), never open. A live fixture should be added when available.
- Observation C (low): forged-only mx.google.com header on a mail Gmail did not stamp (API import) would be accepted; documented by the maker.
- Observation D (low): a human approving an unauthenticated candidate still increments that domain's approval count (store.ts approve path, unchanged), and the UI does not show the verdict. Trust earned that way remains gated on authentication at scan time.
- Not run (CPU / no tooling): depcruise, full suites, live Gmail. `git status` shows an untracked `.claude/worktrees/` directory created by other agents' worktrees, not by this check.
