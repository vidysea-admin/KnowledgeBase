# Verdict — iss-capture-001-trusted-sender-domain-spoof

VERDICT: PASS
Cycle checked: 1
Scope: maker commit 451edce (lane/capture). Contract `qa/contracts/iss-capture-001-trusted-sender-domain-spoof.md` C1-C9. Security class (auth/trust gate), uncapped, full check. Probes ran in the scratchpad `iss001-check/` (probe.ts, probe2.ts, probe3.ts, mutate.ps1, old-policy.ts = `git show 32349dc:.../auto-record-policy.ts` with its one relative import made absolute); nothing was checked out.

## Independent results

Tests (lane `packages/meeting-bot`, `node --test --import tsx`): trusted-sender 6/6, webinar-policy 19/19, auto-join 33/33, join-rules 24/24, schedule-tick 14/14, schedule-state 18/18, task-scheduler 26/26. `tsc --noEmit -p tsconfig.json` exit 0.

- C1 PASS. **`ISS-CAPTURE-001: 3/3 refused`** on my own probe (default config: emails karunn@/umeshsugara@vidysea.com, domains theoutreachcollective.in, ashoka.edu.in). The same three inputs against the pre-fix function (32349dc): **3/3 TRUSTED** before, so the defect was real. Recorded inputs: (a) `("evil@x.com@ashoka.edu.in", undefined)` [row], (b) `("evil@x.com","ashoka.edu.in")` [row], (c) `("x@ashoka.edu.in@evil.com","ashoka.edu.in")` [t037 verdict]. The maker's regression block uses exactly these three, verbatim, and asserts each false. No recorded reproduction left open.
- C2 PASS. Probe: `("", A)`, `(undefined, A)`, `(null, A)`, `("notanemail", A)`, `("ashoka.edu.in", A)`, `("@ashoka.edu.in", A)`, `("karunn@vidysea.com","evil.com")`, `("a@evil.com", A)`, `("a@ashoka.edu.in","evil.com")`, `("a@ashoka.edu.in","")` all false (old: true for all but the last two and the empty-domain one).
- C3 PASS. About 130 inputs, 0 unjustified trust, 0 throws. Refused: multi-@ in every position (`a@b@A`, `a@A@evil.com`, `@@A`, `a@A@`, 3 @, `a@evil.com@A` with and without a supplied domain), display-name, `<addr>`, quoted local, quoted-with-@, comment (3 positions), route-address, group, leading/trailing space, tab, CR, LF, CRLF+Bcc, NUL (end and mid), DEL, VT, FF, NBSP, ZWSP, ZWJ, BOM, RLO, RLI, LRM, soft hyphen, Cyrillic o/a, Greek omicron, fullwidth letters and `@` (by escape, probe2), fullwidth/ideographic dots, Kelvin sign, dotless i, tag characters, combining mark, lone surrogate, emoji, `xn--` look-alikes, `ashokä`, trailing/leading/double dot, `%`-encoded forms (`a@%61shoka...`, `A%00`), 400-char local part, 300-char label, ip-literal and bare-ip domains, and non-strings (null, number, object, array, object with toString/valueOf, `new String`, boolean, function, symbol, bigint) for email and, with a valid trusted email, for the domain argument (old function THREW on number/object/array/boolean in either argument; new returns false). Accepted, all legitimately: mixed case, `a+b@`, `o'brien@`, `a!b@`, `a|b@`, `a%evil.com@ashoka.edu.in` and `a%40evil.com@ashoka.edu.in` (single @, real mailbox at ashoka.edu.in, percent is just a local-part character), a supplied domain padded or with a trailing dot/newline that normalises to the email's own domain (cannot grant trust; email must itself be valid and trusted).
- C4 PASS. Look-alike suffix/prefix/subdomain (`A.evil.com`, `evil.A`, `evil-A`, `sub.A`, `xashoka`, `mail.vidysea.com`, `karunn@vidysea.com.evil.com`) false; `other@vidysea.com` false (email-level entries only). Config edge cases: empty config, `@ashoka.edu.in`, `*.ashoka.edu.in`, `*`, empty strings, padded entries, trailing-dot entries, upper-case entries (never lowered by the function; `loadTrustedSenderConfig` lowers) and multi-@ entries grant nothing; duplicates harmless. A config object with no `emails` array throws (as the old function did; the loader always supplies both).
- C5 PASS. See caller table. Every real shape that was trusted before is trusted now; the only previously trusted shapes now refused are the attack shapes plus exotic ones listed under Regression.
- C6 PASS. `git show 451edce -- join-rules.ts`: +15 lines, 0 deletions, one new exported function; `join-rules.test.ts` 24/24.
- C7 PASS. See "Changed expectations".
- C8 PASS with notes. See mutation table.
- C9 PASS. `git show --stat 451edce`: `auto-join.test.ts`, `auto-record-policy.ts`, `join-rules.test.ts`, `join-rules.ts`, `trusted-sender.test.ts` (all `packages/meeting-bot/src/calendar/`), `qa/issues.capture.jsonl` (+1 line), the manifest. Nothing in `apps/api`, other packages or hot files.

## Caller-shape table (regression risk to legitimate senders)

| Caller (file:line) | What it passes | Trusted before | Trusted after |
|---|---|---|---|
| `auto-join.ts:184` via `normalizeCandidate` (`auto-join.ts:85-86`), Gmail candidates, `senderEmail`/`senderDomain` from `apps/api/src/gws-gmail.ts:257-259` (`extractEmail(From)` = `FROM_RE` match on the trimmed header, lower-cased; domain = `split("@")[1]`) | bare lower-case address plus its domain | yes | yes |
| same, From `Name <addr>`, `"Last, First" <Addr>`, `<addr>`, padded `  addr  `, `Name<addr>`, RFC2047 `=?UTF-8?B?..?= <addr>`, non-ASCII display name, `"addr" <addr>`, mixed case (probe3 replicates `extractEmail`/`FROM_RE` verbatim) | `extractEmail` strips display name/brackets/padding and lower-cases, so the gate gets a bare address | yes | yes (all 13 shapes identical old/new) |
| same, From `addr (Name)`, `addr.` (trailing dot), `A <a>, B <b>` list | whole header or the last address | no | no (unchanged) |
| same, From `x@ashoka.edu.in@evil.com`, `Evil <x@ashoka.edu.in@evil.com>` | multi-@ string, domain `ashoka.edu.in` | **yes (spoof)** | no |
| `auto-join.ts:184` via `normalizeCalendarEvent` (`auto-join.ts:69`), calendar events: `sender: e.organizer`, `senderDomain` undefined; organizer = Google `organizer.email` (`apps/api/src/gws-calendar.ts:163`), a bare address | bare address, no domain | yes | yes |
| `schedule-tick.ts:25-26,53-54` (rows carrying `senderEmail`/`senderDomain` from the same API) | email and domain, both required strings | yes | yes (agree) |
| `classifyWebinarInvite`, `selectAutoRecordItems` other paths | `grep isTrustedSender` over the repo (excluding tests): only `auto-join.ts:184` (+ re-export `:14`) calls it; the policy functions do not | n/a | n/a |
| Any caller passing a domain with NO email | none exists (Gmail rows always have both; `fetchOne` drops mail with no `@`) | would have trusted | refuses; unreachable in practice |

Result: no functional regression for a genuine trusted sender on any real caller shape. Newly refused exotic shapes (judged low, EXPLANATION only): an internationalised (non-ASCII) local part at a trusted domain, and an address longer than 320 characters (cap). Calendar `organizer` and Gmail addresses of that kind are not in the config defaults and I found no caller that produces them.

## Changed expectations (git diff 32349dc 451edce -- '*.test.ts')
1. `auto-join.test.ts` "explicit domain wins even if email itself isn't in the list": asserted `isTrustedSender("random@random.example","ashoka.edu.in")` true. That is recorded reproduction (b) in a different spelling, i.e. the unsafe behaviour; no caller needs it (every real caller passes an agreeing pair). Justified. The replacement asserts false for the mismatch and true for an agreeing pair (`random@ashoka.edu.in`, `ashoka.edu.in`).
2. `join-rules.test.ts` "documented deliberate divergence": asserted `isTrustedSender("evil@x.com@ashoka.edu.in")` true, which is reproduction (a), the documented-as-deliberate flaw. Justified. The engine assertion and the `"a@ashoka.edu.in "` padded assertion on the next lines are unchanged.
No other assertion is weakened or removed: the test diff is 8 + 6 changed lines in those two files plus the new 82-line file.

## D-015 count
`ISS-CAPTURE-001: 3/3 refused` (pre-fix function: 3/3 trusted).

## Mutation table (per-mutation byte backup in scratchpad, try/finally restore, 60 s process timeout, `git hash-object` vs `git rev-parse HEAD:` after every restore; run files trusted-sender + auto-join + join-rules = 63 tests)

| # | File | Mutation | Result |
|---|---|---|---|
| M1 | policy | invalid email -> supplied domain grants trust | KILLED (3 tests) |
| M2 | policy | skip supplied-domain agreement check | KILLED (1) |
| M3 | join-rules | accept multi-@ (last two segments) | KILLED (4) |
| M4 | join-rules | drop lower-casing | KILLED (5) |
| M5 | policy | allow subdomain match | KILLED (2) |
| M6 | join-rules | drop printable-ASCII check | KILLED (1) |
| M7 | join-rules | drop `<>(),;:"\` rejection | SURVIVED (63 pass) |
| M8 | join-rules | accept repaired input (drop `n !== lower`) | KILLED (2) |
| M9 | policy | email-or-domain -> email-and-domain | KILLED (9) |
| M10 | policy | compare supplied domain un-normalised | KILLED (1) |
| M11 | join-rules | drop 320 length cap | SURVIVED |
| M12 | policy | also trust on supplied domain alone | SURVIVED, equivalent: the agreement check returns false first, so supplied domain == parsed domain on that line |

No timeouts. M7 was first mis-applied by my own shell quoting (pattern not found, nothing mutated) and re-run with the correct pattern. Final check: join-rules.ts hash-object = HEAD blob `7a57178c12d9ce851a81afe2ec23915d064b6a13`; auto-record-policy.ts hash-object = HEAD blob `f8f0eeebbdbb3de641726f28478f215b740df2b0`; `git status --porcelain=v1` clean (before my own ledger/verdict/contract edits).

M7 analysis: with the special-character regex removed, the only extra accepted inputs are single-@ addresses whose local part contains quotes, parentheses, commas, colons, semicolons or backslashes (e.g. `"a"@ashoka.edu.in`, `a(c)@ashoka.edu.in`); the domain is still exactly the trusted one, and anything with `<` or `>` in the domain fails the domain regex, multi-@ forms (route-address, quoted `@`) fail the one-@ rule. So M7 produces no unjustified trust; it is a strictness test gap (low). M11 is likewise non-security.

## Remaining risks and ISS-CAPTURE-003
- **Sender authentication is not consulted anywhere on this path.** `grep` over `apps/` and `packages/` finds no read of `Authentication-Results`, SPF, DKIM or DMARC; `gws-gmail.ts` pulls `From` by regex only. A genuine-looking forged `From: x@ashoka.edu.in` is still trusted (ISS-322, high, open; the manifest states this correctly).
- **ISS-333 is untouched and the manifest says so correctly.** `store.ts:172` sets `auto_approved` from `getTrustedSender(tenantId, candidate.senderDomain)` and `auto-join.ts` `preTrusted` skips `isTrustedSender` entirely.
- **ISS-CAPTURE-003 is accurate** (`gws-gmail.ts:259` is `senderEmail.split("@")[1] ?? ""`; the stored/returned domain for `x@ashoka.edu.in@evil.com` is `ashoka.edu.in`) **but under-rated as medium**. Because the same wrong domain feeds `store.ts:172` (DB auto-approve) and `store.ts:193` (`recordSenderApproval` increments the approval count for the wrong domain), the multi-@ spoof still reaches auto-record through the DB path for any domain that has earned `autoApprove`, bypassing the function fixed here. My view: **high**, the same class as ISS-322/333, and should be worked together with ISS-333. The row is not edited (maker's row; same convention as the t037 cycle-1 note on CAPTURE-001).
- The fix does what ISS-CAPTURE-001's `fix_direction` asked (reject domain/email mismatches in `isTrustedSender`). It closes the config-allowlist route only; the end-to-end exploit is closed only when ISS-CAPTURE-003 and ISS-333 are fixed.

## Not verified
`apps/api` tests (lane `apps/api` resolves `@lkb/meeting-bot` to MAIN's source, per the manifest); real Gmail behaviour for an unquoted double-@ From header (whether Gmail delivers it); full suites; no real Gmail/calendar/browser.

### Ledger
ISS-CAPTURE-001 set to `verified` (fixed and verified 2026-10-10, commit 451edce, regression_check filled with the 3/3 count). Severity: my view is high (live Gmail path, bypass of the auto-record gate, adjacent to ISS-322/333); the row said medium and is left as filed apart from status. ISS-CAPTURE-003 left open as filed.

ISSUES-WRITTEN: none
EXPLANATION: The new gate is derived only from a strictly parsed address: one `@`, printable ASCII, no bracket/quote/comma/colon characters, a valid multi-label domain with no repair, and the supplied domain must equal the address's own domain, so it can no longer add trust. On about 130 adversarial inputs plus the config edge cases there is no unjustified trust and no throw, and the three recorded reproductions that the old function trusted are refused 3/3. Every real Gmail `From` shape (display name, brackets, padding, mixed case, RFC2047) is reduced to a bare address upstream and is still trusted, and calendar organizers are bare addresses, so no legitimate sender is lost; the two changed test expectations encoded exactly the unsafe cases. The mutation check kills 9/12, with one equivalent survivor and two non-security survivors (the special-character regex is redundant with the one-@ and domain rules, and the length cap), noted here as low test-strictness gaps rather than issues. The bigger finding is outside this unit: the upstream `senderDomain` split still drives the DB auto-approve path, so ISS-CAPTURE-003 deserves high severity and joint work with ISS-333; sender authentication (ISS-322) remains absent from the whole path.
