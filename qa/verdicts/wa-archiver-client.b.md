# Verdict (coordinator B) - wa-archiver-client (W3), cycle 0
Date: 2026-10-30 · Bound root: D:/KnowledgeBase/.worktrees/wa-archiver-client · Policy-Version: proportional-verification/2026-10-19.17
Base: 00de9d92 · Head judged: 1647c25b (non-qa tree identical at checkout HEAD; later commits touch only qa/) · Cycle checked: 0
Contract: plan.md unit W3 acceptance 1-5 (R-16, R-42, R-45, spec s7) + archiver-service-api.md (W2a). No qa/contracts file; the plan list is the contract.
Blind: this coordinator read no other coordinator verdict, checkpoint or evidence.

## Check plan (step 0)
Tier L (dual-trigger security client.ts:104 and config.ts: outbound credential, SSRF, QR secrecy). api-only, no browser, no persona walk.
Checks: (1) re-run each criterion's verify command in a copy of 1647c25b outside the bound root; (2) step 4c diff-scope read; (3) security read of config.ts, client.ts, errors.ts;
(4) one falsification per criterion in its own copy (green-before, red-after, restored, hash equals source); (5) contract-wire coverage (AC ids vs section 11); (6) tsc plus loc/dirsize lint.
No full suite. No real archiver or external host contacted. No SERIAL needed (tests use ephemeral 127.0.0.1 ports only).

## Criteria
- W3-1 MET. config.ts: origin only (no userinfo/path/query/fragment), https, plain http only with WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP=1 AND a loopback/private literal or localhost; link-local/metadata/unspecified/multicast/reserved refused for every scheme (decimal/hex/octal and ::ffff: spellings normalised). client.ts: fixed origin + constant path (`once`, :91-92), ids validated before any fetch (:47-50, :156-157), `redirect:"manual"` and any 3xx refused (:104, :109), no URL from request data. Run: client+config tests 30/30 pass.
- W3-2 MET. errors.ts: ArchiverError message is its code; an upstream body contributes only an allow-listed code, a regex-checked requestId and a bounded retryAfterSec. Canary token and canary QR swept over console, stdout/stderr, observer events and thrown message/JSON/inspect/stack: none present. Run: client tests 18/18.
- W3-3 MET. Per-call timeout covers the body read (timer cleared in finally, :99-122); retries only for GET and keyed mutations, same Idempotency-Key, max 2, only on timeout/network/store_unavailable/rate_limited/request_in_progress with Retry-After capped at 5 s; `getQr` retry:false, cache:"no-store", nothing remembered.
- W3-4 MET. The fake implements all ten client methods and the contract error cases. Wire AC ids A1 A2 A7 V1-4 P1 P4 W1 W2 S1-3 Q1 Q2 Q4 Q5 Q6 G1-5 G7 G9 G10 G11 U1 U2 I1 R1 H1 H2 N1 are all present; archiver-only A3-6 P2 P3 Q3 G6 G8 U3-7 R2 N2 L1 are listed as skipped; B1 is W6-owned (every AC id of section 11 is accounted for). The contract tests drive the real client over HTTP against the fake. Run: contract + contract-ops 46 tests, 27 pass, 0 fail, 19 skipped. The real-archiver run is a documented flag (LKB_ARCHIVER_CONTRACT_URL/_TOKEN), skipped by default and not run here.
- W3-5 PARTIAL, declared (not a FAIL per the dispatch). `.env.example` half MET (two commented valueless names; grep `^# ...=$` gives 2, grep `NAME=.` gives 0). Compose forward half NOT done: docker-compose.yml untouched; it is an enforcement path behind human gate H-11 (manifest open point 1). See P2.

## Evidence (all runs in copies outside the bound root; the bound tree was not edited)
Re-ran: whole archiver dir 76 tests, 57 pass, 0 fail, 19 skipped (matches the manifest). tsc --noEmit over the directory (temporary tsconfig in the copy): exit 0. `node scripts/lint-loc.mjs` OK; `node scripts/lint-dirsize.mjs` OK.
Step 4c: `git diff 00de9d92 HEAD --stat`: 10 files, 1519 insertions, 0 deletions; every file is in the manifest's What changed; docker-compose.yml, DECISIONS and enforcement paths untouched. No removals or renames.
Falsification (each mutant in its own copy, only the named test file run; restored file hash equals source hash; bound tree untouched):

| id | mutant | green-before | red-after (assertion that fired) |
|---|---|---|---|
| W3-1a | config.ts: drop `!allowPrivateHttp` from the http gate | 12/12 | 3 red: plain-http flag test, flag-defaults-off, alt IP spellings |
| W3-1b | client.ts: ownerPath drops requireId | 18/18 | 1 red: ids validated before any request |
| W3-2a | errors.ts: requestId regex removed | 18/18 | 1 red: hostile error bodies (token inside requestId) |
| W3-2b | client.ts: `console.log(text)` of the body | 18/18 | 1 red: canary sweep |
| W3-3a | getQr retry:false -> true | 18/18 | 1 red: getQr never retried |
| W3-3b | cache:"no-store" removed | 18/18 | 2 red: request shape, getQr never cached |
| W3-4a | fake QR limit 30 -> 300 | 14/14 | 1 red: AC-Q4 |
| W3-4b | fake strict() stops rejecting unknown fields | 13/13 | 1 red: AC-V1 |
| W3-5 | value added to TOKEN name in a .env.example copy | grep 2 / 0 | grep 1 / 1 (second grep non-zero) |

Floor met for all 5 criteria (1 each) plus 4 extra mutants (L cap 10). Per-copy output stayed in scratch (not committed).
Security probe (extra, no mutation): validateArchiverUrl accepts https hosts that embed a blocked IPv4 through transition prefixes (P1).

## Findings
PROPOSED-ISSUE: {"id":"P1","sev":"low","type":"security-hardening","file":"apps/api/src/whatsapp/archiver/config.ts:67-77","finding":"classifyHost classifies https://[64:ff9b::a9fe:a9fe] (NAT64), https://[2002:a9fe:a9fe::1] (6to4), https://[::a9fe:a9fe] (IPv4-compatible) and https://[::ffff:0:a9fe:a9fe] (SIIT) as public and accepts them, although each embeds 169.254.169.254; ::ffff:a.b.c.d is handled. Reproduced with validateArchiverUrl(u,true) in a copy. DNS names are accepted by design. The value is operator env, never request data, so exposure needs a mis-set env on a NAT64 network.","fix_direction":"extract the embedded IPv4 for 64:ff9b::/96, 2002::/16, ::/96 and ::ffff:0:0:0/96 and apply classifyV4; add the cases to the blocked-list test; note in docs that DNS names are not resolved or pinned"}
PROPOSED-ISSUE: {"id":"P2","sev":"medium","type":"open-gate","file":"docker-compose.yml:85","finding":"W3 acceptance 5 compose half is open until the H-11 human gate (Approved-by D-entry, then the two env forward lines, never the ${NAME:-} form). Also WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP is read by config.ts but listed nowhere in .env.example; if plain http over a tunnel is chosen the name must be forwarded and documented, otherwise the api container can never reach a plain-http archiver.","fix_direction":"track the compose half as a HUMAN_GATE and do not mark criterion 5 fully MET or close the goal task for it until done; decide keep/rename/drop of the extra env name and list it commented in .env.example"}
Notes (low, no row): tests were written after the code (declared); the falsifications above are the red evidence. fake-archiver.ts is test support compiled with the other sources; it imports only node builtins and config.ts.

VERDICT: PASS
SCOREBOARD: 4/5 criteria met, 1/5 partial and declared (W3-5 compose half, human gate H-11); 0 invariants applicable
TIER: L (dual-trigger security: outbound bearer credential, SSRF policy, QR secrecy; apps/api/src/whatsapp/archiver/client.ts:104)
FAILURES: none (P1 low and P2 medium are PROPOSED-ISSUE lines, not blocking)
CAPABILITY-COVERAGE: 9/9 falsification rows reproduced (floor 5/5 criteria)
LIVE-BROWSER: not-applicable (api-only; no UI path changed)
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE lines only)
EXECUTOR: claude-opus (maker builder) (checker: claude-sonnet-subagent)
EXPLANATION: Every changed criterion re-ran green on a copy of the head and went red when its guard was removed, with the intended assertion firing. The one gap, the compose forward lines, is a declared human gate (H-11) and not a defect in the shipped code; this PASS covers the W3 client, config, errors, fake and contract suite only, and does not close criterion 5.
Metrics: start=2026-10-30T08:24:44Z end=2026-10-30T08:37:00Z wall_min=12 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=736 mutants=4 defects_unit=0 defects_6c=0
