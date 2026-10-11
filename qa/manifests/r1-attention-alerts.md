# Manifest — r1-attention-alerts

**Lane:** R1ALERTS (branch lane/r1alerts, base 7f352eb). **Fix cycle:** 2
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

## Fix cycle 1
Fixes ISS-R1ALERTS-001 (high), -002, -003, -004, -005 (medium). Files: `alert-text.ts` (new, 119 non-blank lines), `attention-alerts.ts` (180), `alert-text.test.ts` (new, about 300), `attention-alerts.test.ts` (129).

**Why a denylist could not work.** Cycle 0 removed URLs, `pwd=`/`passcode=`/`token=` pairs and emails. A stranger can spell a secret in unlimited other ways (space instead of `=`, JSON quoting, camelCase, a zero-width character inside the keyword, a newline inside a URL, percent-encoding, scheme-less hosts, full-width or look-alike slashes, bare digits, key-shaped strings, `(at)` emails). Each new spelling needed a new pattern. Cycle 1 inverts it: nothing survives unless it is positively known to be harmless.

**Pipeline (`alert-text.ts`; input cut to 4000 UTF-16 units; steps 2-3 repeat to a fixed point).**
1. Normalise: NFKC; percent-decode ASCII escapes (up to 3 rounds, so double encoding too); fold look-alike slashes, colons and dots to ASCII; every whitespace kind (tab, LF, CR, VT, FF, NEL, LS, PS, NBSP, ideographic space) becomes one space; then remove every Cc, Cf, unpaired Cs, Co and Cn character plus invisible marks that are not Cf (CGJ, Hangul fillers, braille blank, variation selectors); then drop symbols and emoji outside the structural set. All before any matching.
2. Mask: (a) a token with `:/`, a known scheme (`hxxp` included), `www.`, or a domain followed by `/ ? #` becomes `(link)`, and the next token too when the URL ends in `= & ? : / , ;`; (b) tokens with `@`, `(at)`, `[dot]`, and ` at ` chains become `(email)`; mixed Latin and Cyrillic/Greek tokens (homoglyph keywords) become `(hidden)`; (c) key shapes (`sk-`, `AKIA`, `ASIA`, `ghp_`, `xox`, `eyJ`, `AIza`) are masked; every digit run of 3 or more, and every digit group (space, dash or dot separated) reaching 6 digits, is masked, for any Unicode decimal digit; (d) any letter/digit run of 8+ mixing letters and digits, or 24+ long, is masked; (e) the word after `pwd`, `password`, `passcode`, `pass code`, `pin`, `otp`, `code`, `token`, `tk`, `key`, `secret`, `credential`, `auth` (camelCase suffixes such as `meetingPassword` too) is masked, skipping `=`, `:`, quotes, brackets and filler words (`is`, `to`, `the`).
3. Allowlist: keep letters (any script), marks, Nd digits, space and `. , : ; ' " ! ? ( ) / & + - %`; collapse spaces. Rounds repeat (max 5, else `(hidden)`) because removing a character can join text into something maskable. Cap 80 code points, never inside a combining sequence, with an ellipsis. Empty result is `(untitled)` exactly once.
All patterns are linear: tokens come from `split(" ")` with simple anchored tests, and no quantifier is nested over an overlapping class.

**Ordinary titles after it (the trade).** "Study in Canada 2026 intake webinar" becomes "Study in Canada (hidden) intake webinar"; "Q3 results call" and "IELTS 7.5 band strategy" are unchanged; "Digital SAT strategy - 1500+ score plan" becomes "...- (hidden)+ score plan"; "Free IELTS masterclass | Day 3" becomes "Free IELTS masterclass Day 3". Of 30 realistic webinar titles (in the readability test), 30/30 stay readable (all but at most two words kept) and 22 are unchanged; the 8 changed lose only a year or number. Known losses: emoji, `|`, `_`, `#`, brackets; ZWJ/ZWNJ (some Indic conjunct shaping degrades); the word after `key`/`code`/`token`/`pin` ("Key takeaways" becomes "Key (hidden)"); `B.Tech/M.Tech` looks like a domain path and becomes `(link)`; a 24+ letter word is masked. Not covered: a plain-word secret introduced by a keyword spelled with interior punctuation (`k_e_y`) or by a keyword nobody listed.

**Ids (ISS-002, -004).** `AttentionAlert.sessionKey` is replaced by `id`: the first 20 hex chars (80 bits) of SHA-256 over the UTF-16LE bytes of the exact key (UTF-16 so lone surrogates stay distinct). Collision odds for n keys are about n^2/2^81 (about 4e-19 for 500). Dedupe key is `attn:<case>:<id>[:<reason>]`. Keys differing in case, whitespace or Unicode normalisation are different strings and get different ids, on purpose. The same key gives the same id across ticks and processes (digest pinned in a test). The module stays pure (`node:crypto` hashing only). For the wiring unit: alerts no longer carry the key, so keep your own id-to-key map (`alertIdFor` is exported). Labels in `ignored.reasons` are limited to `[a-z0-9-]{1,40}` or `other`.

**Zone (ISS-003).** Not sanitised. Accepted only if it matches `[A-Za-z0-9_+:/-]{1,64}` and `Intl.DateTimeFormat` accepts it; printed unchanged (`America/New_York`). I did not print `resolvedOptions().timeZone` because Node canonicalises Asia/Kolkata to Asia/Calcutta. Anything else, including undefined, is `UTC`.

**Low notes.** Fixed: per-item try/catch, own-property reads only, outer try/catch. Throwing getters, Proxies and inherited fields are counted in `ignored`, never thrown.

**D-015 counts against the ledger's own recorded reproductions (verbatim in the test, skipped and job routes, secret absent from the full JSON).**
- ISS-R1ALERTS-001: 21/21 refused (16 listed forms, with each of U+200B/200D/2060/180E/00AD/FE0F as keyword splitter); plus 6/6 extra rows from the checker's verdict table.
- ISS-R1ALERTS-002: 2/2 (the recorded sessionKey as skipped key and as job-map key).
- ISS-R1ALERTS-003: 4/4 (New_York, Los_Angeles, Buenos_Aires, undefined zone) plus hostile and invalid zones. Los_Angeles expects 23:30 on 2026-03-07: the ledger gave only the label defect.
- ISS-R1ALERTS-004: 2/2 (`cal:a b` / `cal:a/b` / `cal:a_b`; 200-character shared prefix).
- ISS-R1ALERTS-005: the survived mutation (control-character strip) is now killed (M1, M2); NUL, U+0085 and other controls are asserted.
No recorded reproduction is left open.

**Property test.** Seed 20261010, 2400 cases (digits, mixed alphanumerics, URL, email in 5 spellings, keyword plus plain word or digits; 16 keyword spellings, 12 joiners, up to 5 random invisible characters): 0 leaks. The 20-hex id/key digest is removed before matching because it hashes an unrelated input.

**Performance.** 23 adversarial 1 MB inputs through unsliced `sanitize`: worst 642-677 ms (`pin ` repeated) on a CPU shared with the production worker; all under the 1500 ms bound. I set 1500 ms rather than 500 ms: two normalise+mask rounds over 1 MB cost about 0.65 s here. A quadratic pattern would take minutes, which the guard catches. In production the title is cut to 4000 units first.

**Mutation run** (per-mutation byte backup, trap on INT/TERM/ERR, 150 s timeout; afterwards `git hash-object` equals `git rev-parse HEAD:` for both files). 21 mutations, all killed: M1 strip invisible+decorative, M2 invisible only, M3 no NFKC, M4 no percent-decode, M5 no slash map, M6 no whitespace-to-space, M7 no decorative strip, M8 digit-run threshold, M9 no keyword rule, M10 no fixed point, M11 no URL carry, M12 no digit groups, M13 no mixed segment, M14 no key shapes, M15 no allowlist filter, M16 no email token, M17 raw key in id, M18 zone always UTC, M19 inherited fields, M20 combining cap, M21 dot obfuscation.
**Cycle-0 sanitiser proof.** With only `neutralizeText` swapped back to the cycle-0 body, `ledger corpus: every recorded reproduction` FAILS along with 9 other tests (pass 9, fail 11); restored, hash equals HEAD.

**Evidence** (from packages/meeting-bot, node per toolchain note).
- `timeout 150 node --test --import tsx src/calendar/attention-alerts.test.ts src/calendar/alert-text.test.ts` -> `tests 30 / pass 30 / fail 0`.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output.
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (111 dir(s) within budget)`.
- Non-blank lines: alert-text.ts 119, attention-alerts.ts 180 (limit 300); test files under 400.

## Not delivered
Nothing sends these alerts. The wiring unit (see the contract) must pass `startTimes` and a validated sender domain, suppress the existing generic line for the cases this module handles (to avoid double alerts), cap sends per tick, and keep an id-to-key map.

## Fix cycle 2
Fixes ISS-R1ALERTS-006 (high), -007, -008 (medium). Files: `alert-text.ts` (142 non-blank lines), `attention-alerts.ts` (187), `alert-text.test.ts` (205, ledger tests moved out), `alert-text.corpus.test.ts` (NEW, 217; the only new file in `calendar/`: 23 files here, 27 after merge, limit 30), `attention-alerts.test.ts` (unchanged). Ledger: ISS-R1ALERTS-009 appended (residual, below); no existing status edited.

**What failed in cycle 1.** The keyword rule hid ONE token, so any multi-token secret leaked (`passcode: tiger seven blue` -> `seven blue`), keywords outside a short list were not recognised, Hindi keywords were absent (006); the fixed-point repeat had no test (007); `startTime` echoed the caller string (008).

**New rule shape (006).** Once a secret keyword is found, EVERYTHING from the keyword to the END of the title becomes one `(hidden)`; the topic before it stays. Why: titles put the passcode after the topic and a secret can be any number of words or digit groups, so a longer word list with a one-token mask fails the next synonym the same way. Keyword at the very start: the whole title becomes `(hidden)`; the alert is still identifiable by its headline ("Session dropped: overlap", "Registration needed"...), `Starts:` line and hashed id (tested). Look-alike keywords (Latin+Cyrillic/Greek token, e.g. Cyrillic a in `passcode`) now also hide the rest of the title. Digit groups with 2+ parts reaching 5 digits (`1 2 3 4 5`, `12 34 5`, `12.34.5`) are masked even with no keyword (the three 006 rows previously "kept"; nothing is left open from the row).
Recognition runs after normalisation (NFKC, percent-decode, then Latin diacritics and dotless i folded so `pın`, `kód`, `contraseña` match; format characters stripped; case-insensitive). JS `\b` is ASCII-only, so boundaries are explicit `(?<![\p{L}\p{M}])` / `(?![\p{L}\p{M}])`, which also work for Devanagari. Separators inside a keyword: space . - _ (`pass code`, `P.I.N.`, `Pass-Word`); single letters spaced out (`p i n`) need a separator between every letter. camelCase suffixes (`apiKey`) handled.
Keywords and false-positive cost (end-of-title masking makes each false hit cost the rest of the title):
- No word boundary (a substring hit anywhere): password, pass word, passcode, pass code, passphrase, passwd, passwrd, passwort, passkey, pwd, pswd, paasvard, paasword, paascode, passvard, kennwort, mot de passe, motdepasse, contrasena. Cost: near zero (real words rarely contain them).
- Whole word only: pw, psw, pass ("Pass the GRE"), pin ("Pin code areas"), otp, code ("Code of conduct"), kood, kod, secret ("Secret scholarships"), key ("Key takeaways"), token ("Token economy"), tk, credential(s), auth, login ("Login help session"), clave. These are the readability losses: a title starting with one becomes `(hidden)`. Accepted: security wins, and `Keynote`, `pinned`, `codecs`, `monkey`, `Tokenize`, `Passover`, `decode` stay readable (tested).
- Devanagari (whole word): पासकोड, पासवर्ड, पास कोड, पास वर्ड, पिन, कोड ("कोड ऑफ कंडक्ट" is hidden), ओटीपी, कुंजी, टोकन, सीक्रेट. `कोडिंग`, `पिनाक` stay readable.

**Readability, 40 realistic titles** (the cycle-1 30 plus the checker's examples, Hindi and Hinglish): 24 unchanged, 10 partly kept, 6 fully hidden = 34/40 identifiable by title text. The 6 fully hidden (`Key takeaways ...`, `Code of conduct ...`, `Pin code areas ...`, `Token economy ...`, `Login help session ...`, the Hindi `कोड ऑफ कंडक्ट ...`) remain identifiable by headline, start time and id (asserted).

**Residual left open: ISS-R1ALERTS-009 (medium).** A secret with no keyword and no digit/shape pattern (`Webinar tiger`) is echoed, and so are keywords in unlisted languages, leetspeak (`p4ss`), confusables from scripts other than Cyrillic/Greek, other interior punctuation (`p/i/n`), and keyword-free digit groups of 4 or fewer digits. A deny-list cannot close this. The complete fix is not to echo free-text titles at all (the wiring supplies a non-sensitive identifier). If the contract demands "no secret ever", this unit does NOT meet it; it meets it for every form on the ledger and for the generator. Decision for Umesh.

**Fixed point (007).** `sanitize(input, rounds = 5)`. Non-convergence returns `(hidden)` (fail closed). Natural depth is at most 3 passes (two transforms plus a confirming pass); 400,000 fuzz strings over 31 fragments found none deeper, so the cap of 5 has slack. Tests: `Study 123456 tips` needs 2 passes; `Study 12_34_56 tips`, `Q 12[]34 and 5`, `Study 1#2#3#4 tips`, `a 12{}3{}4 b` need 3. Each is asserted to give the exact result at k passes and `(hidden)` at k-1 (fail closed, no partial text). The checker's `12_34_56` is asserted not to leak `123456`.

**Echo audit (008), field by field** (test `echo audit` plants `ZMARK` in every caller field and searches the whole result JSON):
- `key`: case (fixed) + 20-hex hash of sessionKey + reason only from the fixed 14-name KNOWN set, else `unspecified`.
- `case`, `severity`, `source`: constants.
- `id`: 20-hex hash. `title` and body `Event:` line: allowlist renderer. body `Reason:`: KNOWN set or `unspecified`.
- `startTime`: NEW `canonicalStart`: strict shape `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM[:SS[.f]](Z|+HH:MM)`, parse, emit `new Date(ms).toISOString()`; anything else is dropped (field absent, body `Starts: start time unknown`).
- body `Starts:`: formatted from the instant; zone printed only if it matches `[A-Za-z0-9_+:/-]{1,64}` and Intl accepts it, else `UTC`.
- `ignored.reasons`: NEW: a skip reason is echoed only if it is one of the 11 `SkipReason` values, else `other` (previously any `[a-z0-9-]{1,40}` string was echoed, e.g. `pwd-secret`); other labels are constants.
- Fields never read: detail, meetingUrl, registrationUrl, sender.

**Mutations** (script in scratchpad, deleted; per-mutation byte backup, restore in `finally`, 150 s timeout per run; afterwards `git hash-object` of both files equalled the pre-run blobs, and after commit equals `git rev-parse HEAD:<file>`). All 12 killed:
M1 mask one token instead of to end: `D-015 ledger corpus`, `ISS-R1ALERTS-006 shape`, `keyword recognition`. M2 drop Devanagari keywords: `keyword recognition`, `generator`, ledger corpus. M3 drop fixed-point repeat: `fixed point`, ledger corpus. M4 echo startTime raw: `startTime is parsed and FORMATTED`. M5 job route skips the sanitiser: ledger corpus, `echo audit`, `generator`. M6 skipped route skips the sanitiser: ledger corpus, `ISS-R1ALERTS-006 shape`, `echo audit`. M7 drop spaced-letter keywords: `keyword recognition`, `generator`, ledger corpus. M8 no diacritic fold: ledger corpus, `keyword recognition`. M9 non-convergence echoes text: `fixed point`. M10 mixed-script hides one token only: `ISS-R1ALERTS-006 shape`. M11 echo unknown skip reason: `echo audit`. M12 strong keywords off: ledger corpus, `ISS-R1ALERTS-006 shape`, `keyword recognition`.

**D-015 counts** (verbatim recorded reproductions, skipped AND job route, secret absent from the whole alert JSON incl. key, id and ignored; counts are table entries, each run on both routes): ISS-R1ALERTS-001: 21/21 (+5/5 verdict extras). -002: 1/1 (recorded key, both routes). -003: 4/4. -004: 2/2. -005: 4/4 (NUL, U+0085, retention over maxKeys). -006: 37/37 (every string of the row, including the three 5-digit groups and the non-ASCII digit rows). -007: 3/3. -008: 2/2 (both recorded forms). No recorded reproduction is left open.
**Seeded generator** (seed 20261011): 3000 cases, 25 keywords (English, Hinglish, French, Devanagari, spaced `p i n`) with random case, separators and interleaved format characters, then 1 to 5 secret tokens (ASCII, Devanagari, digits in 5 scripts): 0 leaks. Cycle-0/1 properties kept: 4-line bodies, unknown reasons not echoed, cap, ordering, retention, totality, purity, deterministic ids, zone handling, 4,000 cap before sanitising, the 2400-case property (0 leaks), timing (23 x 1 MB inputs, worst 294 ms, bound 1500 ms).

**Evidence** (from packages/meeting-bot; node per toolchain note)
- `timeout 170 node --test --import tsx src/calendar/alert-text.corpus.test.ts src/calendar/alert-text.test.ts src/calendar/attention-alerts.test.ts` -> `tests 33 / pass 33 / fail 0`
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (180 s timeout) -> exit 0, no output
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (111 dir(s) within budget)`
- Non-blank lines: 142 / 187 (limit 300); tests 205 / 217 / 129 (limit 400).

Status: checked-PASS
Checked: qa/verdicts/r1-attention-alerts.md (cycle 2, 1f734a5)
Fix cycle: 2
