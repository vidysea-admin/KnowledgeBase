# Verdict — wa-archiver-client (W3), Mode A, tier L, checker A of dual
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Date: 2026-10-30. Bound to D:/KnowledgeBase/.worktrees/wa-archiver-client. Base 00de9d92 (= merge-base with docs/devops-golive-2026-10-26), Head 1647c25b.
Executor under test: claude-opus (maker). Checker: claude-sonnet-subagent. Contract: plan.md W3 acceptance 1-5 + spec R-16/R-42/R-45/section 7 + docs/whatsapp/archiver-service-api.md.

## Check plan
Logic + security (outbound credential, SSRF, QR secrecy): re-run the manifest suites on a git-archive copy of HEAD outside the bound root; 9 isolated copy mutations; adversarial probes (URL spellings, hostile server); 4c diff scope; tsc. api-only: no browser walk. No real archiver, no external host, no Mongo, no full suite.

## Evidence (all by me)
- Suite on HEAD copy: `node --test --import tsx apps/api/src/whatsapp/archiver/*.test.ts` -> 76 tests, 57 pass, 0 fail, 19 skipped (18 archiver-only/W6 + 1 real-archiver flag). Matches the manifest.
- tsc --noEmit over the directory with the repo tsconfig.base: exit 0, no output.
- 4c: diff base..head = 10 files, 1519 insertions, 0 deletions; every file is in "What changed"; docker-compose.yml untouched; nothing removed or renamed. Bound tree clean; the four product files hash == HEAD blobs.
- W3-5 .env.example: `grep -cE "^# WHATSAPP_ARCHIVER_API_(URL|TOKEN)=$"` = 2; `grep -cE "WHATSAPP_ARCHIVER_API_[A-Z_]+=."` = 0.

## Criteria
- W3-1 MET. Config-only origin (config.ts:108-127); validateArchiverUrl refuses userinfo/path/query/fragment, and non-https unless flag AND loopback/private literal or localhost (config.ts:82-96); fixed origin + constant path, ids validated before fetch (client.ts:47-50,156-157); `redirect: "manual"` and any 3xx refused (client.ts:104,109). Probes: decimal/hex/octal/percent/fullwidth/trailing-dot spellings of 169.254.169.254, `::ffff:` forms, fe80, 0.0.0.0, multicast all refused; `localhost@evil.com` and `evil.com\@127.0.0.1` refused; jid with newline or `/../`, object-with-toString ownerId, non-hex ownerRef, duplicate personIds, bad idempotency key: all `invalid_request` with zero requests sent. Hostile-server probe: 13 requests, all to constant /svc/v1 paths, all with the bearer.
- W3-2 MET. ArchiverError message is the code; body never kept (errors.ts:41-55,63-89). Hostile server returned token and QR canaries in a 500 body, an unknown error code, a 401 HTML body, and a 200 with an extra field plus an `x-leak` header: the canary token appeared nowhere (error message/stack/inspect/JSON, 13 observer events, console captured 0 lines, config JSON/inspect). The QR appears only in the successful getQr return value.
- W3-3 MET. 10 s / 20 s timeouts cover headers and body (trickle-body and unbounded chunked body both end `archiver_api_unavailable/timeout` after 3 attempts x 600 ms); retries bounded at 2, GET and keyed mutations only, same key across attempts; `getQr` retry false, no cache.
- W3-4 MET. Fake runs 27 contract tests green; skipped items are named archiver-only (AC-A3..A6, P2, P3, G6, G8, U3..U7, Q3, R2, N2, L1) or W6 (AC-B1); the real-archiver run is the documented `LKB_ARCHIVER_CONTRACT_URL/_TOKEN` flag.
- W3-5 PARTIAL, declared. Names in .env.example with no values: met. Compose forward lines not added (enforcement-path-adjacent, H-11, needs `Approved-by`): judged as the declared open point, not a FAIL. Fail-safe meanwhile: unset in the container means config null and the screens answer 503.

## Falsification (copies outside the bound root, each green-before then red-after; 9 total, floor 4 + 5 beyond, cap 10)
M1 requireId drops the regex -> RED "ids are validated before any request" (W3-1). M2 http literal/localhost condition dropped -> RED "plain http needs the explicit private flag AND ..." (W3-1). M9 redirect manual->follow -> 2 RED (redirect target never contacted; request shape) (W3-1). M10 169.254/16 refusal removed -> 2 RED (metadata range; alternative spellings) (W3-1). M4 util.inspect prints the bearer -> RED "token never appears in JSON, util.inspect ..." (W3-2). M5 getQr retry true -> RED "getQr is never retried" (W3-3). M6 new idempotency key per attempt -> RED "SAME idempotency key" (W3-3). M8 fake drops owner_unlinked -> 3 RED (AC-G4/G5/G11, AC-U2, contract[fake]) (W3-4). M3 username-only userinfo check removed (`u.username ||`) SURVIVES (config.test only asserts user:pass): test gap, product code correct (client builds from u.origin) -> P2, low; the W3-1 floor is met by M1/M9/M10.

## Proposed issues (dual coordinator: no ledger rows written)
PROPOSED-ISSUE: {"id":"P1","sev":"low","class":"security-hardening","title":"SSRF range check misses embedded-IPv4 IPv6 forms and a CGNAT metadata IP","detail":"validateArchiverUrl accepts https://[::a9fe:a9fe], https://[64:ff9b::a9fe:a9fe] (NAT64), https://[2002:a9fe:a9fe::] (6to4) although the doc comment says link-local metadata is refused for every scheme; 100.100.100.200 (Alibaba metadata) is classed private (100.64/10) and accepted for https and, with the flag, http. DNS names are not resolved (metadata.google.internal, 169.254.169.254.nip.io accepted): rebinding is undocumented. Operator-controlled env only; no request-data path, so not a FAIL.","where":"apps/api/src/whatsapp/archiver/config.ts:48-79","fix_direction":"classify IPv4 embedded in ::/96, 64:ff9b::/96, 2002::/16 via classifyV4; carve out 100.100.100.200; state the DNS limit in the comment and ops doc."}
PROPOSED-ISSUE: {"id":"P2","sev":"low","class":"test-gap","title":"No test for username-only userinfo","detail":"Removing `u.username ||` at config.ts:88 leaves 12/12 config tests green; only `user:pass@` is asserted.","where":"apps/api/src/whatsapp/archiver/config.test.ts:33","fix_direction":"add https://user@a.example.org to the refused list."}
PROPOSED-ISSUE: {"id":"P3","sev":"low","class":"docs","title":"WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP is read by config.ts but undocumented in .env.example","detail":"Owner decision on keep/rename/drop is pending (manifest open point 2); until then an operator on a private tunnel cannot discover the switch. Compose forwards of the two names plus this one remain the H-11 human gate.","where":".env.example:194-198","fix_direction":"after the owner decision, document or remove it in the same change as the compose forwards."}

## Notes
Tests were written after code (declared); falsification is the red evidence and was reproduced. Consent out of scope (D-210). Process incident: the shared scratchpad already held other agents' `mut_M1..M4` directories; my first run reused those names and cleared mut_M1/M3/M4 (mine by timestamp) and attempted to clear mut_M2 (another agent's, partly cleared). Throwaway copies only; main `node_modules/.pnpm` verified intact (513 entries) and all my junctions were unlinked link-only.

VERDICT: PASS
SCOREBOARD: 5/5 criteria met (W3-5 compose half open by declared human gate H-11), 0 invariants violated
TIER: L (security: outbound credential, SSRF, QR secrecy, apps/api/src/whatsapp/archiver/config.ts:82-127, client.ts:104)
CAPABILITY-COVERAGE: 8/9 mutations reproduced red; 1 survives (P2, test gap)
LIVE-BROWSER: not-applicable (api-only, no UI paths)
ISSUES-WRITTEN: none (dual coordinator: P1, P2, P3 proposed)
EXECUTOR: claude-opus (checker: claude-sonnet-subagent)
Metrics: start=2026-10-30T08:05:00Z end=2026-10-30T08:32:00Z wall_min=27 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1620 mutants=5 defects_unit=0 defects_6c=0
