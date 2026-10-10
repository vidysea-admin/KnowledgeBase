# Manifest — r1-attention-alerts

**Lane:** R1ALERTS (branch lane/r1alerts, base 7f352eb). **Fix cycle:** 0
**Backlog tier:** 3 (roadmap, R1 "actual alert" for human-action cases). **Issues addressed:** none (new feature).
**Round cap:** 0 prior PASSes name a scheduler-outcome alert-formatting seam (the watch alert seam u4a/u4b/u4c is a different seam and untouched).

## Step one: what already existed
- `scripts/webinar/run-pipeline-deps.mjs` `notifyOperation` (off limits, not touched) sends a generic line: `Webinar <id>: <status> (<reason>). Check the operations view for details.` Fingerprint dedupe (`status:reason`) lives in `createOperationNotifications` (`capture/telegram-channel.ts`).
- No formatter exists that names the event, renders start time in an explicit zone, says what the human should do, or redacts/neutralises titles. `packages/core/src/alerts/alert-sink.ts` and `capture/telegram-alerts.ts` are watch-silence/poll/upcoming alerts only. Conclusion: not already built.
- Sink transport (`defaultTelegramAlertSend`, `defaultTelegramSend`) POSTs `{chat_id, text}` with NO parse_mode: plain text.

## Case table
| Case | Detected by | Fields used |
|---|---|---|
| needs-registration | `SkippedItem.reason` or job row `status=action_required, reason=needs-registration` | sessionKey, title |
| overlap-lost | skipped reason `overlap-lost`, or job reason | sessionKey, title (`detail` NOT used: names another session key) |
| action-required (other) | job row `status=action_required` with any other reason (reason shown only if in a fixed allowlist, else "unspecified") | job id, title, reason |
| untrusted-sender | skipped reason `untrusted-sender` | sessionKey, title. Sender domain NOT supportable: `SkippedItem` carries no sender |
| join-link | skipped `no-join-link` or `unsafe-join-link` | sessionKey, title |
Start time: `SkippedItem` has no start time, so the caller passes optional `startTimes` by sessionKey; job rows may carry `startTime`; otherwise "start time unknown". Not supported: needs-review/past/cancelled/duplicate/not-webinar/invalid-time (no human action in scope; counted in `ignored`).

## Alert shape
`{key, case, severity (high|medium), title, body, sessionKey, startTime?, source}`; key = `attn:<case>:<sessionKey>` (+`:<reason>` for generic action-required). Skip and job views of the same situation share a key. No timestamps, no URLs in keys. `selectNewAlerts(alerts, seen, maxKeys=500)` returns `{fresh, keys}`, oldest dropped. Order: start time (unknown last), then key.

## Redaction and escaping
No meeting link is ever included (stronger than `redactJoinLink`, which only masks tk/token/access_token/pwd). Titles: URLs (`scheme://`, `javascript:`, `data:`, `www.`) -> `[link]`; `pwd/passcode/token=...` -> `[secret]`; emails -> `[email]`; control chars, bidi overrides, line separators removed; `* _ \` ~ [ ] < > | \ { } #` stripped; whitespace collapsed to one line; 80 chars max with ellipsis. Time zone is a parameter (invalid zone falls back to UTC).

## Evidence
Commands (from packages/meeting-bot, node on PATH per toolchain note):
- `timeout 120 node --test --import tsx src/calendar/attention-alerts.test.ts` -> `tests 10 / pass 10 / fail 0`
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (111 dir(s) within budget)`
- `node scripts/lint-loc.mjs` -> 3 pre-existing violations (speakers-llm.ts, sb_join.py, run-watch.mjs); none in this unit. attention-alerts.ts 166 / .test.ts 128 non-blank lines.

## Not delivered
Nothing sends these alerts yet. Wiring into the scheduler tick and the notifier is a later unit (the tick file is at its line budget). No real Telegram delivery, so R1's "actual alert" is NOT met by this unit.

Status: ready-for-check
Fix cycle: 0
