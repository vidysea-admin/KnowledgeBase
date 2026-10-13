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
