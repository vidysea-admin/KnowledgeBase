# Verdict - web-auth-key-clear-and-href-scheme

**Date:** 2026-10-10
**Contract:** `qa/contracts/web-auth-key-clear-and-href-scheme.md` (authored by this checker)
**Cycle checked:** 0
**Mode:** A (event-driven unit check, no browser, no dev server; source scope)
**Worktree:** C:\Users\product\Desktop\KnowledgeBase-lanes\webauth, HEAD 0b0715b

```
VERDICT: FAIL
SCOREBOARD: 9/10 criteria met (C3 fails in two storage states), 2/2 invariants hold
ISSUES-WRITTEN: ISS-WEBAUTH-002
```

## What passes (source scope)
Fix 2 (ISS-WEBAUTH-001) and the recorded reproduction of Fix 1 (ISS-ISS260-001) are sound. One residual
ordering of the 401 handler still logs out a tab that holds a valid newer key (ISS-WEBAUTH-002); it is a
one-line fix in the handler's relevance test. Per the brief, that ordering is a FAIL.

## 1. Scope
`git show --stat` for fd72e0d, 4e491eb, 0b0715b: only AuthContext.tsx + test; AskPage.tsx, AgendaView.tsx,
EventDetail.tsx, safe-url.ts + tests, join-link.test.tsx, qa/issues.webauth.jsonl, the manifest.
`git diff 0fda0a8 0b0715b --stat -- apps/api packages package.json pnpm-lock.yaml apps/web/package.json
apps/web/src/App.tsx apps/web/src/layout apps/web/src/pages/analytics` printed nothing. No API change, no new dependency.

## 2. Fix 1 ordering table (real AuthProvider + LoginGate + real apiFetch, throwaway probe, deleted)
| Ordering | Storage after | Tab after | Data children |
|---|---|---|---|
| stored == failed A | removed | login prompt | unmounted (PROTECTED-DATA gone) |
| stored B behind state A, 401 A via apiFetch | B kept | login prompt (does not adopt B) | unmounted |
| same, two 401s for A back to back (Promise.all) | B kept | login prompt | unmounted |
| storage empty, state A, event A | empty | login prompt | unmounted |
| getItem throws at mount | n/a | login prompt, no crash | n/a |
| removeItem throws, event A | A stays (cannot remove) | login prompt | unmounted |
| CONTROL: tab logs in B itself (storage works), late 401 A | B kept | stays B | kept |
| tab holds B, storage EMPTY (other tab signed out), late 401 A | empty | LOGGED OUT (B lost) | unmounted |
| tab holds B, setItem throws (B in memory only), late 401 A | empty | LOGGED OUT (B lost) | unmounted |
| 401 A after sign-out, other tab stored B | B kept | login prompt (already) | n/a |
| explicit sign-out with newer B stored | removed (unconditional) | login prompt | n/a |
| 403 via apiFetch | A kept | stays A | kept |

Key attribution: `apiFetch(path, apiKey, ...)` receives the key as an argument, sends it in the header and passes
THAT same variable to `invalidateAuth(apiKey)` (client.ts): the failed key is captured per request at send time,
not read from state at failure time, so a late 401 is attributed to the key actually sent. Probe confirmed header
`Bearer A`. The tab reads storage only at mount and inside the handler, and the handler never sets state to a
stored value, so no ordering sends a key the user did not enter in this tab (a reload is the only adoption path).
LoginGate renders `children` only when `apiKey` is truthy, so nulling it unmounts all data-bearing pages; no
stale data stays on screen.

DEFECT (C3): the two LOGGED OUT rows. Cause: `if (detail.apiKey !== apiKey && detail.apiKey !== storageKey &&
storageKey !== null) return;` falls through whenever storage is empty, whatever key failed. The clause predates
this unit (dd6a3b2), but the brief's control case ("state B, late 401 for A: this tab must NOT be logged out")
fails when storage is blocked or was cleared by another tab. Impact is availability only (re-paste B). Filed as
ISS-WEBAUTH-002 (medium, auth). Fix: relevance = `detail.apiKey === apiKey` only.

## 3. Regression of intent
403 clears nothing (row above; dd6a3b2 intent kept; mutation M6 killed). Explicit sign-out clears storage
unconditionally even when another tab stored a newer key: intended and consistent (sign-out in one tab signs the
origin out everywhere; other tabs follow on reload). Stated, not a defect.

## 4. safeHttpUrl scheme table (vitest probe, deleted); returns the ORIGINAL string or null, never a normalised form
Rejected (null): `javascript:alert(1)`, `JaVaScRiPt:alert(1)`, `\tjavascript:`, `java\nscript:`, `java\tscript:`,
`\u0001javascript:`, `\u200bjavascript:`, `\ufeffjavascript:`, `\u00a0javascript:`, `java\u200bscript:`, `data:`,
`vbscript:`, `file:///`, `blob:https://a.b/x`, `about:blank`, `ftp://`, `//evil.tld`, `/a/b`, `https://a.b/\n`,
`http://`, `https://`, null, undefined, 5, object with hostile toString, `new String(..)`, array.
Accepted (original returned): `http:evil`, `https:/evil`, `http:\\evil.tld`, `https://a.b\@evil.tld`,
`https://user:pw@evil.tld/`, `https://a.b/x y`, `https://a.b/x%20y`, `https://bücher.de/`, 100k-char https URL,
`https://a.b/"onmouseover=x`, `https://a.b/<ZWSP>`. Every accepted form has an http or https scheme under the
WHATWG parser, the same one a browser applies to the attribute, so original-versus-parsed divergence cannot change
the scheme; React escapes the attribute value (the quote case stays inside it). Nothing non-http(s) became a link.

## 5. Call sites
AgendaView and EventDetail test `safeHttpUrl(x)` and then render `href={x}` from the same immutable string in one
render pass; the util returns its input unchanged on success, so this is equivalent to rendering the return value
(cosmetic nit, not a bypass). Fallback is a `<span>`/`<div>` text node; no dangerouslySetInnerHTML. Anchors have
`target="_blank" rel="noreferrer"` (implies noopener), same as AskPage. AskPage: the old guard only parsed; the
new one also rejects control characters and surrounding whitespace, so a stored URL with a trailing newline or
leading space now shows as text rather than a link (low, note only); `%20` still links.

## 6. Sink completeness
Independent `rg` over apps/web/src (non-test) for href/src/srcSet/action/formAction/to=/window.open/location/
navigate(/dangerouslySetInnerHTML/innerHTML/url(/iframe/object/embed/setAttribute found exactly the manifest's
list: AskPage:155 (guarded), AgendaView:74 and EventDetail:53 (fixed); Link `to=` values built from literal
`/sessions/..` or `/brain?..` prefixes with encodeURIComponent/URLSearchParams (incl. NodePanel:100,
ConfidenceGraphPage:89 via evidenceHref, EventDetail:44 via calendar-model.ts:73); SessionDetailPage `#turn-`
fragment; video/img `src` from URL.createObjectURL; NavSidebar `API_BASE_URL` + fixed path; WatchPage literal.
No window.open, location write, innerHTML, dangerouslySetInnerHTML, iframe/object/embed or CSS `url(`. Gmail
`meetingUrl` is `https?://`-anchored by regex and reaches CalendarPage only as text. No missed sink.

## 7. Severity of ISS-WEBAUTH-001
apps/api/src/gws-calendar.ts `meetingUrlOf` reads only `hangoutLink` or the `conferenceData.entryPoints` entry
with `entryPointType === "video"` (`.uri`); `location` and `description` are not parsed. These are structured
conference fields, not invitation free text (Google documents http/https for video entry points; not re-verified
here, no network). The precondition stays unconfirmed and a click is needed. Ruling: medium stands. Status left
`open` because the unit FAILed; flip to verified on the cycle-1 PASS (the Fix 2 evidence here already supports it).

## 8. D-015 replays
- ISS-ISS260-001 recorded reproduction (A in state, B stored, 401 for A through real apiFetch, expect storage B):
  1/1 passes on the fix (first test of AuthContext.test.tsx).
- ISS-WEBAUTH-001 recorded hostile forms: 9/9 render as text in EventDetail and in AgendaView.
- Pre-fix failure (0fda0a8 file restored per mutation): AuthContext.tsx -> `3 failed | 12 passed (15)`;
  AgendaView.tsx -> `9 failed | 92 passed (101)`; EventDetail.tsx -> `9 failed | 92 passed (101)`.

## 9. Commands and mutations
```
node node_modules/vitest/vitest.mjs run src/safe-url.test.ts src/pages/calendar src/pages/AskPage.test.tsx \
  src/pages/CalendarPage.test.tsx src/api/client.test.ts src/api/sessions.test.ts src/auth
 Test Files  9 passed (9) / Tests  119 passed (119)
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json   -> tsc_exit=0
```
Mutations (backup per mutation, restore in a subshell trap, `timeout 170` per run, `cmp` + hash check):
| Mutation | Result |
|---|---|
| M1 pre-fix AuthContext.tsx | killed (3 failed) |
| M2 handler removes storage unconditionally | killed (2 failed) |
| M3 handler adopts newer stored key | killed (2 failed) |
| M4 pre-fix AgendaView / EventDetail | killed (9 failed each) |
| M5 safeHttpUrl accepts any scheme | killed (15 failed) |
| M6 client.ts clears on 403 too | killed (2 failed) |
| M7 drop control-char rule | NOT APPLIED (quoting error in my harness), not counted |
No applied mutation survived. No test covers state B with empty or throwing storage, which is why C3 passed the
maker's suite.

HEAD fidelity (git hash-object equals git rev-parse HEAD:file after each mutation): AuthContext.tsx
87da0351166ac729bf107f9061e26eef94dd1b0d; client.ts 5b4c70a7cb79eebcac0aa479f58206fbc026fa3b; AgendaView.tsx
dd32961338d64ca4f1ee6607204d7146d035537f; EventDetail.tsx 242ff7debdf25f609bbdb67a45d0e1c6965703a8; safe-url.ts
ea82fe2657a74edf7ab574d7b074a85318bf365f.

## Owed
D-024 live-browser validation remains owed on the eventual PASS: two real tabs with keys A and B and a forced 401
for A; a `javascript:` meeting link showing as text in agenda and detail views; private-mode login.

ISSUES-WRITTEN: ISS-WEBAUTH-002

EXPLANATION: The unit fixes its two stated issues and its tests are strong (every applied mutation killed). It
fails on one listed ordering: the handler's "storage empty" clause lets a late 401 for an old key log out a tab
holding a valid newer key when storage is blocked or was cleared by another tab. Cycle 1: restrict relevance to
`detail.apiKey === apiKey` and add the two tests in ISS-WEBAUTH-002. On a later PASS the orchestrator should set
ISS-ISS260-001 to verified in qa/issues.iss260.jsonl and ISS-WEBAUTH-001 to verified in the webauth shard.

---

# Cycle 1

**Date:** 2026-10-10
**Cycle checked:** 1
**Mode:** A (event-driven unit check, no browser, no dev server; source scope)
**Worktree:** C:\Users\product\Desktop\KnowledgeBase-lanes\webauth, HEAD cb3b299

```
VERDICT: PASS (source scope)
SCOREBOARD: 10/10 criteria met, 2/2 invariants hold; cycle-0 properties intact
ISSUES-WRITTEN: none
```

## 1. Scope
`git diff 8b4c6fe cb3b299 --stat`: AuthContext.tsx (31 lines), AuthContext.ordering.test.tsx (new), AuthContext.replay.test.tsx
(new), the manifest. safe-url.ts, AgendaView, EventDetail, AskPage, client.ts untouched.

## 2. D-015 replays (counts by issue id)
- ISS-WEBAUTH-002: recorded case (a) setItem throws + late 401 A: pass; case (b) sign out, login B, localStorage.clear(), late 401 A: pass. 2/2
  (AuthContext.replay.test.tsx follows the ledger steps with the real LoginGate; case a uses a throwing setItem, case b a real clear()).
- ISS-ISS260-001 (A in state, B stored, 401 A via real apiFetch, expect storage B): 1/1 (AuthContext.test.tsx), plus the
  handler-alone variant.
- ISS-WEBAUTH-001: hostile forms 9/9 render as text (EventDetail and AgendaView tests green in the targeted run).

## 3. Ref versus state (AuthContext.tsx read in full)
`keyRef.current` changes in the same synchronous step as state at every write site: initial `useRef(apiKey)` (the committed initial
state, not a second storage read), `setApiKey`, `clearApiKey`, the handler's drop. No effect writes it; there is no other setter;
storage is never adopted (reload or remount is the only adoption path, and it recomputes ref and state from one read). Requests take
their key from React STATE via `useAuth().apiKey` (a render behind the ref) and pass it as an argument to `apiFetch`, which sends it
and reports THAT variable in the event. So the ref can only be AHEAD of a request's key, never behind. Interleaving (i): request sent
with old A after setApiKey B, 401 A: B stays logged in (probes X1, X1b via real apiFetch). Interleaving (ii) (ref A, request sent
with B) cannot occur: state is only set together with or after the ref, so any key a component can read from state was written to
the ref first; a remount creates ref and state from one read; strict mode double-invokes the initialiser with the same stored value
and `useRef` takes the committed state (probe X4); hot reload re-runs the same code. No other module reads or writes the key.

## 4. Listener lifecycle
One `window.addEventListener(AUTH_INVALIDATED_EVENT)` in AuthProvider's effect, removed in its cleanup; the handler is
dependency-free so it never resubscribes. One provider in App.tsx. After unmount the handler is gone: probe X5 fires a 401 with no
provider mounted and storage is untouched; a remount reads storage fresh. The event is a same-document `CustomEvent` dispatched
only by client.ts `invalidateAuth`; there is no `storage` listener, so it does not cross tabs. A page script could forge an event
carrying the current key and log the user out; such a script can already read localStorage, so this is a nuisance, noted, not filed.

## 5. Ordering table (each maker ordering test asserts the tab's shown key AND the stored value)
| Ordering | Tab after | Storage after | Source |
|---|---|---|---|
| stored == failed A | prompt | removed | ordering test 1 |
| tab A, stored B, 401 A (incl. two back-to-back) | prompt, B not adopted | B kept | tests 2, 8 |
| tab A, storage empty, 401 A | prompt | empty | test 3 |
| CONTROL tab B, storage B, late 401 A | stays B | B | test 4 |
| case (a) tab B, setItem threw, 401 A | stays B | empty | test 5 + replay 1 |
| case (b) tab B, other tab cleared storage, 401 A | stays B | empty | test 6 + replay 2 |
| tab B, stale stored A, 401 A | stays B | A removed | test 7 |
| 401 A after sign-out, B stored by other tab | prompt | B kept | test 9 |
| detail undefined/null/{}/non-string/empty | untouched | untouched | test 10 (7 cases) |
| setApiKey B and 401 A in one act | B | B | test 11 |
| 403 | untouched | untouched | test 13 |
| getItem / setItem / removeItem throwing | no crash | n/a | test 14 (3 cases) |

My extra orderings (throwaway probe, 8/8 passed, deleted): X1 401 A inside the same act as setApiKey("B"): B kept, storage B.
X1b request sent with the old-closure A through real apiFetch while setApiKey("B") runs: B kept. X2 old keys A and C both fail
after B: B kept, storage B. X3 sign out, 401 A, log in A again, 401 A again: the second 401 logs the tab out and clears storage,
and that is correct, because the server rejected A, so a 401 for A is valid evidence that A is bad whenever it arrives and the
user must supply a working key; the 401 that arrived before the re-login left the new login alone (X3b). X4 strict mode: B kept,
then a 401 for B logs out. X5 unmount then 401 with no provider: storage untouched; remount reads B fresh.

## 6. Regression check (cycle-0 properties)
Targeted run (safe-url, calendar views, AskPage, CalendarPage, client, sessions, auth): 11 files, 143 tests passed. LoginGate alone:
4 passed (data children unmount when the key is nulled). Href scheme fix, 403 clears nothing, explicit sign-out clears storage
unconditionally, storage throwing never crashes: all covered green. `tsc --noEmit -p tsconfig.json` in apps/web: exit 0.

## 7. Mutations on the new handler (backup per mutation, subshell trap restore, `timeout 150`)
| Mutation | Result |
|---|---|
| M1 restore the "storage empty" clause | killed (7 failed) |
| M2 compare against render-closure state, deps [apiKey] | killed (11 failed) |
| M3 ref written in an effect, not synchronously | killed (1 failed: same-tick test) |
| M4 stored key removed unconditionally | killed (8 failed) |
| M5 adopt the stored key when the tab key is dropped | killed (5 failed) |
| Cycle-0 handler (8b4c6fe AuthContext.tsx) | 8 failed, 27 passed (the maker's 8) |

First attempts at M3 and M5 did not apply fully (CRLF source versus my \n patterns); M3 first reported a spurious survival because
only half the patch applied. Redone with line endings normalised: both applied and killed. HEAD fidelity after all runs:
`git hash-object apps/web/src/auth/AuthContext.tsx` = 5c84f82f68f080a7664ffa9a657c335873c7790f = `git rev-parse
HEAD:apps/web/src/auth/AuthContext.tsx`; `git status --short` was clean.

## Owed
This PASS certifies SOURCE SCOPE only. D-024 live-browser validation is still owed: two real tabs with keys A and B and a forced 401
for A; a `javascript:` meeting link shown as text in the agenda and detail views; private-mode login.

ISSUES-WRITTEN: none

EXPLANATION: The handler now decides tab-drop and storage-clear independently on the failed key carried by the event, with the
tab's current key read from a ref written synchronously at every write site. No ordering logs out a tab with a valid newer key,
sends a key the user did not enter, or leaves another account's data on screen; all five handler mutations and the cycle-0 handler
are killed. ISS-WEBAUTH-001 and ISS-WEBAUTH-002 are set to verified in qa/issues.webauth.jsonl. RECOMMENDED (not made, other shard):
set ISS-ISS260-001 in qa/issues.iss260.jsonl to status verified, fixed_date 2026-10-10, verified_date 2026-10-10, verified_evidence
"cycle 1 replay 1/1 plus handler-alone variant; qa/verdicts/web-auth-key-clear-and-href-scheme.md cycle 1; fix cb3b299". Low notes:
a forged in-page event can log the user out (page scripts can already read the key); 401s arriving with no provider mounted are
dropped by design.
