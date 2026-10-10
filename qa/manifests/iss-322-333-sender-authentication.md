# iss-322-333-sender-authentication

Status: checked-PASS
Checked: qa/verdicts/iss-322-333-sender-authentication.md (cycle 0, 536a56a)
Fix cycle: 0
Priority tier: 2 — open critical/high security issues (ISS-322 high, ISS-333 high; ISS-CAPTURE-003 medium rides along because it lies on route 3)
Security class: auth/trust gate (what may auto-record without a click) — FULL checker ceremony, uncapped
Authorized by: Approver ruling 2026-10-10, option (a) of `qa/gates/iss-322-multifile-shape.md` incl. "new file ok" for `packages/core/src/domain/sender-authentication.ts`.

## Scope and deviations from the gate's file list (read this first)
Gate option (a): `gws-gmail.ts` (surface the header), parser in a core domain file, `store.ts` refusal, `auto-join.ts` pass-through. Built as written, PLUS three small plumbing edits the gate did not list, because the verdict has to travel from the stored row to `selectAutoRecordItems` or the auto-join side cannot act on it:
- `packages/core/src/domain/webinar-types.ts`: optional `senderAuthenticated?: boolean` on `AutoRecordCandidateInput` (+2 lines).
- `packages/meeting-bot/src/calendar/schedule-tick.ts`: `GET /meeting-candidates` row type and `toCandidateInput` carry the field (+2 lines).
- `packages/meeting-bot/src/calendar/calendar-client.ts`: the reconciliation `shape()` allow-list rejects unknown keys, so the new key is whitelisted (2 lists) and type-checked boolean (+2 lines).
Also differs from the gate text: `isTrustedSender` itself is NOT changed. The verdict is applied at its single call site in `auto-join.ts` (`senderVerified && isTrustedSender(...)`), which keeps its 3-arg signature and every existing caller/test valid. Judge this deviation.
Stale numbers in the gate: `gws-gmail.ts` is 296 non-blank lines now (was exactly 300 at start, so the fix is net-negative there by deleting `extractEmail`/`FROM_RE`); the C1 budget counts non-blank lines.

## The three routes and where each is now enforced
1. Config allowlist (ISS-322): `auto-join.ts:190` `!item.preTrusted && !(item.senderVerified && isTrustedSender(...))`. A Gmail item is verified only if `c.senderAuthenticated === true` (`auto-join.ts:90`); calendar organizers are `senderVerified: true` (line 72; they come from the Calendar API, not a From header, unchanged behaviour).
2. `preTrusted` shortcut (ISS-333): `auto-join.ts:97` `approved` stays trusted (a human decision is not a header claim); `auto_approved` counts only with `senderAuthenticated === true`.
3. Scan-time auto-approve (ISS-333): `store.ts:173` `getTrustedSender` is consulted only when `candidate.senderAuthenticated === true`; otherwise the row is filed `pending`. The verdict is persisted on the row (`store.ts:170`) so routes 1 and 2 can read it later.
Header becomes verdict at ONE place: `gws-gmail.ts:253` -> `assessSender` in `packages/core/src/domain/sender-authentication.ts`. ISS-CAPTURE-003 (`split("@")[1]`) is removed: `senderDomain` now comes from the strict parse, and a From that does not parse (multi-@, trailing dot, address list, two From headers) drops the candidate.

## Which header instance is trusted, and why
Only an `Authentication-Results` header whose authserv-id is `mx.google.com` (RFC 8601 receiving-provider id; constant `RECEIVER_AUTHSERV_ID`), and only if EXACTLY ONE such header exists. Reason: an attacker can inject any Authentication-Results text, even one naming `mx.google.com`, but cannot prevent Gmail from stamping its own, so an injected copy yields two matching headers and the message is refused (both orders tested). Headers naming other servers and `ARC-Authentication-Results` are ignored, never trusted. Alignment is exact-domain: `dmarc=pass` with a single `header.from` equal to the From domain (two dmarc results, duplicate header.from, any non-pass => refused); only when the header has no dmarc result at all, a `dkim=pass` (`header.d`/`header.i`) or `spf=pass` (`smtp.mailfrom`) whose domain equals the From domain exactly (no subdomain, no other domain). Comments are stripped; backslash, double quote, unbalanced parentheses or a malformed result token make the header unparseable => not authenticated.

## Evidence (real output)
Toolchain: node v24.19.0 from the codex runtime, tests run directly with `node --test --import tsx`.
- `lint-dirsize`: before `OK (112 dir(s) within budget)`, after `OK (112 dir(s) within budget)`.
- `lint-loc`: before and after the same 8 pre-existing violations (none in touched files; list: speakers-llm.ts 313, sb_join.py 1142, join-rules.ts 309, obs-windows.ts 365, record-commands.ts 304, run-watch.mjs 558, run-pipeline.mjs 346, run-pipeline.test.mjs 434). Touched files after (non-blank): gws-gmail.ts 296 (budget 300), store.ts 291, auto-join.ts 238, schedule-tick.ts 279, calendar-client.ts 237, sender-authentication.ts 85, webinar-types.ts 113; tests: core 61, meeting-bot 80, meeting-candidates.test.ts 287, auto-join.test.ts 281 (budget 400).
- `lint-dupes`: 1 violation (`recordApproval` in db trusted-senders vs meeting-bot join-rules) — pre-existing, not from this unit.
- `cd packages/core && node --test --import tsx src/domain/sender-authentication.test.ts src/domain/purge-policy.test.ts` -> `ℹ tests 13 / pass 13 / fail 0`.
- `cd packages/meeting-bot && node --test --import tsx src/calendar/{auto-join,schedule-tick,trusted-sender,webinar-policy,schedule-state,join-rules,sender-authentication}.test.ts` -> `ℹ tests 119 / pass 119 / fail 0`.
- `cd apps/api && node --test --import tsx src/gws-gmail.test.ts src/routes/meeting-candidates.test.ts` -> `ℹ tests 39 / pass 39 / fail 0`.
- `tsc --noEmit -p tsconfig.json` in packages/core, packages/meeting-bot, apps/api: all exit 0.
- Before the edits the calendar suite ran 114 tests green; after only the `auto_approved` fixtures in `auto-join.test.ts:75` and `schedule-tick.test.ts:37` changed (added `senderAuthenticated: true`) — they build an `auto_approved` row that, by design, now needs the verdict. No assertion changed or deleted.

## D-015: recorded corpus by issue id (printed by the tests)
- `ISS-333: 5/5 behave as recorded` = (a) dkim=fail -> pending, (b) header absent -> pending, (c) dkim/spf/dmarc pass aligned -> still auto_approved [api side `routes/meeting-candidates.test.ts`, "3/3"]; (d) unauthenticated auto_approved skipped by selectAutoRecordItems, (e) human `approved` trusted regardless [meeting-bot side `sender-authentication.test.ts`, "2/2"]. Refusals (a)(b)(d) 3/3; positives (c)(e) 2/2. Case (a) uses the row's own words (`dkim=fail`) via the real scan -> store path.
- `ISS-322: 4/4 refused` (and 4/4 authenticated still trusted). The ISS-322 row records NO enumerated reproductions, only evidence prose naming "all 4 default entries" (karunn@vidysea.com, umeshsugara@vidysea.com, theoutreachcollective.in, ashoka.edu.in); the corpus is those four, each spoofed with the verdict absent and with it false. This is my reading of the row, flagged for the checker.
- `ISS-CAPTURE-003: 1/1 refused` (From `x@ashoka.edu.in@evil.com`, the row's example, dropped). ISS-CAPTURE-001's `3/3 refused` still printed and unchanged.
- No recorded reproduction left open. Ledger statuses not touched.
Extra cases (not part of counts): ~30 header forms in `sender-authentication.test.ts` (core): foreign authserv-id, two receiver headers in both orders, ARC header, comment trick, dmarc fail/none/duplicate/mismatched header.from, aligned vs subdomain vs other-domain dkim/spf, unbalanced parens, quotes, backslash, address list, two From headers; parity of core's strict parse with `parseStrictEmail` on 22 vectors; reconciliation accepts the boolean key and refuses a non-boolean.

## Not delivered / known limits
1. NOT proven against live Gmail: no network/Gmail on this machine. The header grammar is from RFC 8601 and remembered Gmail output (`mx.google.com; dkim=pass header.i=@d ...; spf=pass (...) smtp.mailfrom=...; dmarc=pass (p=..) header.from=d`); a live sample should be pulled and added as a fixture. If Gmail emits a shape this parser rejects, trusted senders will be refused (fail closed), not accepted.
2. Residual: the single-header rule relies on Gmail always stamping its own header. If a message reached the mailbox without Gmail stamping (e.g. API import) and carried a forged `mx.google.com` header, it would be accepted.
3. Rows persisted BEFORE this unit have no `senderAuthenticated`: existing `auto_approved` rows are now refused by auto-join (fail closed); `approved` rows are unaffected. Not migrated.
4. `everyWebinar` mode (used by the production schedule-tick loader, `schedule-tick.ts:199`) skips the trust check by design; this unit does not change that mode, so route 1 only bites in non-everyWebinar runs. Only `rejected` still blocks there.
5. Calendar-organizer items are `senderVerified: true`; a spoofed calendar invite organizer is a different surface, out of scope.
6. A human approval of an unauthenticated candidate still increments the domain's approval count (`store.ts` approve path, unchanged); trust it later earns is still gated on authentication at scan time.
7. Core cannot import meeting-bot (depcruise), so `parseStrictEmail` is mirrored in core rather than reused; parity is pinned by a test, not by shared code. `lint-structure`/depcruise and the snapshot check were not run (CPU); neither were mutation runs (checker's job, use `scripts/lib/mutate.mjs`) nor the full suites.
8. A bare unbracketed `a b@ashoka.edu.in` still resolves to `b@ashoka.edu.in` (legacy extraction behaviour kept); alignment against Gmail's own `header.from` still has to match.
9. Schema/Mongo validator for `meeting_candidates` not changed (`additionalProperties: true`); the web UI type does not show the field.
