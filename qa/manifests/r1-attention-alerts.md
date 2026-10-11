# Manifest — r1-attention-alerts

**Lane:** R1ALERTS (branch lane/r1alerts, base 7f352eb). **Fix cycle:** 1
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

Status: ready-for-check
Fix cycle: 1
