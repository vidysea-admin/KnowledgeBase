# Manifest — watched-sources-url-normalisation

**Contract:** `qa/contracts/watched-sources-entrypoint.md`. No new criteria; this tightens what
the existing URL criterion actually guarantees.
**Goal task:** T-027 / catalogue A13.
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-C-UNRUN-WRITERS-001** (medium).
**Status:** checked-PASS (cycle 1 — `qa/verdicts/watched-sources-url-normalisation.md`, commit `a004900`)
**Branch:** `lane/c-unrun-writers`

## Why

The route validated a **parsed** URL and stored the **raw** string. So the value approved and the
value stored could differ under a different parser — and this row is a **future outbound fetch
target**, which is exactly the case where that gap bites: whatever the fetcher re-parses must be
the thing this check actually approved, not a string that merely normalises to it here.

Filed by the cycle-1 checker as the one defect this unit genuinely owned.

## What changed

`apps/api/src/routes/watched-sources.ts` only. `isHttpUrl()` (boolean) becomes
`normalisedHttpUrl()`, returning the parsed `href` or `null`, and the stored document carries that
value. Making it return the url rather than a boolean is the point: the approved object and the
stored object become the same thing, instead of two strings that happen to agree today.

## Evidence

```
$ pnpm --filter '@lkb/api' test   tests 132   pass 132   fail 0   (131 + 1 new, written first, red before the fix)
$ pnpm -r typecheck               exit 0
$ pnpm lint:structure             green; depcruise 279 modules / 0 violations
```

Stored value for input `HTTPS://Example.AC.uk/fees?b=2&a=1` is now exactly
`new URL(...).href` — scheme and host lowercased — and the same value comes back from `GET`.

**Mutation:** reverting `return parsed.href` to `return value` reddens exactly the new test
(131/132). Restored `cmp`-identical.

## Known gaps

1. **The internal-address control is still absent, deliberately.** Per the cycle-1 ruling it belongs
   in the fetcher, on the **resolved IP after DNS**, with redirects re-checked per hop — a store-time
   hostname check cannot survive DNS rebinding. Tracked as ISS-C-UNRUN-WRITERS-002 (high) and
   contract invariant `[I3]`, queued before the fetcher unit is built.
2. **Normalisation is not de-duplication.** `https://x.com/a` and `https://x.com/a#frag` still create
   two rows; the fragment is preserved by `href`. ISS-C-UNRUN-WRITERS-**004** covers duplicates (this manifest originally cited 003, which is the credentials row — corrected at close-out).
3. **A13 unchanged** — still MISSING; no row has been written.

## Note to the checker

Judge whether `href` is the right normal form for a stored fetch target, or whether something
stricter is wanted (dropping the fragment, sorting query params). I chose `href` because it is what
`new URL` guarantees the fetcher will re-derive; anything cleverer would diverge from the fetcher's
own parse, which is the defect this unit exists to close.


---

## Close-out (2026-09-08)

**PASS, cycle 1** — 8/8 criteria, 5/5 invariants, `ISSUES-WRITTEN: none`. ISS-C-UNRUN-WRITERS-001
closed structurally: there is no longer a raw-string path into the collection at all.

### The fix closed more than I claimed

I described this as making the approved and stored values the same object. The checker showed the
concrete attack that shut:

`https://good.com\@evil.com/` — the route **approved host `good.com`** (WHATWG parse) and stored a
string that a **non-WHATWG parser** (Go's `net/url`, Python `requests`) reads as host `evil.com`.
A classic confused-deputy split between the validating parser and the consuming one, on a row whose
whole purpose is to be fetched later. That window is now closed.

It also verified the admission predicate is **byte-for-byte unchanged** — non-empty after trim,
`new URL` parses, protocol is http/https — so only the return value moved and the accept set
provably cannot have widened. IDN/punycode, the homoglyph case (`google.com。evil.com`),
trailing-dot hosts and uppercase percent-encoding all resolve to the host the route already
approved in both versions.

### `href` upheld as the normal form

Verified **idempotent over 15 adversarial inputs**, which is the round-trip property the contract
needs. Dropping fragments or sorting query params was rejected: it would diverge from the fetcher's
own parse and reintroduce the very defect being closed, and query order can be semantically
significant. If a canonical de-dup key is ever wanted it belongs in a **separate derived field**,
never as a rewrite of `url`.

The one tightening the checker would want — **stripping userinfo** — is an admission-policy change,
filed as ISS-C-UNRUN-WRITERS-003, correctly out of this unit's scope.

### My own citation error, fixed

Known-gap 2 cited **ISS-C-UNRUN-WRITERS-003** where it meant **ISS-C-UNRUN-WRITERS-004**. Bookkeeping, but worth naming: a manifest
pointing at the wrong ledger row is precisely the failure D-019 exists to prevent, and I made it by
hand inside the very lane that fixed it.

### Internal-address control: still correctly absent

`127.0.0.1`, `[::1]` and `169.254.169.254` all still admit and store, as expected. The
DNS-rebinding argument stands — a store-time denylist would *look* like a control while leaving the
rebinding path open. ISS-C-UNRUN-WRITERS-002 stays open/high, owned by the unbuilt fetcher, and is
contract invariant `[I3]`.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
