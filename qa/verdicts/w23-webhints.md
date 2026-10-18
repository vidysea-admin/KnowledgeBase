# Verdict: w23-webhints

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 4645e325207510eda04df83f5668560ecd57a3f5
Base: 3c99337f. Web fix commit 0104801a, api fix commit 4645e325 (on top of cycle-0 candidate 2d0deaee). Checker: Sonnet 5.5, independent. Metrics: host tokens/active time not measured (unknown, not claimed).

## Cycle 1 review (diff 2d0deaee..4645e325, evidence qa/.chk/c1/)
Cycle-0 findings:
1. FIXED. joinRulesModel.ts checkMeetingUrl now `v.length <= 2048 && safePublicResourceUrl(v) !== null`. Probe (probe-url.out): `https://user:pw@...` refused, tab-bearing URL refused, `javascript:` refused, plain https accepted.
2. FIXED. router.ts `isPlainHttpUrl` used by POST /opt-outs (`optOutBody(req, true)`). Probe by extracting the function text from router.ts (probe-api.out), 18 cases, 0 mismatches: refused `https://user:pw@`, `http://user@`, `https://:pw@`, `javascript:` (also mixed case), `data:`, `ftp:`, `zoom:111`, `not a url`, control chars  / TAB / LF /  / , leading space, `//host`; accepted https and http with query/fragment. Router test loop covers 11 of these.
3. Note (cycle 0) now resolved for forms: apiFetch accepts HeadersInit. Probe (scratch test, deleted, git clean): plain object with AUTHORIZATION/authorization/AuThOrIzAtIoN and Content-TYPE; Headers object; tuple array with three case variants; undefined/[]/empty Headers. In all, the sent request has authorization "Bearer real" and content-type "application/json" only, no e1/e2/e3/x/y text anywhere, If-Match preserved. Note: Headers.entries() lowercases keys; plain/tuple keep caller casing for non-protected names; only the two protected names are removed, in any case, so no case variant can survive.
4. /opt-outs/remove left lenient: SAFE. Route uses requireScope(WRITE_SCOPE), tenantId from auth (guarded), body allow-list and 2048/256 bounds unchanged; recordTenantUnOptOut loads only that tenant's file and removeOptOutEntries is a pure removal from that state, writing nothing when nothing matches. The hint is a match key, never stored or echoed on remove. Leniency is needed for legacy identities such as zoom:111. Note (low, not blocking): no test pins the remove route staying lenient.

Checks (own runs, exit codes in qa/.chk/c1/*.rc, all timeout 600): web vitest src/pages/join-rules src/api exit 0, 17 files, 203 passed. api node --test router.test.ts busy-status.test.ts exit 0, 34 pass 0 fail. tsc --noEmit web exit 0, api exit 0 (empty output).
Mutations (own; per-mutation byte backup, trap, timeout 300, cmp restore; qa/.chk/c1/mut2.sh): L header strip case-sensitive killed (3 tests); M tuple branch unfiltered killed; N Headers branch dropped killed; O credentials allowed in api killed; P strict flag off on POST /opt-outs killed; Q any scheme in api killed; S control-char/whitespace check removed killed; T web check replaced by /^https?:/ killed (cases 4,5,6...). Post-run `git -c core.autocrlf=true hash-object` equals `git rev-parse HEAD:<f>` for client.ts, joinRulesModel.ts, router.ts. Cycle-0 mutations A-K stand (all but F killed; F parseRetryAfter {1,6}->{1,12} remains open, low, benign).

## Ledger rows (cycle 1)
- ISS-RULESWEB-002: may flip.
- ISS-JRLOCK-002: may flip.
- ISS-WEBHINTS-002: may flip (regex-width mutation stays filed-open low).
- ISS-WEBHINTS-001: meetingUrl half verified. sessionKey still has no web source (W7 gate b / ISS-T037OPT-002 remain open), so do NOT flip the row to verified as written; flip only if the row is narrowed to the sessionKey remainder.
ISSUES-WRITTEN: none
Raw evidence in untracked qa/.chk/ (not committed).

# Superseded history

## Cycle 0 (2d0deaee): FAIL, superseded by cycle 1 above
Verdict (cycle 0): FAIL
Cycle 0 (superseded) checked: 0
Cycle 0 (superseded) reviewed SHA: 2d0deaee271821acb3342b67c24783fafc47343d
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
