# t039-send-bot-now-planner

Status: ready-for-check
Fix cycle: 1
Priority tier: 3 - next unblocked roadmap task (T-039)
Security class: untrusted operator-supplied URL that will drive a browser/bot join - FULL checker ceremony
Lane: lane/t039 (issue ledger shard qa/issues.t039.jsonl, none filed yet)
Round cap: 0 PASSed verdicts in qa/verdicts/ name a send-now / join-now seam; cap not reached.

## Scope

Adds ONLY a pure planner for T-039 "Send bot now". **This unit does NOT complete T-039.** No CLI, API route, web wiring or scheduler change; nothing calls the planner. Nothing existing was edited (no index export added). calendar/, capture/ untouched.

T-039 exit criterion, quoted from docs/meeting-bot-roadmap.md:62:
`| T-039 | **"Send bot now"**: CLI/API/web button to add the bot to a live meeting | bot joins a running meeting within 60 s |`

## Files added

- `packages/meeting-bot/src/send-now.ts` (planner)
- `packages/meeting-bot/src/send-now.test.ts`
- `qa/manifests/t039-send-bot-now-planner.md` (this file)

packages/meeting-bot/src has 12 files; budget 30 (lint-dirsize OK), so files sit at the src root next to platform.ts/strategy.ts.

## API

`planSendNow(url: string, now: Date | string, liveJobs: readonly SendNowJob[] = []) -> SendNowPlan`
`SendNowPlan = {ok:true, request} | {ok:false, reason, detail?}`; also exports `meetingIdentity(url)`, `LIVE_JOB_STATUSES`, `MAX_SEND_NOW_URL_LENGTH` (2048).

Request shape (`SendNowJoinRequest`): `{source:"manual", meetingUrl, platform, strategy, startTime, meetingKey}`. It carries the `AutoRecordItem` fields the existing join path uses (`meetingUrl`, `startTime`; `endTime`/`sessionKey`/`title` are unknown for an ad-hoc join and left to the caller) plus `strategy` from the existing `selectJoinStrategy`. `capture(url, ...)` / `Joiner.join(url, ...)` take the `meetingUrl` string.

Refusal reasons: invalid-input, invalid-clock, empty-url, url-too-long, malformed-url, not-https, credentials-in-url, unexpected-port, embedded-redirect, unsupported-host, duplicate-live-job. Ordinary bad input never throws.

Checks in order: type, trim/empty, length, whitespace/control/backslash, clock, `new URL` parse, https scheme, userinfo (also raw `@` in authority), port (default :443 allowed), embedded redirect (query key like redirect/next/url/return/..., or any query value that decodes, up to 3 times, to a scheme/`//`/backslash start), then `detectPlatform` (unknown -> unsupported-host, covers `zoom.us.evil.tld`, `evilzoom.us`, trailing-dot host), then duplicate check.

## Meeting identity

`meetingIdentity`: host-case/trailing-slash/fragment/duplicate-slash/percent-encoding insensitive. Meet -> `meet:<code lowercased>` (query ignored). Zoom -> `zoom:<numeric id>` for /j/, /w/, /s/, /wc/join/ID, /wc/ID/join (regional subdomain and `pwd` irrelevant). Others -> `platform:host+path+sorted query` minus tracking keys (utm_*, fbclid, gclid, mc_*, _ga, tk, token, access_token, pwd, password, authuser, pli, hl); path case preserved for Teams/Webex, lowercased otherwise. Live = job status queued|joining|recording; processing/ready/failed/ended/action_required/unknown do not block.

## Evidence

Node: `C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` (lane junctions for node_modules and packages/meeting-bot/node_modules created to the main tree).

```
$ cd packages/meeting-bot && timeout 120 node --test --import tsx src/send-now.test.ts
ℹ tests 18   ℹ pass 18   ℹ fail 0
$ timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json
tsc-exit=0
$ node scripts/lint-dirsize.mjs
lint-dirsize: OK (109 dir(s) within budget)
```

Test coverage: 9 platform shapes (meet, teams x2, zoom x2, webex, zoho x2, cloudonair); hostile list (javascript:, data:, file:, http:, ftp:, look-alike hosts, userinfo variants, ports, five redirect forms, backslash/space/CRLF, empty, over-length, non-string, bad clock); duplicates across case/slash/tracking/fragment/regional-zoom/alternate-zoom-path/Teams; non-duplicates; ended meeting joinable; empty/malformed liveJobs; purity.

## Not delivered

- The 60-second clause needs a live meeting and is NOT claimed or measured.
- No entry point (CLI/API/web) calls the planner; T-039 stays open.
- Planner does not read real job state: callers must map scheduler operations to `SendNowJob`.
- Not run: full suite, monorepo build, browsers (shared CPU).
- Identity for Teams/Webex/Zoho is path+query based, so two different URL spellings of one meeting beyond the listed normalisations are not detected as duplicates.

## Fix cycle 1

Handshake: `Status: ready-for-check`, `Fix cycle: 1` (top of file). Responds to `qa/verdicts/t039-send-bot-now-planner.md` (FAIL, cycle 0): ISS-T039-001 and ISS-T039-002 (both medium) plus two low notes (fail-open status, raw URL in request).

**Root cause.** Identity was pattern-guessed: Meet took the first path segment, every other platform keyed on host+path+sorted query. So Meet `lookup/<id>` collapsed to `meet:lookup`, non-meeting pages got plans, and Teams passcode (`p`) / `context` JSON order produced different keys for one meeting.

**Fix** (`packages/meeting-bot/src/send-now.ts`, now 173 lines; test 254; platform.ts untouched). `meetingIdentity` extracts each platform's own meeting identifier and keys on it alone; a recognised host with no parseable identifier returns undefined and `planSendNow` refuses `not-a-meeting-url` (new typed reason; no path+query fallback). Identifiers are lower-cased (a false "same" refuses, a false "different" admits a second bot). Status: only the exact terminal values `processing|ready|failed|action_required` stop blocking; any other, missing or differently cased status counts LIVE. schedule-state.ts exports no status constant (inline literal at line 63, file outside this unit), so a drift-guard test reads that literal and asserts it equals live-known + terminal. Request now carries `u.href`: the consumers (`capture(url)`, `Joiner.join(url)`, AutoRecordItem.meetingUrl) take a URL string and re-parse it with `new URL`, so the normalised form is the same destination that was validated.

| Platform | Identifier (key) | Never affects key |
|---|---|---|
| Meet | `xxx-yyyy-zzz` code -> `meet:<code>`; `/lookup/<id>` -> `meet:lookup:<id>` | authuser, hl, fragment, case, slash |
| Zoom | numeric id for /j /w /s /wc/join/ID /wc/ID/join; `/my/<name>` -> `zoom:my:<name>` | pwd, utm, regional subdomain, zoom.us vs zoom.com |
| Teams | `/meet/<digits>` -> `teams:meet:<id>`; `/l/meetup-join/<19:...@thread.x>/...` -> decoded thread id | p, context (JSON, any order, or absent), host (live/microsoft) |
| Webex | `/meet|join/<room>` -> room+host; `MTID`; `MK`; `/meeting/info|download/<id>` | pwd, utm, case |
| Zoho | `key=` or `sessionId=` query | other params, case of name |
| cloudonair | event path (root refused) | query, case |

Context is not needed to distinguish Teams meetings (thread id is unique), so it is ignored entirely. Not keyed, therefore refused: Webex `/<site>/onstage/` and other unlisted Webex shapes, Zoho path-style join links, Teams short links (`teams.microsoft.com/l/...` other than meetup-join), Zoom vanity/`/wc/<name>` forms, Meet codes not 3-4-3 letters, any marketing path. If a real user link uses such a form the planner refuses it rather than risk a second bot. Zoho and Webex shapes are limited to those documented/observed in tests; unverified against live links.

### Evidence
```
$ node scripts/lint-dirsize.mjs   (before and after)
lint-dirsize: OK (109 dir(s) within budget)
$ cd packages/meeting-bot && timeout 120 node --test --import tsx src/send-now.test.ts src/platform.test.ts src/strategy.test.ts
ℹ tests 39   ℹ pass 39   ℹ fail 0
$ timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json
tsc-exit=0
```
(31 tests at cycle 0 -> 39; cycle-0 tests all still pass: look-alike hosts, credentials, ports, embedded redirects, dedupe variants.)

D-015 counts, replayed verbatim from `qa/issues.t039.jsonl` in test "regression ISS-T039-001/002":
- ISS-T039-001: 8/8 (lookup/abcdeg vs live lookup/abcdef admitted; distinct keys; /new, /, /landing, zoom.us/, zoom.us/foo refused `not-a-meeting-url`; same lookup id still deduped). Left open: none.
- ISS-T039-002: 7/7 (Teams /meet with and without `p`, both directions; meetup-join with context A/B/none in all pairings; other host). Left open: none. Webex/Zoho items in the issue's fix_direction are covered by the per-platform SAME/DIFF tables, not recorded reproductions.

Not run: full suite, monorepo build, browsers, network. Low notes still open: far-past/future `now` accepted; redirect detection is key-name based.
