# t037-join-rules-editor-page

Priority tier: 3 - next unblocked roadmap task (T-037)
Security class: auth + data writes (the page edits the data that decides a no-click join) - FULL ceremony
Exit criterion advanced (docs/meeting-bot-roadmap.md:60): "rules are editable, and a trusted sender's next webinar is scheduled with no click" - this unit delivers the UI half of "rules are editable" only. T-037 stays in progress (no production wiring: the deployed API answers 503; no scheduler switch-over).

## Files (non-blank lines; budgets 300 source / 400 test)

- `apps/web/src/pages/join-rules/joinRulesModel.ts` (132) - types, engine-mirroring normalisers and validator, draft conversion, GET parser, confirmation wording
- `apps/web/src/pages/join-rules/joinRulesClient.ts` (33) - GET / PUT / POST via `apiFetch`, status classification, messages
- `apps/web/src/pages/join-rules/RuleSetEditor.tsx` (61) - rule form
- `apps/web/src/pages/join-rules/ApprovalsPanel.tsx` (49) - lists, add forms, inline confirmation
- `apps/web/src/pages/join-rules/JoinRulesPage.tsx` (143) - state machine, save / approve flows
- `apps/web/src/pages/join-rules/joinRulesModel.test.ts` (106, 18 tests), `JoinRulesPage.test.tsx` (285, 30 tests)
- `apps/web/src/App.tsx` (+2 lines: import, `/join-rules` route), `apps/web/src/layout/NavSidebar.tsx` (+1 line, "Join rules")
- `apps/web/src/api/client.ts` (1 word): `ApiFetchOptions.method` gains `"PUT"`. `apiFetch` had no PUT; this is the only change to shared web code, and it keeps the shared 401 handling.
- `qa/issues.t037ui.jsonl` (ISS-T037UI-001), this manifest.
- Directory budget: `apps/web/src/pages` already holds many files, so a new sub-directory `join-rules/` (7 files) was used; `node scripts/lint-dirsize.mjs` -> `OK (112 dir(s) within budget)`.

## Request bodies the page sends (asserted exactly in tests)

| Action | Request |
|---|---|
| load | `GET /calendar/join-rules` |
| save | fresh `GET /calendar/join-rules`, compare; then `PUT /calendar/join-rules` body `{"version":1,"ownDomains":[...],"rules":[{"id","effect","match":{...}}]}` only; then `GET` again |
| approve | `POST /calendar/join-rules/approvals` `{"kind":"sender"\|"domain","value":"..."}`, then `GET` |
| opt out | `POST /calendar/join-rules/opt-outs` `{"eventId":"..."}`, then `GET` |

No tenant and no `state` in any body (test regex `/state\|tenant\|approved\|optedOut/i` on the PUT body). Matchers left blank are omitted; `subdomains` is sent only as `false`, and only with a domain.

## Status handling

| Status | On GET (load or fresh pre-save GET) | On a write (PUT / POST) |
|---|---|---|
| 401 | "Your API key was rejected. Sign in again." (apiFetch also fires the app's auth-invalidated flow, so the login gate appears) | same message, form kept |
| 403 | "This API key lacks permission to read join rules."; nothing rendered | page becomes READ-ONLY: "This key can view rules but cannot change them..."; all write controls disabled; data still shown; input kept |
| 400 | n/a | "The server rejected this change: <server message>" as text; form kept and still editable |
| 413 / 500 / network (status 0) | "Unable to load join rules." (Retry button for 500/network) | generic "could not be saved. Your edits are still in the form" plus HTTP code or "network error"; server text not echoed |
| 503 | "Rule editing is not available on this server yet."; no rules, forms or "No sender is approved." shown | same message |

Unexpected GET body shape is treated as a load failure, never as an empty rule set.

## Confirmation wording (inline `role=alertdialog`, no `window.confirm`)

- Sender: "Approving <sender> means the bot will join future meetings from <sender> automatically, with no human click."
- Domain (red border, heading "Warning: this trusts a whole domain.", and an acknowledgement checkbox that must be ticked before Confirm enables): "Approving the domain <domain> means the bot will join future meetings from EVERY sender at <domain> automatically, with no human click. That includes addresses you have never seen and people who join that organisation later. Approve a whole domain only if you fully trust everyone who can send from it."
- Opt-out: "Opting out of event <id> means the bot will not join that meeting, even if a rule or an approval would otherwise allow it."
Cancel sends nothing (asserted).

## Design notes

- Client validation (`validateRuleSetClient`) re-states the engine's refusals (valid multi-label domain, no wildcards, email shape, allow/deny rule with no matcher, `subdomains` only with domain, platform and scope enums, unique non-empty names, ownDomains valid) and a 100 kB size check. apps/web may not import packages/meeting-bot, so the regexes are COPIED; drift from the engine is possible and the server remains the authority (any server 400 is shown).
- After every write the page re-fetches. If rule edits are unsaved when an approval completes, only the displayed state is refreshed and the draft is kept.
- All API strings render as React text or controlled input values; no `dangerouslySetInnerHTML`, no `href` (asserted on the sources and with markup-bearing fixtures).
- Concurrency: before PUT the page does a fresh GET and compares the rule set (canonical JSON) with the one it loaded; on a difference it asks ("Overwrite with my version" / "Discard my edits and load the server's rules" / "Cancel"). **This check is best-effort and racy**: a change landing between that GET and the PUT is overwritten, and a failure of the post-PUT reload leaves a stale baseline (the next save then warns). A real fix needs an API version/ETag: filed as ISS-T037UI-001 (`qa/issues.t037ui.jsonl`). The API was not changed.
- Server-side change to approvals only does not trigger the warning (PUT preserves state).

## Evidence

Run from `C:\Users\product\Desktop\KnowledgeBase-lanes\t037ui` (node_modules junctioned to the main tree), codex Node on PATH, each under `timeout`, default vitest flags.

- `cd apps/web && node node_modules/vitest/vitest.mjs run src/pages/join-rules` -> first run: 47 passed, 1 failed (my test regex had the wrong letter case for "Wildcards"; test fixed, no code change).
- `node node_modules/vitest/vitest.mjs run src/pages/join-rules/joinRulesModel.test.ts src/App.routes.test.tsx` -> `Test Files 2 passed (2)`, `Tests 21 passed (21)` (18 model + 3 route-uniqueness tests). JoinRulesPage.test.tsx: 30/30.
- `cd apps/web && node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> no output, `tsc exit 0`.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`.
- `node scripts/lint-loc.mjs | grep join-rules|apps/web` -> no lines for this unit.
- Not run: full web suite, build, depcruise, browser.

## NOT DONE (D-024: live browser check, cannot run on this machine)

A person must open `/join-rules` in a real browser, with a real key, and look at:
1. The page at phone width (about 375 px) and desktop width: rule cards wrap, no horizontal scroll, inputs and buttons usable.
2. The approval confirmation: sender wording, and the domain one (red border, acknowledgement checkbox gating Confirm), legible and unmissable.
3. Read-only mode: with a key lacking the `join-rules` scope, a Save produces the read-only message and every write control is visibly disabled.
4. The 503 state (the deployed API today): only the "not available on this server yet" message, no empty-looking rule list.
Also unverified: behaviour against a real wired store (the API answers 503 until production wiring exists) and the stale check under a real concurrent writer.

Status: checked-PASS
Checked: qa/verdicts/t037-join-rules-editor-page.md (cycle 0, d1bfd43) - SOURCE SCOPE ONLY; live-browser validation under D-024 still owed
Fix cycle: 0
