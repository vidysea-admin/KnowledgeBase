# iss-webhigh-001-join-rules-api-nonascii-sender

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 2-equivalent (open ledger issue ISS-WEBHIGH-001, filed by the ISS-T037UI-002 checker; labelled medium there). Class: data write on the join-rules API (trust-list input) -> FULL ceremony.
Lane: lane/webhigh2, branched from lane/webhigh 3fbc5a6e. Ledger row ISS-WEBHIGH-001 status NOT changed here (checker closes).

## What was wrong
The web editor refuses sender approvals with characters outside printable ASCII, but `apps/api` join-rules accepted them: `POST /calendar/join-rules/approvals` (kind "sender") and `match.email` inside a rule set sent by `PUT /calendar/join-rules`. The engine's `parseStrictEmail` and core `parseSender` are printable-ASCII-only, so a stored U+200B / U+202E / Cyrillic sender could never match: inert, but confusing and unsafe.

## Change
- `apps/api/src/join-rules/sender-ascii.ts` (new): `isPrintableAsciiSender` = the engine's own class `/^[!-~]+$/` applied after trimming ASCII whitespace only (the engine's normalizeEmail trims); `ruleEmailMatchers`; typed code `sender_not_printable_ascii`. `.dependency-cruiser.cjs` forbids apps/* -> packages/meeting-bot, so the expression is restated (as the web editor does), not imported. Punycode (`xn--`) is ASCII and passes.
- `router.ts` (+6 lines): approvals kind "sender" and PUT `rules[].match.email` throw `NonAsciiSender` -> `400 { error: "sender_not_printable_ascii", message }`. The check runs BEFORE any store read/write on both paths; no ETag header on the 400; the PUT precondition (428/412) logic is untouched.
- Not changed: domain approvals, `ownDomains`, other matcher kinds, engine, web, system-status/notifications files.
- Deliberately not mirrored: parseStrictEmail's extra rejection of `<>(),;:"\` (ASCII; outside this issue). Note for checker.

## Reproductions
Ledger row records U+200B, U+202E, U+0430 local parts without exact strings (no larger corpus), so each was built as `a​b@x.example`, `ann‮@x.example`, `аnn@x.example`, plus U+200B trailing, Cyrillic domain, U+00A0, U+FEFF. ISS-WEBHIGH-001: 7/7 refused on approvals AND 7/7 refused on PUT (400, typed code, nothing written, stored bytes identical, ETag still the same on GET). None left open.

## Evidence
```
apps/api: node --test --import tsx src/join-rules/sender-ascii.test.ts   ℹ tests 5 ℹ pass 5 ℹ fail 0
apps/api: node --test --import tsx "src/**/*.test.ts"                    ℹ tests 790 ℹ pass 789 ℹ fail 1
  the 1 fail = src/activity-health/router.test.ts:60 (real Python producer + Mongo binding, "null !== 0" at :149): untouched file, environment-dependent; not this change
apps/api: tsc --noEmit -p tsconfig.json                                  exit 0
```
ETag tests: 428 without precondition, 412 stale with currentEtag, 200 on match, plain ASCII + punycode 4/4 accepted on both paths.
Mutations (lane-unique untracked harness, per-mutation byte backup restored in finally, deleted before commit; router.ts diff vs base = the 6 intended lines):
M1 gate always true KILLED (2 fail) · M2 class widened to U+FFFF KILLED (2) · M3 approvals check removed KILLED (1) · M4 PUT check removed KILLED (1) · M6 typed 400 -> 500 KILLED (2). 5/5 killed. (M5 trim-any-whitespace mutant did not apply: harness pattern miss; not run.)
No browser, OBS, Mongo or network used by the new tests (in-memory spyStore over localhost).
