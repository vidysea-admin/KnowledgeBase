# Contract — r1-attention-alerts (written by checker, cycle 0)

Ground truth for the WIRING unit that will connect `packages/meeting-bot/src/calendar/alerts/attention-alerts.ts` (moved from `calendar/` on 2026-10-11, unit r1-alert-title-policy-and-reasons; `alert-text.ts` moved with it) to a sender. The maker must not edit this file.

## The wiring unit MUST supply
1. `timeZone`: explicit IANA zone from config (e.g. Asia/Kolkata); never the machine zone.
2. `now` (ISO) from the tick clock.
3. `startTimes` keyed by sessionKey for every skipped item (SkippedItem has no start time). Without it the alert says "start time unknown" and past-start items are not filtered.
4. For `untrusted-sender`: the alert cannot name the sender. To be actionable the wiring must pass a sender DOMAIN (validated hostname shape, not an address, not title text) through a separate field, or accept an alert saying only "an unapproved sender". Never splice raw sender text into the body.
5. Only module-controlled session keys (`cal:<id>`, `gmail:<id>`, `webinar-<hash>`, job ids) until ISS-R1ALERTS-002/004 are fixed; validate before calling.
6. Persist the `keys` returned by `selectNewAlerts` between ticks (the module keeps no state).

## The wiring unit MUST NOT
1. Add a meeting link, registration URL, or any job-row field other than those the module reads (status, reason, title, startTime) to alert text.
2. Send title/body through a `parse_mode` sender until ISS-R1ALERTS-001 is fixed and the residual characters `& ( ) . ! - = + ' " , : ; @ / ?` are handled (MarkdownV2 treats `. ! - = + ( )` as special; HTML needs `&` escaped).
3. Double-alert. The existing generic line in `scripts/webinar/run-pipeline-deps.mjs` (`notifyOperation` via `createOperationNotifications`, fingerprint `status:reason`) already fires for operation rows with status action_required and reasons needs-registration, overlap-lost, unsafe-join-link, retry-limit, etc. The new alert for the same job row has a different fingerprint (`attn:...`), so both would send. Wiring must suppress the generic send for the reasons this module handles (or send only the new one) and use the new path for skipped-only cases (untrusted-sender, no-join-link) that have no operation row.
4. Send an unbounded batch per tick (suggest <= 20, remainder summarised in one line). With more than 500 live situations the evicted keys re-alert every tick (verified: 100 fresh per tick, repeatedly).
5. Treat `ignored` as silent: log its counts.

## Acceptance for the checker of the wiring
- The ISS-R1ALERTS-001 evidence corpus re-run verbatim against the wired output: 0 leaks.
- One sent message per situation across ticks and across the generic plus new path.

## Cycle 1 additions (checker, 2026-10-11): pipeline rules and wiring requirements
Pipeline rules (alert-text.ts, allowlist): titles are NFKC-normalised, percent-decoded, look-alike slashes, colons and dots folded, whitespace to space, all Cc/Cf/Cs/Co/Cn and invisible marks stripped; URLs, bare domains with a path, emails (incl. `(at)`, `[dot]`, `at ... dot`), mixed-script tokens, key shapes, digit runs of 3+ (or groups reaching 6 digits, any Nd script), mixed letter+digit runs of 8+ and the secret-keyword value are masked; only letters (any script), marks, Nd digits, space and `. , : ; ' " ! ? ( ) / & + - %` survive; repeated to a fixed point (cap 5, else `(hidden)`); 80 code points. A secret keyword's value must be masked for the WHOLE clause, in English and Hindi spellings (open: ISS-R1ALERTS-006). A single-pass sanitiser must fail a test (ISS-R1ALERTS-007).
Wiring requirements:
1. `AttentionAlert.id` (hashed) replaces `sessionKey`; the consumer keeps its OWN id-to-sessionKey map (never put in the alert or in dedupe state) to act on an alert.
2. Supply `startTimes` for every skipped item and a validated sender-domain field for `untrusted-sender` (hostname shape, never title or address text). `startTime` must be ISO (ISS-R1ALERTS-008).
3. Suppress the existing generic `notifyOperation` line for every case this module handles (needs-registration, overlap-lost, unsafe-join-link, no-join-link, untrusted-sender, action_required rows): one message per situation across both paths.
4. Per-tick send cap (<= 20, remainder in one summary line); log `ignored` counts; persist the `keys` from `selectNewAlerts` and keep `maxKeys` above the live situation count.
5. Plain-text send only (no parse_mode); the ISS-R1ALERTS-001 and -006 corpora replayed verbatim against the wired output: 0 leaks.

## Cycle 2 amendment (checker, 2026-10-11): the guarantee this module can actually keep, and the wiring gate
**Stated guarantee (replaces any reading of "no secret ever reaches an alert").** `neutralizeText` is a deny-list. It guarantees: no URL or bare host+path, no email, no digit run of 3+ and no 2+-part digit group reaching 5 digits (any Unicode digit script), no key-shaped string, no mixed letter+digit run of 8+, and nothing from a RECOGNISED credential keyword (English, Hinglish, Devanagari, a few European spellings, spaced and camelCase forms, after normalisation) to the end of the title. It does NOT guarantee: a secret with no recognised keyword ("Webinar tiger"); a secret to the LEFT of the keyword ("tiger is the password", ISS-R1ALERTS-011); misspellings and joined forms ("pasword", "pincode", Devanagari with nukta, ISS-R1ALERTS-010); keywords in other languages (Russian, Korean, Japanese, Arabic, "mdp", "codigo"); leetspeak; all-Cyrillic or other single-script look-alikes; spelled-out digits; digit groups of 4 or fewer digits with no keyword. Those are ISS-R1ALERTS-009 (high) and cannot be closed by listing words.

Consequence: an alert's title is only as safe as "an operator who is already trusted with the meeting may see it". It is NOT safe for a channel wider than that.

**W8 (wiring gate, blocking).** No sender, notifier, scheduler hook or log sink may be connected to `buildAttentionAlerts` output until the Approver (Umesh) has ruled on ISS-R1ALERTS-009 in DECISIONS with one of: (a) ACCEPT the residual for a named operator channel (stating that titles come from invitations the organisation received and that the channel is operator-only); or (b) DROP the title from the alert and show only the headline, hashed id, start time and a non-sensitive identifier supplied by the wiring (calendar name, organiser display name). Until then the module stays unwired; `grep -rn buildAttentionAlerts` outside `packages/meeting-bot/src/calendar/alerts/` must stay empty (verified empty at 89d7a61).

**W9 (identifiability).** About one title in five can come back fully `(hidden)` (a title that starts with Key, Code, Pin, Token, Secret, Login, Pass, OTP: 8 of 40 realistic webinar titles in the cycle-2 measurement). The hashed `id` is not human-readable. The wiring MUST give the operator a way to resolve the alert to the meeting (an id-to-key map shown in the operations view, or a non-sensitive identifier per W8(b)); otherwise "Register for it yourself" cannot be acted on.

**W10 (SkipReason drift; MET by the r1-alert-title-policy-and-reasons unit, see Cycle 3).** `attention-alerts.ts` kept its own copy of the known skip reasons (11). Main now has 14: `opted-out`, `rule-denied`, `rules-unevaluable` (webinar-types.ts, T-037). At merge they would be counted under `no-alert-for-reason:other`. Not a leak. The merge or wiring unit must add them (preferably derive the set from the `SkipReason` type so drift is a compile error) and decide whether any of them needs a human alert.

**Acceptance additions for the wiring checker.** Replay verbatim against the wired output: the ISS-R1ALERTS-001, -006, -010 and -011 rows (those the code then claims to close), plus a fixed canary planted in every caller-supplied field of both routes (the cycle-2 field-echo check: 0 occurrences).

## Cycle 3 amendment (checker, 2026-10-11, unit r1-alert-title-policy-and-reasons at ece4219): title policy, rewritten wiring gate
Paths: all cites of `attention-alerts.ts` / `alert-text.ts` / their tests now mean `packages/meeting-bot/src/calendar/alerts/`. Older manifests and verdicts that say `calendar/` are historical and unchanged.

**What the code now offers.** `AttentionInput.titlePolicy`: `omit` (default) puts nothing title-derived in the alert (headline, formatted start, hashed id only); `masked` is the cycle-2 deny-list with the whole title hidden when a keyword appears anywhere. The cycle-2 "Stated guarantee" above describes `masked` ONLY. Under `omit` the guarantee is: no byte of the title, and nothing computed from it (length, hash), reaches any field; the hashed id is derived from the session key alone.

**W8 (wiring gate, blocking; wording replaced, NOT weakened).** No sender, notifier, scheduler hook or log sink may be connected to `buildAttentionAlerts` output by any unit until the Approver (Umesh) has ruled on ISS-R1ALERTS-009 in DECISIONS. The default `omit` policy is the only policy a wiring unit may use unless that ruling is (a) ACCEPT for a named operator-only channel, and then `masked` may be enabled for that channel only. `masked` may not be enabled for any sender without the Approver's written acceptance of the residual (no-keyword and misspelt-keyword secrets are NOT caught: ISS-R1ALERTS-009 and -010 remain open for `masked`). A wiring unit must set `titlePolicy` explicitly in its code and test that the sent text contains no title under `omit`. `grep -rn buildAttentionAlerts` outside `packages/meeting-bot/src/calendar/alerts/` must stay empty until then.

**W9 (identifiability; now a wiring precondition, ISS-ALERTFIX-001).** Under `omit` the operator sees headline, start time and a 20-hex id; no tool resolves the id to a meeting. This does not block the unwired formatter, but it blocks attaching ANY sender: the wiring unit MUST ship, in the same unit, an id-to-sessionKey lookup the operator can reach (operations view, API route or script) or a non-sensitive identifier per W8(b), and its checker must show an alert resolved to a meeting end to end. An alert that cannot be acted on is a functional defect of the default policy, and the default policy is what ships.

**W10 (SkipReason drift): MET.** The known-reason set derives from `SKIP_REASONS` in core (14 values; verified). The wiring unit still decides whether `opted-out`, `rule-denied`, `rules-unevaluable` deserve a human alert (today they are counted as ignored, not alerted).

**Acceptance additions.** Replay verbatim against the wired output under the policy actually used: ISS-R1ALERTS-009, -010, -011 rows; for `omit`, the sent text must equal the text for the same input with the title removed.
