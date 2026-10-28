# Manifest — guarded-fetcher

**Contract:** `qa/contracts/guarded-fetcher.md` (authored by the cycle-1 checker); extends
`watched-sources-entrypoint.md` invariant **[I3]**.
**Goal task:** T-027 / catalogue A13.
**Date:** 2026-09-08
**Fix cycle:** 3 of max 3
**Dual check:** no
**Issues addressed:** **ISS-C-UNRUN-WRITERS-002** (high, the SSRF control), and this cycle
**-006** (high), **-007** (high), **-008** (medium), **-009** (medium), **-010** (high).
**Status:** checked-PASS (cycle 3 — `qa/verdicts/guarded-fetcher.md`, commit `c8b0171`)
**Branch:** `lane/c-unrun-writers`

## ISS-C-UNRUN-WRITERS-010 first: this manifest did not exist for cycle 1

The checker found **no manifest, in the worktree or in git history** — a handshake violation, and I
dispatched a check without one.

Cause: the pre-commit hook is a **PreToolUse** hook. It saw `git commit` in the command string and
**denied the entire Bash call**, so the heredoc writing this manifest at the top of that same
command never ran either. I read the block as "the commit was refused" and re-ran only the commit.

Worth stating plainly because the lesson generalises: **a denied or failed tool call means nothing
in it happened**, not just the part that tripped the guard. It then happened a SECOND time while
writing this cycle — a two-heredoc command failed at bash parse time and the manifest silently did
not appear. Same class, twice in one unit.

## Why the unit exists

Watched Sources fetches a stored URL **on a timer, unattended, from inside the perimeter** — a
textbook SSRF surface. Per the cycle-1 ruling the control cannot live at registration, because a
store-time hostname check **cannot survive DNS rebinding**; it lives on the resolved address at
fetch time, with every redirect hop re-resolved.

`UrlFetcher` was **only a type** — no implementation existed — so this builds the fetcher and its
guard together. Guarding a fetcher that does not exist would repeat the `replaceOne` mistake.

## Fix cycle 2 — the guard matched TEXT, not addresses

> `64:ff9b::127.0.0.1` blocked. **`64:ff9b::7f00:1` — the same address — was allowed.**

The old code took the substring after the last colon and unwrapped it only when it looked like
dotted-quad, so every v4-embedding IPv6 prefix was blocked in one spelling and open in the other.
Reproduced before fixing: **6 of 9 probes were holes**, including `::ffff:7f00:1` (mapped
loopback), `2002:7f00:0001::1` and `2002:c0a8:0101::1` (6to4 to loopback and RFC1918), `fec0::1`,
and Teredo.

**Blocking one spelling of an address while allowing another is not a control.**

`isBlockedAddress` now **parses** into 8 groups — handling `::` expansion, dotted tails, brackets
and zone ids — and judges the numbers, unwrapping `::ffff:0:0/96`, `::/96`, `2002::/16` and
`64:ff9b::/96` onto their embedded v4.

### ISS-C-UNRUN-WRITERS-007 — a docstring overclaim worse than the gap

The old comment said *"the resolution the guard checks is the same one the caller will use."*
**That was false.** `request` re-resolves independently, so a check-to-connect window remains that
only connect-time pinning closes. An overclaim in a security docstring is worse than the gap it
papers over, because it stops the next reader from looking. Corrected, and the residual window is
now stated as a limit rather than denied.

`lookup` returns **all** addresses and every one must pass — the checker's reason is sharper than
rebinding: a host publishing one public and one private A record gets a **coin flip on every
fetch**, no timing required. An empty answer fails closed: "no addresses" must never read as
"nothing to object to".

### ISS-C-UNRUN-WRITERS-008 / ISS-C-UNRUN-WRITERS-009

`fec0::/10` is blocked. Response size is enforced on **every hop including redirects** — previously
asserted only on the final response, so a redirect chain could stream unbounded bodies.

## Evidence

```
$ pnpm --filter '@lkb/ingest' test   tests 75   pass 75   fail 0   (61 + 14 new)
$ pnpm -r typecheck                  exit 0
```

**Mutation table** (baseline 75/0), run under **D-020**: `timeout` on every mutation, restore in a
trap on EXIT/INT/TERM/ERR, `cmp`-verified after each.

| mutation | result |
|---|---|
| stop unwrapping 6to4 | **73 / 2** |
| stop unwrapping NAT64 | **73 / 2** |
| allow `fec0::/10` | **74 / 1** |
| check only the FIRST resolved address | **74 / 1** |
| allow an empty resolver answer | **74 / 1** |
| **no-op control** | **75 / 0** |

## Corrections to my own cycle-1 claims

- **The mutation count was wrong.** I reported the address-check mutant as 47/13; it is **48/13**.
  The checker caught that 47+13 does not sum to 61. Every other row was exact.
- **The encodings are blocked, but not by the mechanism I described.** I claimed `0177.0.0.1` and
  `2130706433` fail as unparseable. In fact `new URL` normalises them to `127.0.0.1` before my
  parser sees them — the fail-closed path is not what saves it. Right outcome, wrong reason.

## Known gaps

1. **The check-to-connect window remains** (ISS-C-UNRUN-WRITERS-007). Closing it needs a transport accepting a
   pinned address; the seam has no callers yet, so widening it later is cheap.
2. **No request timeout.** Part of ISS-C-UNRUN-WRITERS-009; belongs with the real transport.
3. **No real transport at all** — `request` is an injected seam. **A13 does not move.**
4. **No allowlist mode.** Deny-by-range only.

## Note to the checker

Attack the new parser rather than the old table: malformed `::` (`1::2::3`), over-long groups, more
than 8 groups, `::ffff:` with a bad tail, an all-zero 6to4, and IPv4-in-IPv6 spellings I have not
thought of. Also rule on gap 1 — is stating the check-to-connect window acceptable here, or must
`request` take the pinned address now, before the seam has callers?

---

# Fix cycle 3 — responding to the cycle-2 FAIL (ISS-C-UNRUN-WRITERS-009)

FAILed 6/7. One finding, and it lands on something I should not have shipped: **there was no
duration bound at all** on a fetcher whose entire purpose is to run unattended on a timer — in a
repo that has D-020 *because* an unbounded hang killed its test suite, a rule I wrote earlier the
same day.

Worse than the omission: **my manifest listed ISS-C-UNRUN-WRITERS-009 under "Issues addressed" while its own
Known-gaps section admitted the timeout was unfixed.** Only the redirect-hop third was done. A
manifest that contradicts itself is a worse defect than the missing feature, because it is the
document a checker is entitled to trust.

## What changed

- **One TOTAL deadline for the whole fetch**, redirects included. Not per request — N hops must not
  buy N timeouts, or a redirect chain quietly reinstates the unbounded wait.
- Each hop is given the **remaining** budget, and the transport is **raced** against it, so a
  transport that ignores its own `timeoutMs` still cannot hang the caller.
- **`maxBytes` is handed to the transport** in `opts` rather than only measured afterwards.
  Measuring `body.length` proves the oversized response was already allocated; a transport that
  knows the cap can abort the stream.

## The test file needed the same lesson applied to itself

Writing this cycle, my first "a hanging request is abandoned" test **hung the suite** — no
implementation existed yet, so the never-settling fake ran unbounded and the run had to be killed
manually. A test asserting *must not hang* that itself hangs is useless. Every cycle-3 test now
carries an explicit `{ timeout }`, so a missing implementation **fails** rather than hangs. **D-020
applies to test harnesses, not only to mutation runs** — I had read it as a mutation-only rule.

## Evidence

```
$ pnpm --filter '@lkb/ingest' test   tests 79   pass 79   fail 0   (75 + 4 new)
$ pnpm -r test                       apps/api 132/0, meeting-bot 40/0, all green
$ pnpm -r typecheck                  exit 0
$ pnpm lint:structure                green; depcruise 281 modules / 0 violations
```

**Mutation table** (baseline 79/0), under D-020 — `timeout` per mutation, restore in a trap on
EXIT/INT/TERM/ERR, `cmp`-verified:

| mutation | result |
|---|---|
| make the deadline effectively infinite | **detected — the run TIMED OUT** (see below) |
| renew the budget every hop (per-hop, not total) | **77 / 2** |
| stop handing `maxBytes` to the transport | **78 / 1** |
| **no-op control** | **79 / 0** |

**Stated precisely:** the first mutant was caught as a **runner timeout, not a clean assertion
failure.** Removing the deadline lets the never-settling fake outlive even the per-test bound and
stall the runner. That is genuine detection — the suite does not pass — but it is weaker evidence
than a red assertion, and I am not going to write it up as a clean kill.

## Known gaps

1. **The check-to-connect window remains** — now tracked as **ISS-C-UNRUN-WRITERS-011, BLOCKING on the transport
   unit**, so it cannot be closed by editing a docstring. The checker's ruling: pinning is a
   *transport* contract (pinned address + original Host + SNI + cert validation) and guessing that
   signature blind is what causes the migration the "fix seams early" argument tries to avoid.
2. **No real transport.** `request` is still an injected seam. **A13 does not move.**
3. **`::ffff:0:0:0/96`** (RFC 2765 v4-translated) is allowed; not in the contract's enumerated set
   and no live bypass was demonstrated. ISS-C-UNRUN-WRITERS-012, low.
4. **No allowlist mode.** Deny-by-range only.

## Note to the checker

The deadline is the thing to attack: a `Promise.race` leaves the losing promise running, so a
transport that never settles keeps its handle alive until the process exits — I clear the timer but
cannot cancel `deps.request`. Judge whether that is acceptable at this seam or whether `request`
must take an `AbortSignal` now. Also worth probing: clock skew via `Date.now()`, and whether a
`timeoutMs` of 0 or a negative value should be an error rather than an instant deadline.


---

## Close-out (2026-09-08)

**PASS, cycle 3** — 7/7 criteria, 3/3 invariants. ISS-C-UNRUN-WRITERS-009 closed. Two notes filed, neither blocking:
ISS-C-UNRUN-WRITERS-014 (low, `timeoutMs > 2^31-1` collapses to ~1ms — still fails closed) and ISS-C-UNRUN-WRITERS-015 (medium,
BLOCKING on the transport unit).

**The checker corrected me upward.** I reported the infinite-deadline mutant as detected via a
runner hang rather than a clean kill. It was a clean kill: exit 1 in 7 seconds, listed under
`✖ failing tests` with `'test timed out after 5000ms'` from the test's own bound. Node counts a
timed-out test under `cancelled`, so the summary line reads `fail 0` — and my mutation harness
greps `ℹ (pass|fail)`, so **my own tooling hid a killed mutant as a hang.** The property under test
is a duration bound, which can only be asserted as a timeout; it does count as pinned.

On the un-cancellable race: acceptable here, because what leaks is a handle held by a transport
that does not exist — cancellation is a property of the thing cancelled. Filed as ISS-C-UNRUN-WRITERS-015 blocking
the transport unit, with the checker's honest asymmetry recorded: unlike a pinned address,
`AbortSignal` has one standard shape, so adding it now would have been cheap.

**This is a PASS on the primitive, not the feature.** `request` is still an empty seam and **A13
does not move.** Three issues now stand between this and any transport accepted without pinning,
cancellation or a real cap.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
