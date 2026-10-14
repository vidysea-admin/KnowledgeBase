# t036next

Status: checked-PASS
Fix cycle: 0
Priority tier: 3 - next unblocked roadmap task (T-036 remaining code slice)
Security class: none - new pure function, no caller wired, flag OFF by default (YouTube link never reaches `meetingUrl`/auto-join)
Lane: lane/t036next (no ledger shard; no issues filed)
Contract: qa/contracts/gmail-meeting-candidates-approval.md (no new criteria claimed)

## NOT DONE / UNVERIFIED (read first)
- Live mailbox + Calendar proof NOT done (needs Umesh + real credentials; no Gmail/Calendar API call made, no credential file read).
- `resolveYoutubeLive` is NOT wired into gws-calendar.ts or the Gmail scanner: nothing calls it yet. Flag = `opts.enabled === true` argument, default off. Wiring + an env flag is the next unit.
- Real Calendar description shapes for YouTube invites unverified (synthetic fixtures only).
- Gmail scanner substring regexes (host-in-path trick, noted in t036-calendar-description-link-scan) untouched.
- Full apps/api suite has 1 failure outside this change: activity-health/router.test.ts "actual producer -> Python ..." (`null !== 0`, spawned Python exits null; Python is not on PATH here - environment gap, file untouched).

## What changed
- NEW apps/api/src/join-rules/youtube-live-extract.ts (+ .test.ts): `resolveYoutubeLive(ev, {enabled})` -> `{watch:{url,videoId,source}}` | `{issue:"ambiguous"}` | `{}`. Shapes /live/<id>, /watch?v=<id>, youtu.be/<id>; exact hosts; https only; no userinfo/port; embedded-redirect keys refused; id case preserved; canonical URL drops tracking params; dedupe by video id; location before description.
- apps/api/src/join-rules/calendar-link-extract.ts: one added exported pure helper `candidateUrls(field)` (reuses splitHtml/bareUrls/decodeEntities, same bounds). `scan`/`resolveEventMeetingLink` unchanged.

## Evidence (cwd apps/api, node v24.21.0 from codex runtime)
- `node --test --import tsx src/join-rules/youtube-live-extract.test.ts` -> pass 7 fail 0, 5/5 repeat runs.
- `node --test --import tsx src/join-rules/*.test.ts src/routes/calendar.test.ts src/gws/*.test.ts` -> tests 161, pass 161, fail 0 (existing calendar-link-extract tests incl. "youtube live has no recogniser" still pass).
- Full `node --test --import tsx "src/**/*.test.ts"` -> tests 811, pass 810, fail 1 (environment, above).
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output.
- `node scripts/lint-loc.mjs` -> OK (887 files); `node scripts/lint-dirsize.mjs` -> OK (153 dirs). `lint-loc.mjs --all` run too (exit 0).

## Handshake
Status: checked-PASS, Fix cycle 0.
