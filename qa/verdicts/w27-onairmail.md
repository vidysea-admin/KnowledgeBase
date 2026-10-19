# Verdict: w27-onairmail

VERDICT: FAIL
Cycle checked: 1
Reviewed SHA: 53f0d6cceaf0aa110470758b714905cfc9f0e727
Base SHA: a9b202b422af6436c52f61dc9850ecb12fd21fc4
Checker: independent (Sonnet 5.5), ship-mode re-check of fix cycle 1.

## Cycle 1 finding F2 (FAIL, in scope: sender gate) - a forged Authentication-Results header is accepted
- packages/meeting-bot/src/calendar/onair/onair-address.ts `dmarcPassesFor` loops over EVERY Authentication-Results header and returns true if ANY
  header with authserv-id mx.google.com has a `dmarc=pass` clause for the From domain. onair-gmail-fetch.ts passes all such headers (`headers(msg.payload,"authentication-results")`).
- An attacker simply includes their own `Authentication-Results: mx.google.com; dmarc=pass header.from=google.com` header. Gmail stamps its genuine result (dmarc=fail) on top, but the OR across headers still accepts the forged one.
- Probe (run, no network; fake gws runner): `dmarcPassesFor([forged, real-fail],"google.com")` = true; `[real-fail, forged]` = true;
  createOnairGmailLoader with real(dmarc=fail)+forged headers -> senderAuthenticated=true. Genuine-only -> true; real-fail only -> false; authserv-id other than mx.google.com -> false.
  The attacker then also needs a From of x@google.com (trivially spoofed, no DKIM needed), so the gate is fully bypassed for a spoofed google.com sender (impact bounded to cloudonair event slugs/windows, but it is the D-178 control).
- Fix: trust only the receiver-stamped header: take the FIRST (topmost) Authentication-Results header only, require authserv-id mx.google.com, and evaluate its dmarc clause; do not OR across headers.
  Better, refuse (fail closed) if more than one Authentication-Results header carries authserv-id mx.google.com. Add regression tests for [forged, real-fail], [real-fail, forged].

## Cycle 1 verified OK
- Cycle 0 bypass (google.com.evil.com + quoted display name `"<a@google.com>" <x@google.com.evil.com>`): parseFromAddress -> x@google.com.evil.com; dmarcPassesFor false; senderIsGoogle ok:false. FIXED.
- Mixed-clause strings (`dmarc=fail header.from=google.com; x=dmarc=pass`, `dmarc=pass header.from=evil.com; dkim=pass header.from=google.com`) -> false. Multiple From headers -> senderAuthenticated false. Non-mx.google.com authserv-id -> false.
- Tests (timeout 600, node --test --test-force-exit --import tsx, cwd packages/meeting-bot), all exit 0: onair-address 4/4, onair-link-resolver 11/11, onair-mail-source 14/14, onair-mail-loader 8/8, schedule-tick 14/14. `tsc --noEmit -p tsconfig.json` exit 0.
- Resolver and flag-off paths unchanged since cycle 0 (diff touches only address/gmail-fetch/mail-source/tests/manifest); cycle 0 resolver probes and mutation stand.
- Not re-run: a fresh mutation (no source change to resolver). Not verified: live Gmail header ordering/format.

ISSUES-WRITTEN: none. Ledger rows may NOT be flipped; maker should fix F2 and request cycle 2.

---

# Superseded history (cycle 0)

Superseded VERDICT: FAIL
Superseded cycle: 0
Superseded reviewed SHA: de0fe97f238054cd655ef3de989bb14c91343efb
Base SHA: a9b202b422af6436c52f61dc9850ecb12fd21fc4
Checker: independent (Sonnet 5.5), ship-mode review, flag-off unit with network resolver.

## Finding F1 (FAIL, in scope: sender gate) - authenticated-google.com gate is bypassable
- packages/meeting-bot/src/calendar/onair/onair-gmail-fetch.ts `headerAuthenticated` (line ~25): `/\bdmarc=pass\b/` and `/\bheader\.from=google\.com\b/`
  are two independent substring tests on the whole header. `\b` matches before `.`, so `dmarc=pass ... header.from=google.com.evil.com` returns true
  (also true for `dmarc=fail header.from=google.com; x=dmarc=pass`, and `dmarc=pass header.from=evil.com; dkim=pass header.from=google.com`).
- onair-mail-source.ts `senderIsGoogle` takes the FIRST `<addr@host>` in From, which can sit inside a quoted display name.
- Composed (probe, run): Authentication-Results `mx.google.com; dmarc=pass (p=NONE) header.from=google.com.evil.com` + From `"<a@google.com>" <x@google.com.evil.com>`
  -> headerAuthenticated=true and senderIsGoogle(...,true) = {ok:true,email:"a@google.com"}. An attacker who owns any domain `google.com.<theirs>` with valid DMARC passes the gate.
  Impact bounded (only cloudonair.withgoogle.com/events/<slug> can result; attacker picks the event and the window), but the gate is the stated D-178 control.
- Fix: parse Authentication-Results per method: split on `;`, require a `dmarc=pass` clause whose OWN `header.from=` token equals `google.com` exactly (token end must be whitespace, `;` or end; no trailing `.`);
  take only the first (receiver-stamped) header and check authserv-id is the receiver. Parse From with a real address parser (last/angle-bracket address outside quotes, single address only), reject if more than one address,
  and require header.from domain === From domain === google.com. Add regression tests for the three strings above.

## Verified OK
1. Resolver safety. GET only (pinnedRegistrationGet reused, not edited; fixed headers, no cookie header, agent:false). DNS private-address refusal, DNS pin, 256 KiB cap, 15 s deadline, 3 hops all applied.
   Probe (injected dns/get, no network), JS `redirecturl` set to: `https://cloudonair.withgoogle.com.evil.com/events/x`, `javascript:alert(1)`, `http://127.0.0.1/events/x`, `//cloudonair.withgoogle.com/events/x`,
   `//evil.com/events/x`, `/events/x`, `CLOUDONAIR.withgoogle.com.` , `%2e` host, `@evil.com`, `#@` forms -> all `refused:target`. Only exact `https://cloudonair.withgoogle.com/events/<slug>` resolved; query/fragment dropped. One GET per probe, no extra fetch of the OnAir host.
2. Sender gate: spoofed From with senderAuthenticated false/undefined -> ok:false (test + probe). Real header parser is flawed, see F1.
3. Flag off: `withOnairMailFromEnv`/`withOnairMailCandidates` return `base` itself unless `LKB_ONAIR_MAIL === "1"` (asserted by onair-mail-loader.test.ts lines 21,23); schedule-tick diff is import + loader wrap only; `createHttpCalendarLoader(...)` argument is a side-effect-free closure.
4. Fixtures: scanned onair-mail.fixtures.ts and tests; fake tokens (FAKE-*), example.invalid, google.com only; no real tokens or personal data.
5. Tests (each `timeout 600`, node --test --test-force-exit --import tsx, cwd packages/meeting-bot): onair-link-resolver 11/11, onair-mail-source 14/14, onair-mail-loader 7/7, schedule-tick 14/14, all exit 0. `tsc --noEmit -p tsconfig.json` exit 0.
6. Mutation (own, per-mutation backup, trap, timeout 600): in onair-link-resolver.ts replaced `u.hostname !== ONAIR_EVENT_HOST` with `!u.hostname.startsWith("cloudonair.withgoogle.com")` -> resolver test 10 pass / 1 fail (killed). Restored byte-identical (cmp);
   `git -c core.autocrlf=true hash-object` == `rev-parse HEAD:file` (c5276d22d9431051034abdb5786231eef16ea74f); working tree clean of tracked changes. Note: my trap used a relative backup path and errored once on ERR; the explicit restore had already succeeded and was hash-verified.

## Not verified
Live Gmail / real Authentication-Results formats; live network resolution; lint-loc --all (not required by brief); end-to-end tick trust rules for pending candidates.

## Ledger
ISSUES-WRITTEN: none. Ledger rows may NOT be flipped; maker should fix F1 and request cycle 1.
