# Independent verdict — goal-u25-consumer

VERDICT: FAIL
Cycle checked: 1
Scope: independently reproduced C3 withdrawal/privacy failure on the preserved BUILDING baseline, under ROOT's explicit pre-ready RED authorization. This is a concrete acceptance failure, not a completed broad candidate review. Prior goal-u25 persistence-safety PASS remains immutable historical evidence.
ISSUES-WRITTEN: ISS-CU25CONSUMER-001 in qa/issues.CU25CONSUMER.jsonl

The actual reader exposes a deleted stored proposal when withdrawal occurs during the third/final current-evidence await. The `latest` candidate snapshot is captured before this awaited phase and never compared with a coherent current candidate/source/head snapshot afterward. The positive control works, so this result establishes the specific withdrawal defect rather than an unavailable environment.

## Exact independent evidence

ROOT authorized preserving the original reader and running an exact RED probe before maker repair. Checker authored the probe and control; /root/docker_checker executed the sole bounded CPU command centrally. No duplicate RED, product mutation, real DB, provider, external network, browser or full suite was run by this checker.

- Original source: apps/api/src/session-decisions/reader.ts, SHA256 2A21418901B6D7D88F84E1B583192AB962B29BA74C11810ED7069BEB4F7E0D57. Byte-identical backup: qa/evidence/goal-u25-consumer/reader-before-third-await-fix.ts.txt, captured 2026-10-14T21:48:06.7404893Z; baseline metadata third-await-baseline.json.
- Probe: qa/evidence/goal-u25-consumer/third-await.test.ts, SHA256 731E373B59EDE7A2E362459B3639C5E62079CFCC3D82941B0C0491D489CC5743. Positive control consumes a genuinely persisted scripted proposal and preserves stored ID/text/proposed status. Failure case removes that proposal during `++sourceResolutions === 3` inside the actual getSessionDetail dependency, asserts that withdrawal actually occurred and the table is empty, then asserts no earlier proposal is returned. Actual result: returned decisions 1, expected 0.
- Wrapper: qa/evidence/goal-u25-consumer/run-third-await.mjs, SHA256 DA2CF08BEE8AED51298E3B636C1E29A918CA57DF49996293AF99021E5816744F. Exact outer program `C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`, arguments `qa/evidence/goal-u25-consumer/run-third-await.mjs red`, cwd repository root, timeout 65000 ms. Actual outer UTC2026-10-14T21:51:59.558Z–21:52:00.809Z, wall 1246.2969 ms, exit 1, signal/error null, fourteen outer pins unchanged.
- Exact inner same program with `--test --test-reporter=tap --test-concurrency=1 --import tsx qa/evidence/goal-u25-consumer/third-await.test.ts`, timeout 60000 ms. UTC21:51:59.653Z–21:52:00.784Z, wall 1128.5166 ms, TAP duration 1043.852 ms, tests 2/pass 1/fail 1/cancelled 0/skipped 0/todo 0. Thirteen inner pins unchanged; hashChanges empty.
- Immutable outer receipt/logs: qa/evidence/goal-t051checker-broker-u25-third-await-original-red.json and corresponding stdout/stderr. Inner exact receipt/output: qa/evidence/goal-u25-consumer/third-await-red-receipt.json and third-await-red-output.txt. Assertion failure `withdrawn stored decision must not be returned from an earlier snapshot`, actual 1 versus expected 0.

ISS-CU25CONSUMER-001: original withdrawal reproduction 0/1 refused; healthy control 1/1 retained. No recorded case omitted. The shard includes the verbatim command, case names/steps, expected/observed result and immutable probe hash as the standing regression floor. `red` is baseline-guarded; `regression` runs the identical inner command against corrected source. A changed probe, a substituted await, or withdrawal that never actually executes cannot be counted as this reproduction passing.

## Timing and final source binding

Initial pre-ready security source review/checkpoint 2026-10-14T21:47:02.9909913Z. Exact dispatch/approval timestamps are unknown; ROOT explicitly authorized pre-ready security RED and the broker executed it. Baseline byte capture timestamp above is measured. Source review/probe preparation preceded the queued CPU command; exact preparation start/end and broker wait interval are unknown. Required coverage was retained despite the 120–180-second efficiency target being exceeded by queued execution/handoff. Actual command timing is measured rather than estimated.

Receipt/final-source review checkpoint 2026-10-14T21:55:53.8462526Z: reader and backup still match original2A214189; probe still731E373B. Manifest remains BUILDING, Fix cycle1. Draft/persist exact timestamps are recorded by the tool history; not all intervals were separately measured. No source fix was made before the proven RED.

## Required next evidence and parent gates

Maker may proceed with ROOT's approved coherent final snapshot/fence, with source freeze ownership respected. Capture current candidates/session/source/raw turns/review head/approval provenance together, then evaluate immutable evidence rather than appending alternating live queries. Original probe/control must execute verbatim and pass on corrected bytes; require new actual API/producer/client/panel evidence with current shared mount hashes before companion C1–C7 acceptance. This failure does not itself certify the proposed aggregate design or any passing candidate.

Full U2.5/U2.2 parent gates remain HOLD: actual configured provider decision/no-decision samples, live product/DB consumption, all extraction-stage measurements, genuine individual Umesh decision gold and explicitly approved binding thresholds. No approval, gold label, threshold, sample semantics or broad integration result is manufactured.

EXPLANATION: C3 is violated on actual unchanged baseline bytes. No PASS or ready close-out is permitted for this cycle. Security/privacy findings are uncapped. The prior separate goal-u25 historical safety PASS is neither revoked nor applied to these new consumer/producer bytes.

Persisted FAIL read-back and final 13/13 source/probe/backup-pin check confirmed at 2026-10-14T21:57:30.0152526Z; measured initial security review checkpoint through this confirmation: 627.024 seconds. Final timing metadata append follows that measured check; no unmeasured duration attributed to approval/drafting.

---

# Independent verdict — goal-u25-consumer · Cycle checked: 2

VERDICT: HOLD
Cycle checked: 2
Reviewed SHA: cccd31080b856bb6094962bef144f41ac7ff49cc
Base SHA: a9fac545d0da015668d7dba455031b3a0fe52078
Lane/branch: C:/Users/product/Desktop/KnowledgeBase-lanes/w16-u25cons · lane/w16-u25cons2 (core.longpaths=true)
ISSUES-WRITTEN: none
Clauses covered: C3 (withdrawal race, ISS-CU25CONSUMER-001) fully; C1/C2 race-disclosure on the mounted route. NOT covered: C5 client/panel, C6 public transport, C7 freeze pins (see Remaining gates).

## Identity
- HEAD = cccd3108 (verified). Diff a9fac545..cccd3108 = 3 files: apps/api/src/indexing/decisions-persist.ts (+3, new), apps/api/src/session-decisions/reader.test.ts (+46), qa/manifests/goal-u25-consumer.md. reader.ts unchanged base→candidate (blob sha256 5C6E9DDA…, git blob e4ca47ea).
- Probe qa/evidence/goal-u25-consumer/third-await.test.ts: git blob sha256 731E373B… (matches the ledger pin). The working copy hashes 79E6D2F7… only because core.autocrlf=true writes CRLF; LF-normalized bytes = 731E373B. Not modified.
- Maker's "already fixed at base" claim VERIFIED. The base reader differs from the preserved pre-fix bytes (2A214189…, reader-before-third-await-fix.ts.txt) by exactly the withKnowledgeReadSnapshot phase (reader.ts:68-80) and the published-row fingerprint gate (reader.ts:86-87).

## Q1 — is the base fix race-free across every live await? YES (within the fixture snapshot model)
- Every projected field derives from snapshot state. Text, status and owner come from `d`, which must fingerprint-equal the single snapshot row (reader.ts:86-87); evidence/time come from `final.turns` (reader.ts:81,95-102). Live reads (`visible`, `finalPermitted`, `latest`) only NARROW: the intersection at :71 plus the extra digest/fingerprint conditions.
- Nothing awaits after the snapshot (reader.ts:80-105 is synchronous). The response therefore linearizes at the snapshot point. A withdrawal committing after that point is inherent, not a race defect.
- The snapshot callees (createKnowledgeVisibility with no nativeEvidence resolver, readEffectiveTurns) use only the passed snapshotDb.collection. mongodb 7.6.0 withTransaction returns the callback value. There is no collection-only fallback (test 12).
- The fixture captures all tables at the FIRST snapshot read, after the hook fires (fixture.testsupport.ts:44,59-60). So the sweep, which withdraws before every non-snapshot read, covers every interleaving point up to the snapshot.
- Limit: real Mongo MVCC is not proven here (fixture model only, as the maker states). This is retained under the parent gates.

## Q2 — is the re-export shim acceptable? YES (low-severity note only)
- apps/api/src/indexing/decisions-persist.ts is a pure `export *` of ./persistence/decisions-persist.js. It adds no logic. The original lived at that path until d50a25c2 moved it.
- It is REQUIRED for the D-015 floor, not just convenient. The probe imports the legacy path (third-await.test.ts:3), and run-third-await.mjs:8 hashes that path with readFileSync, so the wrapper throws without it. Repointing the probe would break its pinned bytes.
- No other repo consumer imports the legacy path (grep over apps/packages/scripts/qa/contracts). apps/api tsc --noEmit exits 0.
- Note (not an issue): if the persist module is moved again, keep this shim or migrate the probe through a new checker-authored, re-pinned probe.

## Q3 — does the pre-existing hang hide a failure? NO
- With --test-force-exit: 16 results, plan 1..16, pass 15, fail 0, skip 1 (private TOC HOLD), exit 0.
- Without --test-force-exit (timeout 300): the process EXITED by itself with code 0 in ~27 s, with identical 16 results. The maker's hang did not reproduce in this checker run. Force-exit cannot truncate a still-running test; it only exits after the run completes. Every test reported, so no failure is masked either way.
- All four startTestServer uses (reader.test.ts:157,205,239,267) close in finally, so the new route test adds no handle.
- The maker's claim that the hang is pre-existing on base bytes was not independently run. It is immaterial given the above.

## Commands (all exit codes captured to files under qa/evidence/goal-u25-consumer/checker-c2/, untracked)
- D-015 verbatim (ledger command, no extra flags), lane root, KB_U25_PRIVATE_TOC_TESTS=0: exit 0, 2/2. **ISS-CU25CONSUMER-001: withdrawal 1/1 refused; healthy control 1/1 retained.** Files: probe-verbatim.out/.exit. The same with --test-force-exit: exit 0, 2/2 (probe.out/.exit).
- apps/api reader.test.ts with --test-force-exit: exit 0, 15 pass / 1 skip / 0 fail (reader-fe.out/.exit). Without force-exit: exit 0, same (reader-nofe.out/.exit).
- apps/api tsc --noEmit -p tsconfig.json: exit 0, no output (tsc.out/.exit).
- contracts/verify_contracts.py: exit 0 (vacuous: no frozen contracts).
- Mutation M1 (checker-authored): replace reader.ts:87's published-row gate with `void published;`. Per-mutation byte backup, timeout 600, trap EXIT/INT/TERM/ERR, then cmp plus a HEAD-fidelity git hash-object check (e4ca47ea = HEAD:reader.ts, verified after each run).
  - Verbatim probe: withdrawal case FAILS, control passes (m1-probe.out, exit 1).
  - reader.test.ts, run as m1b: existing third-await test FAILS; the new sweep FAILS ("withdraw-decisions at live await 121 leaked a withdrawn proposal"); the new mounted-route test FAILS ("body leaked withdrawn content"). 0/3 pass, exit 1 (m1b-reader.out).
  - The mutation is killed by both new tests and the floor.
  - Harness self-disclosure: my first attempt (m1.log/m1-reader.out) restored early because ERR fired on the expected probe failure. Its reader leg ran unmutated and is VOID. It was rerun as m1b with ERR-safe capture.

## Remaining gates (why HOLD, not PASS)
- The contract (2026-10-15 public milestone) requires C5 client/panel, C6 actual public transport and C7 current freeze/mount/client/UI hashes. The manifest itself says "actual exits/counts/transport proof pending". The maker did not run the apps/web client/panel or public API/UI specs, and none were supplied at this SHA. This checker did not run them (out of the brief's scope; no browsers).
- Real Mongo MVCC, authentic C6 and parent P1–P4 remain HOLD as before.

## Ledger
- ISS-CU25CONSUMER-001 (qa/issues.CU25CONSUMER.jsonl) MAY be flipped. Set status fixed/verified, fixed_date/verified_date 2026-10-16, regression_check = "verbatim probe 731E373B @cccd3108: withdrawal 1/1 refused, control 1/1 retained; mutation M1 red". The unit manifest must NOT flip to checked-PASS until C5/C6/C7 evidence is supplied and checked.

EXPLANATION: No defect was found in the candidate. The base fix is mutation-proven and the new tests are meaningful. HOLD only reflects the unit's remaining companion acceptance evidence. Checker usage: actual tokens null (not exposed by host); allocation 120k actual_total. Maker usage is unknown, so the ratio is unverified. Command wall-time is dominated by queued test runs (~74 s, 108 s, 161 s tsc, mutation ~2×100 s).

---

# Independent verdict — goal-u25-consumer · Cycle checked: 3

VERDICT: HOLD
Cycle checked: 3
Reviewed SHA: 0c0c1af6c31ef1ef0a69ba45b06a128e7b3a52a5
Base SHA: 4f13dc34994c92a7435fb947ab014e2a482103ed
Lane/branch: C:/Users/product/Desktop/KnowledgeBase-lanes/w16-u25web · lane/w16-u25web (core.longpaths=true)
ISSUES-WRITTEN: none (one finding below for the maker; the checker cannot write the ledger in this dispatch)
Clauses covered: C5 (except the foreign-evidence rejection pin), C6 public synthetic transport, C7 current binding. Authentic C6, real Mongo MVCC and parent P1–P4 remain HOLD.

## Identity
- HEAD = 0c0c1af6 (verified). Code diff base→candidate: only SessionDecisionsPanel.test.tsx (+1 import, 2 call sites). No apps/api change; the rest is qa/ receipts and the manifest.

## Q1 — is the URL fix test-only and correct? YES
- jsdom's global URL resolved import.meta.url against http://localhost, so existsSync was always false and the whole suite collapsed to the "artifact missing" skip. node:url's URL yields a file: URL.
- Green: vitest 1 file passed, Tests 10 passed | 1 skipped (11), exit 0 (checker-c3/green.out). This matches public-ui-spec's 10 public + 1 private HOLD.
- Mutation M3 (revert NodeURL→URL in both call sites): Tests 1 skipped (1), exit 0, zero assertions (m3.out). This proves the assertions now run because of this fix.
- Note: the missing-artifact branch (test.tsx:15-16) still converts a missing artifact into an exit-0 skip. The contract says that state is HOLD, so a runner must check the 10-passed count, not just the exit code.

## Q2 — mutation in the client foreign-row rejection: SURVIVED (finding)
- M2: client.ts:31, `e.sessionId !== sessionId` → `false`. Panel suite still 10 passed | 1 skipped, exit 0 (m2.out). Restored; cmp and HEAD-fidelity OK for client.ts and the test file.
- Cause: the case at SessionDecisionsPanel.test.tsx:122 replaces the two-item evidence with ONE foreign item. The decision's tStart/tEnd (3–7) then no longer equals the evidence span, so client.ts:37 rejects it first. The foreign-evidence check is therefore not pinned by any test, although the test title and the maker's packet claim "client rejection of foreign ... rows".
- Production behaviour is correct (client.ts:31 does reject; the server reader also enforces evidence sessionId), so this is not FAIL.
- REQUIRED FIX (test-only): keep both evidence rows and mark one foreign, e.g. `{ ...data, decisions: [{ ...data.decisions[0]!, evidence: data.decisions[0]!.evidence.map((e, i) => i === 0 ? { ...e, sessionId: "foreign" } : e) }] }`. Then show M2 killed (that case fails under the mutant) and green restored.
- Severity: medium (privacy-boundary test gap, defence-in-depth layer).

## Q3 — is the C6 evidence acceptable for a non-live run? YES, within the public synthetic milestone
- Independent run from the lane root, KB_U25_PRIVATE_TOC_TESTS=0: `node --test --test-reporter=tap --test-concurrency=1 --import tsx qa/evidence/goal-u25-consumer/public-transport.test.ts` → 1/1, exit 0 (c6.out).
- The test drives the real extractAndPersistDecisions (scripted provider) and the real createSessionDecisionsDeps behind the mounted authenticated route (startTestServer, key-derived tenant), on an in-memory fixture with no network, DB or provider. The contract's 2026-10-15 public milestone authorizes exactly that shape.
- The regenerated public-transport.json equals the HEAD blob (git hash-object 001a4991 = HEAD). The test wrote LF over the CRLF working copy; I restored the pre-run bytes, and the tree is clean.
- The test imports the cycle-2 legacy shim path (public-transport.test.ts:5), so that shim is load-bearing for C6 too.
- Not covered: authentic 51-turn C6, real Mongo, real browser.

## Q4 — can c3/current-pins.json stand in for the stale spec pins? ONLY together with this checker's same-SHA runs
- I recomputed all 32 "current" values from HEAD blobs: 32/32 correct. 22/32 differ from the spec pins, including production code: server.ts, production.ts, routes.ts, knowledge.ts, tenantScope.ts, packages/index decisions.ts, decisions.schema.json, AuthContext.tsx, client.ts. The legacy apps/api/src/indexing/decisions-persist.test.ts is gone (moved to indexing/persistence/).
- A hash table alone cannot rebind evidence. The contract forbids reattributing evidence to different bytes without reviewed relevant dependency changes, and the maker ran only 1 of the 5 authored API files.
- Checker closed that gap. I ran the authored public-api-spec set at 0c0c1af6, substituting the moved persist test and excluding transport (run separately): `node --test --test-reporter=tap --test-concurrency=1 --import tsx packages/index/src/pipeline/notes/decisions.test.ts apps/api/src/indexing/persistence/decisions-persist.test.ts apps/api/src/indexing/session-decisions.test.ts apps/api/src/session-decisions/reader.test.ts` → tests 46, pass 44, fail 0, skipped 2 (the authentic In-Focus persistence and TOC transport HOLDs), exit 0, ~61 s (api4.out/.exit).
- With transport that is 47 registered = authored 45 + the 2 cycle-2 reader regressions. The UI set is 11 = authored 11.
- So current-pins.json plus these receipts is an acceptable C7 binding for 0c0c1af6. The spec JSONs themselves remain stale and should be re-issued by their owner (broker/checker) before any future reuse; do not cite them for these bytes.

## Not run
- apps/web typecheck (2-line test-only change); real browser; private opt-in cases; full suites.

## Ledger
- No row flips from this cycle. ISS-CU25CONSUMER-001 stays as recorded in the cycle-2 verdict (may be flipped fixed/verified).
- The manifest must NOT flip to checked-PASS until the Q2 test fix lands with M2 killed. That is the only open item for the scoped public-milestone PASS; the remaining gates above are unchanged.

EXPLANATION: The URL fix is correct and turns the C5 suite from zero assertions into 10 real passing cases. C6 and C7 are acceptable with the checker's same-SHA runs. HOLD is for one unpinned privacy check whose test passes for the wrong reason. Usage: checker actual tokens null (not exposed); allocation 70k actual_total; maker usage unknown; ratio unverified. Evidence lives in qa/evidence/goal-u25-consumer/checker-c3/ (untracked).

---

# Independent verdict — goal-u25-consumer · Cycle checked: 4

VERDICT: PASS
Cycle checked: 4
Reviewed SHA: dcc81dd13e78731b3e81266b5fd1e1252be34c50
Base SHA: 725c4962 (cycle-3 HOLD verdict)
Scope: scoped PUBLIC synthetic milestone (contract 2026-10-15): C1–C5, C6 public software transport, C7. NOT whole U2.5 acceptance.
ISSUES-WRITTEN: none

## Identity and diff
- HEAD = dcc81dd1 (verified).
- Non-qa diff 0c0c1af6..dcc81dd1 is only SessionDecisionsPanel.test.tsx (+1 line, test.tsx:123): both evidence rows are kept and row 0 is marked sessionId "foreign". The span stays valid, so client.ts:31 is the only guard that can fire.
- New test-file pin (git blob sha256): a75647f6ea9773b5290468dd37c97dabc396a3fe50ea7fc789cf4f0b90c04db8. This supersedes the c3/current-pins.json entry for that file. All other cycle-3 pins and runs are unchanged and carry forward: the apps/api authored set 44 pass / 2 HOLD skips / 0 fail, and C6 1/1.

## Cycle-3 finding closed (independently verified)
- Green, with apps/web vitest `run --no-file-parallelism SessionDecisionsPanel.test.tsx` and KB_U25_PRIVATE_TOC_TESTS=0: Tests 10 passed | 1 skipped (11), exit 0 (checker-c4/green.out).
- Checker mutation M2 (client.ts:31 `e.sessionId !== sessionId` → `false`): per-mutation backup, timeout 600, trap EXIT/INT/TERM/ERR. Result: Tests 1 failed | 9 passed | 1 skipped, exit 1. The failure is the "client rejects foreign session/evidence…" test, with "promise resolved … instead of rejecting" (checker-c4/m2.out). M2 is KILLED.
- Restored: cmp OK and HEAD-fidelity OK (client.ts hash-object = HEAD blob). Green after restore: 10 passed | 1 skipped, exit 0 (green-after.out).

## Remaining gates (named as the contract requires; still HOLD)
- Authentic 51-turn C6 and private TOC cases (opt-in OFF, skipped by name).
- Real Mongo MVCC (fixture snapshot model only).
- Real browser.
- Actual configured provider.
- Parent U2.5/U2.2 P1–P4.
- The spec JSONs public-api-spec/public-ui-spec stay stale (22/32 pins) and must be re-issued by their owner before any future reuse. For these bytes the binding is c3/current-pins.json plus the test pin above and the checker's same-SHA runs.

## Ledger
- ISS-CU25CONSUMER-001 may be flipped to fixed/verified (verified in cycle 2; reader.ts unchanged since).
- The manifest may flip to checked-PASS for the scoped public milestone only.

EXPLANATION: The one cycle-3 open item is fixed and mutation-proven by the checker. Usage: checker actual tokens null (not exposed); allocation 30k actual_total; maker usage unknown; ratio unverified. Evidence lives in qa/evidence/goal-u25-consumer/checker-c4/ (untracked).
