# t039-send-now-web-button

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (next unblocked roadmap task, T-039, web half). Lane: lane/sendnowweb (base 9e24d1f). Class: operator action that launches a bot (data write via API): FULL ceremony. Ledger shard `qa/issues.sendnowweb.jsonl` (ISS-SENDNOWWEB-001).
Depends on: `POST /calendar/send-now` (t039-send-now-api-endpoint, merged 2504e81). apps/web only.

## Scope: the web half of T-039. T-039 is NOT complete
Still open: the 60 s live-join measurement, shared duplicate state / status endpoint, ISS-T039CMD-001/-002, ISS-SENDNOWAPI-002/-003/-004.

## Changes
- `apps/web/src/api/send-now.ts` (new): `sendBotNow(apiKey, meetingUrl, until)` = shared `apiFetch` POST `/calendar/send-now`, body exactly `{meetingUrl, until}`.
- `apps/web/src/pages/meeting-bot/SendNowForm.tsx` (new): "Send bot now" card (URL + "Record until" inputs). Advisory `untilHint` (HH:MM local 24 h; ISO needs offset; past; > 24 h) that never blocks submit; only empty fields / no key disable it. The server stays the authority.
- `apps/web/src/pages/MeetingBotPage.tsx` (+2 lines): imports and renders the form above the Upcoming section. No route, nav or client.ts change.
- Tests: `apps/web/src/pages/meeting-bot/SendNowForm.test.tsx` (20).

## Behaviour per status
202 `{jobId,status:"launching"}` -> "Launching (job id X). The launcher has started; the bot has not joined yet." (a 202 lacking a job id or status launching is an error, not success). 400 -> server message shown + "No bot was sent". 403 -> "Your key lacks the send-now scope", inputs and button disabled for the session of the page, NOT signed out (apiFetch only invalidates on 401), rest of the page unaffected. 409 -> "Already recording". 502 -> launcher failed, retry allowed. 503 -> unavailable. Network -> "Could not reach the API". 401 -> apiFetch's existing sign-out path plus a message. Double submit: ref guard + disabled button, one request. Meeting URL and key never rendered back.

## Evidence (apps/web, node off PATH)
```
node node_modules/vitest/vitest.mjs run src/pages/meeting-bot src/pages/MeetingBotPage.test.tsx src/App.routes.test.tsx
 Test Files  5 passed (5)   Tests  55 passed (55)     (SendNowForm.test.tsx: 20)
node <main>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json -> exit 0
```
Tests cover: 202 body/headers exact; double click/submit -> 1 fetch; 400 reason; 403 disable + no auth-invalidated event + rest of page renders; 409/502/503; network failure; 202 without jobId; no key; empty fields; key and URL query secret absent from DOM; untilHint table.

## NOT covered
No real API, browser, Vite or Playwright (jsdom only). The 403-disable is learned from the first submit (no scope probe endpoint exists), and resets on page reload. No mutation run. Full web suite not run. Nav/Calendar page not touched (form lives on /meeting-bot).
