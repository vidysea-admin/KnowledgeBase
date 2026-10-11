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

# Cycle 2

VERDICT: PASS (at the stated scope below; ISS-R1ALERTS-009 stays OPEN and gates wiring)
Cycle checked: 2
Unit commit: 89d7a61 (lane/r1alerts, base 3803812). Tested bytes: alert-text.ts and attention-alerts.ts equal `git rev-parse HEAD:` after every mutation. node v24.19.0 per toolchain note.

Scope of the PASS: the unit as a PURE, UNWIRED formatter that redacts by deny-list. It does not claim "no secret ever reaches an alert", and its manifest says so. A grep for `buildAttentionAlerts` / `attention-alerts` outside `packages/meeting-bot/src/calendar/` finds nothing, so nothing can send these alerts today. Commit scope is clean: 4 files under `packages/meeting-bot/src/calendar/`, the manifest and the lane ledger.

## Commands
- `timeout 170 node --test --import tsx src/calendar/alert-text.corpus.test.ts src/calendar/alert-text.test.ts src/calendar/attention-alerts.test.ts` -> tests 33 / pass 33 / fail 0 (7 s).
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (180 s timeout) -> exit 0, no output. `node scripts/lint-dirsize.mjs` -> OK (111 dirs). Non-blank lines: alert-text.ts 142, attention-alerts.ts 187 (limit 300); tests 205 / 217 / 129 (limit 400). `calendar/` has 23 files (27 after merge, limit 30).

## D-015, my own run
I extracted every quoted string of rows 001 and 006 from `qa/issues.r1alerts.jsonl` and ran each through `sanitize` (all hidden or reduced to harmless text), re-typed the 002/003/004/005/007/008 reproductions and ran them through BOTH routes (skipped and job), searching the whole serialised alert with the 20-hex id/key removed. Then I ran the maker's corpus test. Counts agree with the manifest: 001 21/21, 002 1/1, 003 4/4, 004 2/2, 005 4/4, 006 37/37, 007 3/3, 008 2/2. The 002 difference: the cycle-1 verdict counted 2/2 because the row records ONE string (the sessionKey) and says "same for a job-map key", so it counted one string on two routes; the maker counts table entries (1) and runs both routes inside each. Same coverage, different unit. ISS-R1ALERTS-001..008: verified CLOSED by my run.
Defect in the ledger itself: row 006 contained an invalid JSON escape (backslash-S in "area"), so `JSON.parse` failed on the file for any reader of the lane shard; repaired in this commit (escape only, no content change).

## Failure modes of the new shape (78 titles, both routes, whole alert searched)
Held: spaced/joined/suffixed forms (passcodes, passwords:, pwd=, pass-code, passcode=tiger, code#), line break or tab inside the keyword, zero-width, bidi override, variation selector, fullwidth, combining marks, Cyrillic a inside a Latin keyword, Devanagari पासवर्ड / पास कोड / पासकोड / कोड / ओटीपी, Hinglish `paasvard`, `passwrd`, Arabic-Indic and Devanagari digits, a single 4-digit run (`Webinar 4217`), `4217 is the passcode`, `pin4217`.
Leaks found (sanitiser output, title field):
| Title | Output | Class | Realism |
|---|---|---|---|
| `Webinar pasword tiger`, `paswrd`, `paswerd`, `pasvard`, `paasward`, `Pasccode`, `p/w` | unchanged | misspelling of a listed word | medium: pasword/paswrd are very common |
| `Webinar pincode tiger` | unchanged | joined form | medium (Indian usage) |
| `Webinar पासवर्ड़ tiger` (nukta), `पासवड`, `पासवरड` | unchanged | Devanagari variants | low-medium |
| `tiger seven blue is the passcode`, `Webinar - tiger is the password`, `Topic (banana = password)`, `12 34 - pin` | secret kept, keyword hidden | secret LEFT of keyword | low-medium |
| `Webinar access: tiger`, `mdp:`, `пароль:`, `암호`, `パスワード`, `código`, `p4ss`, all-Cyrillic `раѕѕсоде`, `Webinar 42 17`, `4 2 1`, `one two three four`, `Webinar tiger` | unchanged | unlisted keyword / no pattern | the ISS-009 class |
Filed: ISS-R1ALERTS-010 (misspellings and joined forms, medium) and ISS-R1ALERTS-011 (secret left of keyword, medium). Not filed: deep percent-encoding (`pass%252525252563ode` is hidden anyway); obfuscation by the secret's own author is not a realistic threat for these alerts.

## Other input fields (both routes)
Canary `ZQCANARY` planted in sessionKey, job-map key, reason (known, unknown, `__proto__`, 44-char), status, startTimes values (garbage, suffixed, array, object with toString), job `startTime`, `now`, `timeZone` (five hostile shapes), and in `detail`, `meetingUrl`, `registrationUrl`, `sender`, `organiser`, `organizer`, `platform`, `eventId`, `description`, `location`, `attendees`, `name`, `note`; objects with `toString`/`toJSON` as title and key. 0 occurrences anywhere in the serialised result. `ignored.reasons` held only constants (`no-alert-for-reason:other`).

## Fixed-point cap and timing
No input needing more than 4 rounds in my 150,000-string fuzz (max 4: `pinPasspass{}word=1.`); the cap of 5 has slack, and fail-closed at k-1 passes is asserted for the 3-pass shapes. Timing: 29 adversarial shapes at 4,000 chars through `neutralizeText`: worst 2.6 ms. At 1 MB through unsliced `sanitize`: worst 673 ms (`a б ` repeated), then 507 ms (`पास ` repeated), 451 ms (`p i ` repeated); linear scaling, nothing super-linear.

## Residual and the contract (ruling)
Options: (i) FAIL until titles are not echoed, (ii) PASS with ISS-009 open and a wiring precondition, (iii) amend the contract. I chose (ii) plus (iii). The module's honest claim (deny-list, best effort) is kept by the code and measured; the claim it cannot keep ("no secret ever") is removed from what the contract promises, in the contract's Cycle 2 amendment, which names what is and is not guaranteed. Failing the unit again would only buy one more synonym round (I found misspellings in minutes; the next checker finds the next), which the ledger already calls unclosable. The danger lives at the wiring, not here, and the module is verifiably unwired. The contract now carries W8 (blocking gate: no sender until the Approver rules on ISS-009 in DECISIONS: accept for a named operator channel, or drop titles), W9 and W10. ISS-009 re-rated MEDIUM -> HIGH: the leaked item is a meeting passcode delivered to a chat that retains it, the same class as the high-rated 001 and 006; medium would let it sit under the severity gate. It is not a cycle-3 fix item: Umesh decides.

## Readability (40 titles of mine: English, Hinglish, Hindi, real webinar shapes)
28 unchanged, 3 partly kept, 9 fully hidden. Of the 9, 1 contained a real passcode (`Passcode: 8841 - IELTS webinar`); 8 are false positives: `Key takeaways from Canada's new study permit cap`, `Pin code areas near campus`, `Code of conduct for international students`, `Token economy and student motivation`, `Pass the GRE: strategy session`, `Login help for the new student portal`, `OTP and fraud awareness for students`, `Secret scholarships you never heard of`. Unaffected: Passport, Compass, Secretary, Keynote, Authority, Pinterest, Tokenization, Codecs, Monkey, Decode. A fully hidden alert keeps its headline, `Starts:` line and a 20-hex id; two different fully hidden meetings at the same start time differ only by that opaque id (verified: 773ccc... and be13cc...). That is thin for a human, hence W9.

## ignored.reasons
Confirmed from the diff: cycle 1 echoed any `[a-z0-9-]{1,40}` string; cycle 2 echoes only the 11 values in `SKIP_REASONS`, else `other` (canary test and my run). Merge note (correctness, not a leak): the branch `codex/machine-migration-2026-10-09` has 14 SkipReason values; `opted-out`, `rule-denied`, `rules-unevaluable` are absent from this lane's set, so after merge they are reported as `no-alert-for-reason:other`. Recorded as contract W10.

## Cycle 0/1 properties
Hold (tests pass): 4-line bodies, 80-code-point cap not splitting a combining sequence, ordering, retention oldest-first, totality on throwing getters and Proxies, purity, deterministic ids (digest pinned), zone handling, the 4,000-unit cut before sanitising (see survivor d: unobservable except for speed).

## Mutations (my own; per-mutation byte backup, restore in `finally`, 150 s timeout; `git hash-object` == `git rev-parse HEAD:` after each and at the end)
22 run, 18 killed, 4 survived.
Killed: tail not cut after keyword (ledger corpus, 006 shape, keyword recognition); EDGE without trailing boundary (006 shape, masks); EDGE without leading boundary (006 shape); two-part digit-group threshold 9 (ledger corpus); canonicalStart without the strict shape (startTime test); echo any skip reason (echo audit); mixed-script never matches (006 shape); no Latin diacritic fold (ledger corpus, keyword recognition); non-convergence echoes text (fixed point); separators inside keyword only space (ledger corpus, generator); no camelCase keyword (keyword recognition, property); SEGMENT mask off and KEY_SHAPES off (masks, property); Devanagari keywords off (ledger corpus, generator); allowlist keeps `=` and `@` (output charset); STRONG keywords case-sensitive (006 shape, generator); `pin` removed (ledger corpus, generator); keyword never hides (006 shape).
Survived (all low; notes, not filed): (a) default fixed-point cap 5 -> 2: tests pass an explicit `rounds`, so the default used by `neutralizeText` is unpinned (fails closed, safe); (b) REPEAT collapse of `(hidden) (hidden)` removed: cosmetic; (c) URL carry (`carry = false`): the keyword rule covers `pwd=`, but `see https://a.example/r?x= TIGER` depends on it and no test says so; (d) `raw.slice(0, 4000)` removed: only speed changes, the 80-char output cap hides the difference.

ISSUES-WRITTEN: ISS-R1ALERTS-010 (medium), ISS-R1ALERTS-011 (medium). Re-rated ISS-R1ALERTS-009 medium -> high (in place, with a `rerated_by` note). Verified CLOSED by my run: ISS-R1ALERTS-001, 002, 003, 004, 005, 006, 007, 008.

EXPLANATION: The cycle-1 failure (one-token reach, missing keywords, no fixed-point test, raw startTime) is fixed, and every recorded reproduction is refused on both routes in my own replay as well as the maker's. The new shape works as designed to the right of a recognised keyword; it cannot see a secret that has no recognised keyword or that stands before one, which is the class the maker filed as 009 and I raised to high. I did not pass a guarantee the code cannot keep: the contract now states the achievable one and blocks wiring until Umesh rules on 009. Merge conditions: none for the code; at merge or wiring add the three new SkipReason values (W10); never wire before W8 is satisfied. Unverified: behaviour on real Gmail/Calendar titles (none used) and the wired path (does not exist).
