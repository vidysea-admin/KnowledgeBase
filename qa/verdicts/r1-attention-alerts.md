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
