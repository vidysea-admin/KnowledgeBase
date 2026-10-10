# t039-send-bot-now-planner

Status: ready-for-check
Fix cycle: 0
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
