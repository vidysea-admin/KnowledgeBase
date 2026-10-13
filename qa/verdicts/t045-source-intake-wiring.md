# Verdict: t045-source-intake-wiring

**VERDICT:** FAIL
**Cycle checked:** 0

## EXPLANATION
Two defects found by independent probes (not environment-related).

1. SSRF (ISS-W045-001, high): the url adapter in `POST /ingest/source` uses bare `fetch("https://r.jina.ai/"+url)`. With global fetch stubbed, localhost, 169.254.169.254, 10.x, [::1], 192.168.x and 172.16.x URLs were all accepted and forwarded (7 of 7 http targets, 0 refused). `file:` is refused by the route (400) and host matching for youtube/zoom/onair lookalikes falls to the url adapter, not yt-dlp. No guarded-fetcher / isBlockedAddress is used though the repo has one (packages/ingest guarded-fetch.ts).
2. Rollback (ISS-W045-002, high): undo steps are pushed after insertMany returns; a partial insertMany leaves rows. Probe: turns insert writes 1 then throws -> turns=1 left; media likewise.

Verified OK by probe: tenant scoping (t1/t2 same media distinct ids, all rows carry the caller tenant), repeat ingest -> already-ingested, invalid tenant values ({$ne}, "", " ", null, undefined) refused before writes, flag off returns undefined from buildSourceIntakeDeps.

NOT verified: the maker's 13-test file and full apps/api suite, tsc, and 3-5 hash-verified mutations could not run: node_modules (tsx, express, mongodb, @lkb links) is broken machine-wide. Probes ran via a scratch module loader with a stubbed mongodb. Route-level checks (scope gate, 400/502 bodies, flag-off identity at HTTP level) are unverified here.

Uncommitted pre-existing lane files (prior checker harness, left untouched): apps/api/src/source-intake/zz-w045-chk.test.ts, apps/api/zz-w045-chk-mut.mjs.

ISSUES-WRITTEN: ISS-W045-001, ISS-W045-002 (qa/issues.W045.jsonl)

---

# Cycle 1

**VERDICT:** PASS
**Cycle checked:** 1

## EXPLANATION
Reviewed commit 6668c0b7. Ledger reproductions re-run verbatim: ISS-W045-001 6/6 recorded targets refused with 0 forwarded (plus 12/12 extra spellings); ISS-W045-002 turns variant sources0 media0 sessions0 turns0, media variant the same, other tenant's row untouched. Hardening test file 6/6 pass.

SSRF bypass hunt (unit fakes, no network): 31 spellings all refused: uppercase scheme, hex/octal/decimal/short IPs, trailing dot, fullwidth/circled-digit IDN digits, IPv4-mapped/compat/NAT64/6to4/ULA v6, ::, userinfo, backslash forms, nip.io-style and metadata hostnames via fake DNS, multicast/198.18/192.0.0. The WHATWG URL parser normalizes the literal forms before the address judge. Fails closed on DNS error or empty answer; every resolved address is judged.

Residual (low, notes only, no row): the guard resolves, then passes the ORIGINAL URL string to the inner fetcher, so a rebinding window exists if the fetcher is ever swapped for one that resolves locally. Today the fetch is done by Jina, so the risk is not reachable. Redirects are set to manual.

Suites: apps/api 823 pass / 0 fail (all 77 test files, D2_FIXTURE_PYTHON set); packages/ingest 342/0; tsc --noEmit clean in both. The two maker-reported failures are unrelated: activity-health/router.test.ts passes 3/3 on both lane and main; usage/usage.test.ts fails identically on the main tree (13 pass, 1 fail: "a hanging write ... abandoned at the timeout", timing-sensitive under CPU load).

Mutations (hash-verified, per-mutation restore, final git hash-object equals HEAD blob for both files): 6/6 killed (protocol check, credentials check, some->every, literal-IP branch, turns undo ordering, media undo ordering).

ISSUES-WRITTEN: none (ISS-W045-001 and ISS-W045-002 marked closed)
