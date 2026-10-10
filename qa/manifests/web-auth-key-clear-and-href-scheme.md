# Manifest: web-auth-key-clear-and-href-scheme

Lane: webauth (branch lane/webauth, from 0fda0a8). Class: SECURITY (auth). Tier: follow-up to iss-260 review (ISS-ISS260-001 medium auth; ISS-WEBAUTH-001 medium, filed here).

## Commits
- fd72e0d Fix 1: compare-and-clear on late 401, guarded storage (ISS-ISS260-001)
- 4e491eb Fix 2: shared safeHttpUrl, applied to AgendaView and EventDetail; AskPage reuses it (ISS-WEBAUTH-001; ledger row in qa/issues.webauth.jsonl)

## Fix 1 design (apps/web/src/auth/AuthContext.tsx)
- Handler keeps the existing relevance test (event key equals tab state, or stored key, or storage empty), then removes storage only if stored is null or equals the failed key (same guard as client.ts:46), and ALWAYS sets this tab's state to null.
- Newer stored key (stored B, failed A): storage untouched, tab drops to the login prompt and does NOT adopt B. Why: B was typed in another tab; adopting it would send requests with a key this tab's user never entered here, and with no storage listener we cannot know B is still valid. The user re-pastes (or re-uses B) explicitly.
- Storage empty: state cleared, nothing to remove. Storage throwing: new readStoredKey/removeStoredKey helpers and a try/catch in setApiKey; initial state, handler, setApiKey, clearApiKey cannot crash the provider (a failed setItem still keeps the key in memory for the tab).
- clearApiKey (explicit sign-out) still removes storage unconditionally by design; only the 401 handler is compare-and-clear.
- 403 does not clear anything (dd6a3b2 intent preserved; test added).

## Fix 2 design
- New apps/web/src/safe-url.ts `safeHttpUrl`: http/https only via URL parse; ADDITIONALLY rejects control characters and leading/trailing whitespace (stricter than the old AskPage copy; no AskPage test regressed). Protocol-relative, relative, unparseable, non-string -> null.
- AgendaView and EventDetail: anchor only when safe; otherwise the raw text in a span/div (testids agenda-join-text, detail-join-text). AskPage now imports the util.
- API side: NOT changed. gws-calendar.ts only has a length check (`text(meetingUrl, 8192)`); there is no existing URL validator in that package to reuse in one line. Left alone; the web check is the enforcement point. (gws-gmail.ts builds meetingUrl from DIRECT_JOIN_RE, not examined further.)
- Severity of ISS-WEBAUTH-001 set to medium: impact if reachable is API-key theft, but it is unconfirmed that Google Calendar lets an external organizer set a non-http(s) conference URI, and it needs a click.

## API-data-to-URL sinks in apps/web/src (non-test)
1. AskPage.tsx `<a href={url}>` web source url: already guarded; now shared util. OK.
2. AgendaView.tsx `<a href={m.meetingUrl}>`: FIXED.
3. EventDetail.tsx `<a href={event.meetingUrl}>`: FIXED.
4. CalendarPage.tsx:254 meetingUrl in a text node: no sink.
5. `<Link to=...>` in AskPage, NodePanel, DashboardPage, KnowledgeExplorerPage, ConfidenceGraphPage, IngestPage, MeetingBotPage, SearchPage, SessionsListPage, WhatsAppPage, AgendaView, EventDetail(event.href): all internal paths built as literal `/sessions/...` or `/brain?...` prefixes with encodeURIComponent/URLSearchParams on the API value (evidenceHref in graph-model.ts, calendar-model.ts:73). Not scheme-injectable. OK, unchanged.
6. SessionDetailPage.tsx `<a href="#turn-...">`: fragment with a fixed prefix. OK.
7. SessionDetailPage.tsx video src / img src: URL.createObjectURL blobs from our own authenticated fetch. OK.
8. NavSidebar.tsx hrefs: API_BASE_URL (build config) + fixed path; not API data. Not touched (other lane).
9. WatchPage.tsx `href="/calendar"`: literal.
10. window.open / location.* / dangerouslySetInnerHTML / innerHTML: none found (rg across src, excluding tests).

## Evidence (run in C:\Users\product\Desktop\KnowledgeBase-lanes\webauth\apps\web; node from codex runtime on PATH)
- `timeout 170 node node_modules/vitest/vitest.mjs run src/auth src/api/client.test.ts` -> Test Files 3 passed (3), Tests 15 passed (15) (before Fix 2).
- Mutation check, Fix 1: with HEAD's AuthContext.tsx restored, AuthContext.test.tsx -> 3 failed | 4 passed (the recorded reproduction, handler-direct variant, throwing storage). Fixed file restored and verified with cmp.
- Mutation check, Fix 2: with HEAD's AgendaView/EventDetail restored, join-link.test.tsx -> 18 failed | 2 passed (the two https positives). Restored, cmp verified.
- `timeout 170 node node_modules/vitest/vitest.mjs run src/safe-url.test.ts src/pages/calendar src/pages/AskPage.test.tsx src/pages/CalendarPage.test.tsx src/api/client.test.ts src/api/sessions.test.ts src/auth` -> Test Files 9 passed (9), Tests 119 passed (119).
- `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (apps/web) -> no output, clean (exit code not captured separately).
- `node scripts/lint-dirsize.mjs` -> lint-dirsize: OK (109 dir(s) within budget). File sizes: AuthContext.tsx 87, AuthContext.test.tsx 116, safe-url.ts 17, join-link.test.tsx 57.
- Not run: LoginGate was run (in src/auth); no separate EventDetail/AgendaView test files existed beyond CalendarPage.test.tsx (which exercises them and passed).

## D-015 counts (ledger reproductions replayed verbatim)
- ISS-ISS260-001: 1/1 recorded reproduction (A in tab 1, B stored by tab 2, 401 for A through real apiFetch; expects storage still 'B') now passes; before the fix it failed. Plus handler-direct variant.
- ISS-WEBAUTH-001: 9/9 recorded hostile forms (javascript:, ' javascript:', '\tjavascript:', 'JaVaScRiPt:', 'java\nscript:', data:, vbscript:, '//evil.example/x', 'not a url') render as text with no anchor, in EventDetail 9/9 and AgendaView 9/9; util test 19/19 rejections + non-strings. No reproduction left open. (Authored by this lane, as this issue was filed in this unit.)

## NOT DONE (D-024)
Live browser check of apps/web UI cannot run on this machine now (CPU shared with the production worker; no browser). It must look at: (a) two real tabs: key A in tab 1, key B pasted in tab 2, force a 401 for A in tab 1 (revoked key), confirm tab 1 shows the login prompt and tab 2 / a reload of tab 2 still holds B; (b) a calendar event whose meeting URL is `javascript:alert(1)` shows plain text with no clickable Join link, in both the Agenda list and the event detail panel, and a normal https Meet link still opens in a new tab; (c) private-browsing window loads and the login gate works with storage blocked.

## Fix cycle 1 (ISS-WEBAUTH-002, verdict FAIL at cycle 0)
**What failed.** The 401 handler's relevance test `detail.apiKey !== apiKey && detail.apiKey !== storageKey && storageKey !== null` fell through whenever storage was empty, so a late 401 for old key A logged out a tab holding newer key B when (a) setItem threw (B only in memory) or (b) another tab cleared storage.
**Root cause.** One condition mixed two decisions and let storage contents decide whether THIS TAB drops ITS key; it also read `apiKey` from a render closure.
**Design (apps/web/src/auth/AuthContext.tsx).** Both decisions use only `detail.apiKey`, the key the request was sent with (captured per request in apiFetch, passed to invalidateAuth):
1. Drop the tab's in-memory key only if `keyRef.current === failed`. Storage plays no part.
2. Remove the stored key only if `readStoredKey() === failed` (compare-and-clear). Empty storage needs no removal.
An event whose detail is missing, or whose apiKey is not a non-empty string, is IGNORED (relevance cannot be established). The tab never adopts a stored key.
**Current-key visibility.** `keyRef` (useRef) is written synchronously inside setApiKey, clearApiKey and the handler, in the same call as setState, never in an effect. The handler has no deps (stable, no stale closure); a 401 delivered in the same tick as setApiKey("B") already sees B.

### Ordering table (real AuthProvider + real apiFetch; AuthContext.ordering.test.tsx, 22 tests, all pass)
| Ordering | Result |
|---|---|
| tab A, 401 A, storage A | tab dropped, storage cleared |
| tab A, 401 A, storage B (other tab) | tab dropped, B kept, B not adopted |
| tab A, 401 A, storage empty | tab dropped |
| CONTROL tab B, late 401 A, storage B | stays B, B kept |
| tab B, late 401 A, setItem threw (storage empty) [case a] | stays B |
| tab B, late 401 A, storage emptied by other tab [case b] | stays B |
| tab B, late 401 A, storage A | stays B, stored A removed (equals failed key) |
| two back-to-back 401 A (tab A, storage B) | tab dropped, B kept |
| 401 A after explicit sign-out (other tab stored B) | no crash, B kept |
| event detail undefined / null / {} / apiKey 5 / null / "" / object | ignored (7 cases) |
| setApiKey(B) and 401 A in the SAME tick | stays B |
| next tick after login B: 401 A ignored, then 401 B logs out | as stated |
| 403 for tab's key | nothing cleared |
| only getItem / setItem / removeItem throwing | provider never crashes |

### Evidence (run in apps/web, node from codex runtime on PATH)
- `timeout 175 node node_modules/vitest/vitest.mjs run src/safe-url.test.ts src/pages/calendar src/pages/AskPage.test.tsx src/pages/CalendarPage.test.tsx src/api/client.test.ts src/api/sessions.test.ts src/auth` -> `Test Files 11 passed (11)`, `Tests 143 passed (143)`.
- `timeout 180 node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> `tsc_exit=0`.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (109 dir(s) within budget)`. Sizes: AuthContext.tsx 98, ordering test 183, replay test ~50.
- Mutation (cycle-0 AuthContext.tsx via `git show HEAD:`, per-mutation byte backup, restore after run, `git hash-object` verified 5c84f82f... before and after): ordering tests `6 failed | 16 passed (22)`; replay tests `2 failed (2)`. Total 8 failures pre-fix, 0 post-fix.
- D-015 (ledger reproductions verbatim; AuthContext.replay.test.tsx drives LoginGate, typing B at the gate):
  - ISS-WEBAUTH-002: 2/2 (case 1 setItem throws; case 2 sign out, log in B, localStorage.clear()); both fail pre-fix, both pass.
  - ISS-ISS260-001: 1/1 (first test of AuthContext.test.tsx, unchanged, passes).
  - ISS-WEBAUTH-001: 9/9 (join-link.test.tsx, unchanged, passes in the run above).
  - No recorded reproduction left open.

## NOT DONE (D-024), still owed
Live browser check cannot run on this machine now (CPU shared with the production worker; no browser). It must look at: (a) two real tabs: key A in tab 1, key B pasted in tab 2, force a 401 for A in tab 1, confirm tab 1 shows the login prompt and tab 2 still holds B; and the reverse (tab holds B, late 401 for A, stays logged in, including with storage blocked); (b) a `javascript:alert(1)` meeting URL shows plain text in the Agenda list and the event detail panel, a normal https Meet link opens in a new tab; (c) private-browsing window loads and the gate works with storage blocked.

Status: ready-for-check
Fix cycle: 1
