# Verdict — r1-attention-alerts

VERDICT: FAIL
Cycle checked: 0
Unit commit: a4634fe (lane/r1alerts, base 7f352eb)

## Commands (node per toolchain note; every test command under `timeout`)
- `git show --stat a4634fe`: 3 files, +360: attention-alerts.ts, attention-alerts.test.ts, qa/manifests/r1-attention-alerts.md. Scope OK.
- `timeout 120 node --test --import tsx src/calendar/attention-alerts.test.ts` -> `tests 10 / pass 10 / fail 0`
- `tsc --noEmit -p tsconfig.json` (packages/meeting-bot) -> exit 0
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (111 dir(s) within budget)`
- `node scripts/lint-loc.mjs` -> 3 pre-existing violations (speakers-llm.ts, sb_join.py, run-watch.mjs), none in this unit.

## Free-text fields the module reads
SkippedItem: `sessionKey` (unsanitised, see leak table), `title` (neutralizeText), `reason` (switch on 5 exact values; unknown reason only appears as a counted key after keyPart). Job rows: map key (= sessionKey, unsanitised), `status`, `reason` (allow-list of 14, unknown -> "unspecified"; confirmed an email/URL reason is NOT echoed), `title` (neutralizeText), `startTime` (must parse). `startTimes` map values (must parse as dates). No other field (detail, meetingUrl, registration, sender) is read.

## Leak table (alert serialised with JSON.stringify; input -> what remains)
| Input (title) | Result | Leak |
|---|---|---|
| `https://zoom.us/j/123?pwd=abc123` | `link` | no |
| `x https://x.example/r?tk=REG1` | `x link` | no |
| `mail bob@evil.example` | `mail email` | no |
| `Passcode: 123456` | `secret` | no |
| `hxxps://zoom.us/j/1?pwd=HXX` | `link` | no |
| reason `https://zoom.us/j/1?pwd=REASONSECRET bob@x.com` | `Reason: unspecified` | no |
| extra job fields (detail, meetingUrl, registrationUrl) | not read | no |
| `Meeting ID: 987 6543 2100 Passcode 778899` | unchanged | YES passcode + id |
| `Meeting ID 987 6543 2100 pwd abc123` | unchanged | YES |
| `pwd abc123XYZ` | unchanged | YES |
| `meetingPassword=Sekret9` | unchanged | YES |
| `"passcode":"Q123"` | unchanged | YES |
| `pass<U+200B>code=ZWS1` | unchanged (zero-width not stripped) | YES |
| `https://zoom.us/j/1?pwd=<LF>SPLIT` | `link SPLIT` | YES |
| `https%3A%2F%2Fzoom.us%2Fj%2F1%3Fpwd%3DPCT` | unchanged | YES |
| `zoom.us%2Fj%2F1%3Fpwd%3DPCT2` | unchanged | YES |
| `zoom.us/j/123?pwd=abc` | `zoom.us/j/123?secret` | meeting id/path kept |
| full-width `ｈｔｔｐｓ：／／zoom.us/j/1?pwd=FW`, `https:∕∕zoom.us∕j∕1?pwd=LOOK` | host+path kept | link kept |
| `Dial in +1 555 123 4567 PIN 889900#`, `call +91 98765 43210` | unchanged | YES PIN, phone |
| `sk-ant-api03-AAAAAAAAAAAAAAAAAAAA`, `AKIAIOSFODNN7EXAMPLE` | unchanged | YES |
| `Your code is 482913` | unchanged | YES (OTP-like) |
| `bob(at)evil.example` | unchanged | obfuscated email |
| sessionKey `cal:x https://zoom.us/j/1?pwd=SKEY bob@evil.example<LF>ACTION` | `alert.sessionKey` verbatim; key `...cal:x_https:__zoom.us_j_1_pwd_SKEY_bob_evil.example_ACTION` | YES (field and key) |

## Injection results
- Destination: `defaultTelegramAlertSend` / `defaultTelegramSend` and the telegram-alerts path POST `{chat_id,text}`; grep finds `parse_mode` only in attention-alerts.ts (a comment). Plain text today.
- If a parse mode were set: Markdown/HTML control chars `* _ ` [ ] < > ~ | \ { } #` are stripped, but `& ( ) . ! - = + ' " : ; @ /` remain (MarkdownV2 special: `. ! - = + ( )`; HTML: `&`). Residual risk: a MarkdownV2 send would fail or mis-render; not an injection of links because `[`/`]`/`<`/`>` are gone. Recorded in the contract.
- Newline injection: titles `Legit\nACTION REQUIRED: approve sender evil.tld`, `\u0085`, ` `, `\u000b` all collapse to one line; every body had exactly 4 lines. No forged second alert line. (Via the `sessionKey` field a raw newline survives, but that field is not in title/body.)
- Bidi: RLO/LRI/PDI/LRM/RLM stripped. NOT stripped: U+200B, U+200D, U+2060, U+180E, U+00AD, U+FE0F (low, used in leak evasion above).
- Truncation: by code points (Array.from); 200 emoji -> 80 code points, no lone surrogate; 78 chars+2 emoji fine. Combining flood of 5000 marks -> 80 code points. Internal `slice(0,2000)` could split a pair but the result is then capped at 80, so never visible.
- Performance (sanitiser): 105 KB of `http://`: 0.1 ms; 100 KB `a=`: 13 ms; 50 K `[`: 12 ms; 100 KB `pwd=`: 0.1 ms; `a.`x50K+`@`: 16 ms; 1 MB `x`: 46 ms. No backtracking problem; nothing near 100 ms.

## Dedupe and retention
- Key `attn:<case>:<keyPart(sessionKey)>[:<reason>]`: stable across ticks and across title/zone/time changes (tested); differs by event and case; skip and job view of one situation share a key. Realistic sessionKeys (`cal:<id>`, `gmail:<id>`, `webinar-<hash>`) contain no URL/email/token.
- Collisions: `cal:a b`, `cal:a/b`, `cal:a_b` -> one key; keys sharing a 160-char prefix collide (ISS-R1ALERTS-004). Real ids are alphanumeric so low practical risk.
- Retention: oldest-first by insertion, deterministic (trim from front). Re-seen keys are not refreshed, so a long-lived live situation is evicted after 500 newer keys and re-alerts. With 600 live situations: tick 0 fresh 600, ticks 1..3 fresh 100 each, indefinitely. Needs >500 concurrent human-attention situations; judged low (contract requires a per-tick send bound).
- Duplicates: `alerts` can hold duplicate keys (skip + job for same situation); `selectNewAlerts` dedupes in-batch.

## Time rendering
Kolkata across date boundary correct (`19:00Z -> 2026-10-11 00:30 (Asia/Kolkata)`, tested). DST New_York 2026-03-08 06:30Z -> 01:30, 07:30Z -> 03:30 correct. Invalid zone -> `(UTC)` labelled. Missing/garbage start -> `start time unknown`; never "Invalid Date". Defects: `America/New_York` printed as `America/NewYork` (underscore stripped, ISS-R1ALERTS-003); direct `renderStart(x, undefined)` prints `((untitled))` in machine zone; fall-back hour 01:30 is ambiguous without an offset (low); `Date.parse("0")` gives 2000-01-01 (low).

## Totality and purity
Counted in `ignored`, no throw: null, numbers, arrays, missing/empty sessionKey, cyclic job row (title object -> "(untitled)"), `__proto__`/`constructor` job ids, deep-frozen input unmutated, ordering deterministic. Findings (low, JSON-derived inputs make them unreachable today): an accessor that throws (`get sessionKey(){throw}`) or a throwing Proxy makes `buildAttentionAlerts` throw; prototype-inherited fields (`Object.create({sessionKey,reason,title})`) are accepted as real items instead of ignored.

## Usefulness against R1 (judgement)
Each body states what happened, which event, start time, and a concrete next step, so needs-registration, overlap-lost, join-link, generic action-required are actionable. untrusted-sender is not fully actionable (no sender; "add them to the trusted senders list" without saying whom): wiring must pass a validated sender domain. Double alert: the existing generic line already fires for job rows (action_required with needs-registration/overlap-lost/unsafe-join-link/retry-limit...) with fingerprint `status:reason`; wiring both would send two messages per situation. Wiring must suppress or replace the generic send for these reasons (see contract). Skipped-only cases (untrusted-sender, no-join-link) have no operation row, so no overlap there.

## Mutation table (backup per mutation, restored by cp then hash check; each test run under timeout 90)
| Mutation | Result |
|---|---|
| M1 stop replacing URLs | killed |
| M2 stop stripping control chars | SURVIVED (gap, ISS-R1ALERTS-005) |
| M3 echo unknown action_required reason | killed |
| M4 timestamp in dedupe key | killed |
| M5 drop retention bound | killed |
| M6 invalid zone not labelled UTC | killed |
| M7 stop pwd/token pair redaction | killed |
| M8 stop email redaction | killed |
| M9 stop markup stripping | killed |
| M10 stop bidi stripping | killed |
(M11 cap removal did not apply, no match; discarded.)
HEAD fidelity after all runs: `git hash-object attention-alerts.ts` = `git rev-parse HEAD:...` = 34a212c3308de0f760414e15512a5b199f6d2730; test file unmodified; `git status --short` clean before this commit.

ISSUES-WRITTEN: ISS-R1ALERTS-001 (high), -002, -003, -004, -005 (medium) in qa/issues.r1alerts.jsonl

EXPLANATION: The unit is a pure, total-for-JSON-input module that redacts the standard `pwd=`/`token=`/URL/email forms well and cannot be made to forge a second alert line. It fails the spec's core bar, no secret reaching any alert field or key, because the redaction is pattern-by-exact-form: a passcode written with a space (`Passcode 778899`, `pwd abc123`), as JSON, camelCase, zero-width split, newline split or percent-encoded goes straight into the title and body, along with meeting IDs, PINs, phone numbers and API-key-like strings, and the raw sessionKey is copied to the output. These titles come from strangers' invitations, so this is the primary threat. The fix is cheap (normalise, then redact more broadly or echo an allow-shaped prefix only) and the ISS-R1ALERTS-001 evidence is the regression floor. Low observations (not issues): throwing-getter input, inherited fields accepted, retention re-alert above 500 live situations, ambiguous fall-back hour.

---

# Cycle 1

VERDICT: FAIL
Cycle checked: 1
Unit commit: f3c1da6 (lane/r1alerts). Tested bytes: alert-text.ts blob 74d2064094d484757659f42583ed53c0dcfe17bb (equal to `git rev-parse HEAD:` after all mutations).

Reason: every recorded reproduction of ISS-R1ALERTS-001..005 is refused, and the id, zone, totality and linearity fixes hold. But the secret-keyword mask hides ONE token, so multi-word passcodes and passcodes made of several short groups leak, and Hindi and synonym keywords are not recognised (ISS-R1ALERTS-006, high). ISS-R1ALERTS-001..005 are NOT marked verified; they stay open until 006 is fixed.

## Commands (node per toolchain note; every test command under `timeout`)
- `timeout 170 node --test --import tsx src/calendar/alert-text.test.ts` -> tests 20 / pass 20 / fail 0
- `timeout 170 node --test --import tsx src/calendar/attention-alerts.test.ts` -> tests 10 / pass 10 / fail 0
- `tsc --noEmit -p tsconfig.json` (packages/meeting-bot, 180 s timeout) -> exit 0
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (111 dir(s) within budget)`
- Non-blank lines: alert-text.ts 119, attention-alerts.ts 180, alert-text.test.ts 301, attention-alerts.test.ts 129 (match the budgets).
- Calendar directory: this lane has 22 files; the main branch (codex/machine-migration-2026-10-09) has 22, none of this lane's four (alert-text.ts and .test.ts, attention-alerts.ts and .test.ts). After merge: 26 files, under the limit of 30.
- Purity: imports are `node:crypto` (hash only), `@lkb/core` (type only) and `./alert-text.js`. No I/O.

## D-015 (independent replay, verbatim, skipped route AND job route; the whole alert JSON incl. id and key searched for each secret)
| Issue | Result |
|---|---|
| ISS-R1ALERTS-001 | 21/21 refused (16 listed forms, with each of the six zero-width splitters) |
| ISS-R1ALERTS-002 | 2/2: recorded key as skipped key and as job-map key; "SKEY", "zoom", "evil", "ACTION" and newline absent; retained dedupe key `attn:overlap-lost:6ccc15d8a9f457a3e048` |
| ISS-R1ALERTS-003 | 4/4: America/New_York, America/Los_Angeles (2026-03-07 23:30), America/Argentina/Buenos_Aires, undefined -> "(UTC)" |
| ISS-R1ALERTS-004 | 2/2: the three colliding keys -> 3 distinct keys and 3 fresh; two keys differing at char 201 -> 2 keys |
| ISS-R1ALERTS-005 | partly: strip mutation M2 now killed, but the fixed-point mutation M5 survives (ISS-R1ALERTS-007) |

## Leak table (extended attacks; title field unless stated; sanitiser output)
| Input | Output | Leak |
|---|---|---|
| `passcode: tiger seven blue` | `passcode (hidden) seven blue` | YES "seven blue" |
| `password is correct horse battery staple` | `password (hidden) horse battery staple` | YES |
| `code abc def ghi` | `code (hidden) def ghi` | YES |
| `secret word: banana` | `secret (hidden) banana` | YES |
| `PASS CODE: 12 34`, `passcode 12 34` | `PASS CODE (hidden) 34` | YES "34" |
| `pin 4 2 1 7` | `pin (hidden) 2 1 7` | YES |
| `OTP 42 17` | `OTP (hidden) 17` | YES |
| `Pass: 42 17`, `pw 42 17`, `pass 42`, `pw: tiger`, `psw tiger`, `passkey tiger`, `login: tiger` | unchanged | YES (keyword not in list) |
| `kood 12`, `kód 42`, `mot de passe tiger`, `contraseña tiger` | unchanged | YES |
| Hindi `पासकोड: 12`, `पिन 42`, `कोड tiger`, `पासवर्ड tiger seven` | unchanged | YES (Hindi keywords absent) |
| `p i n 42`, `P.I.N. 42` | unchanged | YES |
| `1 2 3 4 5`, `12 34 5`, `12.34.5` (5 digits, no keyword) | unchanged | below the 6-digit threshold (low) |
| `glpat-abcdefghij`, `Bearer abcdefghijkl`, `SG.abcdefghij.klm` | unchanged | letters only, under 24 chars, unknown prefix (low) |
| `१२३४५६`, `١٢٣٤٥٦`, `12३४56`, `७७८८९९`, circled and superscript digits | `(hidden)` | no: non-ASCII digits are masked as digits |
| `passcode` + newline + `tiger`, `passcode 😀 tiger`, `code: (hidden) tiger` | value masked | no |
| `bob at evil dot example`, `zoom us j 9876543210 pwd abc`, `l23456`, `Zm9vYmFy`, `ghp_abcdef` | masked or harmless | no |
| startTimes value `Mon Oct 12 2026 (pwd=Sekret9 https://zoom.us/j/1) 10:00` | field `alert.startTime` echoes it raw (V8 Date.parse ignores parenthesised text); the body line is formatted | YES, field startTime (ISS-R1ALERTS-008) |

Other free-text fields: reason (known set or "unspecified"), map key (hashed), body "Starts:" (formatted) are clean.

## Fixed point and iteration cap
200,000 seeded fuzz strings over 42 fragments: at most 3 rounds were needed; the cap is 5 and a non-converging input returns `(hidden)` (fails closed, never partial text). No output held a 3-digit run outside placeholders. Output is not idempotent only where a `%` is created by removal (for example `34%|1=code=`); it is plain text and never decoded again: harmless.

## Id, zone, totality (cycle-0 properties)
- id: 80-bit SHA-256 prefix of UTF-16LE; same key gives the same id; lone surrogates `\ud800` and `\ud801` hash without throwing and differ; colliding triple distinct; the raw key is absent from every alert field and from the `selectNewAlerts` keys. (A hash of a low-entropy key is confirmable by someone who knows it: irrelevant, the operator chat is trusted.)
- zone: IANA names printed unchanged; `UTC` + newline + `ACTION REQUIRED`, `Asia/Kolkata` + newline, `America/New York`, a 70-char string, a number, an object, empty -> "(UTC)" with the UTC time.
- Bodies always 4 lines (LF, CR LF, U+2028/2029, NEL in titles); unknown reasons not echoed; the 80-code-point cap never splits a surrogate pair or leaves a dangling mark (12 cut positions); order deterministic; selectNewAlerts retention oldest-first; null, cyclic, frozen, throwing-getter and Proxy inputs counted, never thrown.

## Timing (neutralizeText on 4,000-unit titles; the `raw.slice(0, 4000)` cap runs before sanitize, in code)
35 adversarial shapes (http://, a=, nested brackets and parens, digit plus separator, %, %2, %25, combining marks, `key ` x1000, `passcode ` x1000, `(at)`, `[dot]`, mixed script, zero-width, sk-, eyJ, lone surrogates, NFKC expansions, ...): worst 2.0 ms (`passcode ` repeated); most under 1 ms.
Scaling of unsliced `sanitize`, ms at 10 KB / 100 KB / 1 MB: mixed-script 13/53/587; `passcode ` 7/43/413; `key ` 7/43/593; `1 ` repeat 3/39/618; combining marks 4/90/537; `%25` 2/65/314. Linear (no super-linear step). Regexes read: no nested quantifier over an overlapping class; tokens come from split(" "). The 1500 ms guard is generous; measured 1 MB worst 0.6 s.

## Readability (30 realistic titles; what the operator reads)
All 30 stay identifiable (18 unchanged, 12 altered). Examples:
- `Study in Canada 2026 intake webinar` -> `Study in Canada (hidden) intake webinar`
- `Key takeaways from the Australia visa changes` -> `Key (hidden) from the Australia visa changes`
- `Code of conduct for student visa applicants` -> `Code (hidden) conduct for student visa applicants`
- `Pin code areas: how to find housing near campus` -> `Pin (hidden) areas: ...`; `Token economy in classrooms` -> `Token (hidden) in classrooms`
- `GRE Quant Masterclass - 330+ Score Plan` -> `... - (hidden)+ Score Plan`; `Webinar on 12/10/2026: ...` -> `Webinar on 12/10/(hidden): ...`; `Student Visa Interview Prep | Day 3` -> `... Prep Day 3`
Pure Hindi and Hinglish titles (for example `विदेश में पढ़ाई: कनाडा वेबिनार`, `UK student visa kaise apply karein? Live session`, `कोड ऑफ कंडक्ट और वीज़ा नियम`) are unchanged. View: the "Key takeaways" masking is an acceptable cost; the event stays identifiable. Converse gap: the Hindi keywords are not masked (ISS-R1ALERTS-006).

## Mutations on alert-text.ts (per-mutation byte backup, timeout 150 s, trap restore, cmp and hash after each)
| Mutation | Result |
|---|---|
| M1 skip NFKC | killed (1 fail) |
| M2 skip invisible-character strip | killed (2 fail) |
| M3 digit threshold off | killed (7 fail) |
| M4 keyword-value mask off | killed (8 fail) |
| M5 no fixed-point repeat (`return t` on the first pass) | SURVIVED 30/30 (ISS-R1ALERTS-007) |
| M6 allowlist keep-step identity | killed (3 fail) |
Final `git hash-object` of alert-text.ts = `git rev-parse HEAD:` = 74d2064094d484757659f42583ed53c0dcfe17bb.

ISSUES-WRITTEN: ISS-R1ALERTS-006 (high), ISS-R1ALERTS-007 (medium), ISS-R1ALERTS-008 (medium)

EXPLANATION: The allowlist rebuild genuinely closes the cycle-0 corpus and is fast and linear. It still fails on two points the brief named as in scope. Non-ASCII digits are fine (Nd is masked as digits). But the secret-keyword mask reaches one token, so "passcode: tiger seven blue" prints "seven blue" and "pin 4 2 1 7" prints "2 1 7"; the keyword list also lacks pw, pass, psw, access code and every Hindi spelling. For an Indian-English and Hindi corpus, पासकोड, पिन or कोड followed by a value is realistic. Fix direction: mask the rest of the clause after a keyword, widen the keyword list, store startTime as ISO. Low notes: pure-letter tokens under 24 characters and spaced 5-digit groups without a keyword pass; a keyword spelled with interior punctuation (`p-a-s-s-c-o-d-e`) is not caught (the maker listed this). Re-submit with 006 fixed and its row replayed verbatim.
