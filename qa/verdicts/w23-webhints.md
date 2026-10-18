# Verdict: w23-webhints

VERDICT: FAIL
Cycle checked: 0
Reviewed SHA: 2d0deaee271821acb3342b67c24783fafc47343d
Base: 3c99337f (web commit 8c46caae). Checker: Sonnet 5.5, independent. Metrics: tokens/active time not measured by host (unknown, not claimed).

## Findings
1. (blocking, WEBHINTS-001) apps/web/src/pages/join-rules/joinRulesModel.ts checkMeetingUrl (line ~145) does not reuse apps/web/src/safe-url.ts and does not refuse credential URLs. Probe (qa/.chk/probe-url.out): `https://user:pw@meet.example.com/a` -> accepted and sent as meetingUrl; `https://meet.example.com/a<TAB>b` (control char) -> accepted. javascript:/ftp:/not-a-url are refused (mutation I kills). Fix: `const safe = safePublicResourceUrl(v); return safe ? { url: v } : { error }` (keeps the 2048 bound), plus tests for user:pw@ and a control char.
2. (finding, server) apps/api/src/join-rules/router.ts optOutBody (lines 117-129) validates meetingUrl only as string <= 2048; no scheme or credential check. `javascript:alert(1)` and `https://u:p@h/` are stored. Client-only validation is therefore the sole guard. Fix: reject non-http(s) and credential-bearing meetingUrl with 400 in optOutBody, with a router.test case.
3. (note, not blocking) ISS-WEBHINTS-001 sessionKey still has no web source (maker left it open); the row is only half-satisfied even after finding 1.
4. (note) callerHeaders handles plain objects only (type is Record<string,string>). Probed: Headers object -> dropped entirely (If-Match too); array of tuples -> entries become headers "0".."3" with stringified values; none is an authorization/content-type header, real Bearer key and application/json always win. Same behaviour as before the change for these forms, tsc forbids them. No credential header survives or merges.

## Checks (own runs, exit codes in qa/.chk/*.rc, outputs qa/.chk/*.out)
- web vitest src/pages/join-rules src/api: exit 0, 17 files, 197 passed.
- api node --test router.test.ts busy-status.test.ts: exit 0, 34 pass, 0 fail.
- tsc --noEmit web: exit 0; api: exit 0.
- Header probe (scratch test, deleted; git clean): plain mixed-case objects pass, Headers and tuples as in note 4.
- lint-loc not run (not requested).

## D-015 replay (own mutations, per-mutation byte backup + trap + timeout 300, cmp restore; script qa/.chk/mut.sh)
A header strip case-sensitive (MY mutation): killed (client.test ISS-RULESWEB-002).
B passthrough: killed. C spread after authorization (ISS-RULESWEB-002 M5): killed. => RULESWEB-002 3/3.
D cap removed: killed. E clearTimeout removed: killed. F parseRetryAfter {1,6}->{1,12}: SURVIVED (121 pass). => WEBHINTS-002 2/3.
G load catch without busy (JRLOCK c): killed (4 tests). H readText without busy (JRLOCK d): killed ("ISS-JRLOCK-002 (c)/(d)"). J api message literal changed (a): killed. K Retry-After 50 (b): killed. => JRLOCK-002 4/4 (maker's "argued" (d) is in fact killed).
I scheme check removed: killed (cases 1,2).
Post-run HEAD fidelity, `git -c core.autocrlf=true hash-object` == `git rev-parse HEAD:<f>` for client.ts, JoinRulesPage.tsx, joinRulesModel.ts, router.ts: all OK.
Judgement: F (parseRetryAfter width) does not block: effect is a >6-digit Retry-After yields no wait instead of the 60 s cap, benign; stays filed-open low (a one-line test of "1234567" would kill it). JRLOCK (d) does not block (killed).

## Ledger rows
- ISS-RULESWEB-002: may flip to fixed/verified.
- ISS-JRLOCK-002: may flip (a-d all pinned).
- ISS-WEBHINTS-002: may flip; note regex-width mutation left open (low).
- ISS-WEBHINTS-001: must NOT flip (finding 1, sessionKey source open).
Merge of the candidate waits for cycle 1 fixing findings 1 and 2.

ISSUES-WRITTEN: none (finding 2 is for the maker to fix or file).
Untracked qa/.chk/ holds raw evidence and is deliberately not committed.
