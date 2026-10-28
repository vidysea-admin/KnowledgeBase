# U2.5 stored-decision product consumer companion

**Handshake status:** checked-PASS — closed out 2026-10-26 (resume reconcile; latest verdict section PASS at this cycle, qa/verdicts/goal-u25-consumer.md)
Status: checked-PASS — closed out 2026-10-26 (resume reconcile; latest verdict section PASS at this cycle, qa/verdicts/goal-u25-consumer.md)
Fix cycle: 4
Task: U2.5 (scoped consumer/provenance companion; parent remains HOLD)
Priority: tier 3 explicit ALL40 continuation; tenant/source privacy and producer data writes are uncapped.
Authorization: ROOT lease for new isolated session-decisions API and sessions/decisions UI folders plus decisions-persist.ts overlap, relayed by implementation_status/docker_runtime. Central runtime alone owns server/production/SessionDetailPage mounting.
Contract: qa/contracts/goal-u25-consumer.md C1-C7 (independent checker). Original qa/manifests/goal-u25.md and qa/verdicts/goal-u25.md are historical and unchanged.

## Behavior

Producer stamps code-computed cited-source and full generation-inventory digests, both in stable identity; every previous reviewed-row and failure-preserving write rule remains. Central runtime owns optional digest schema/generated fields; the maker did not edit them. Legacy rows lacking either generation binding remain stored and are withheld from the consumer.

GET /sessions/:id/decisions requires existing auth-derived tenant/sessions scope. TrustedBrainReads is restrictive preflight only. After its exact third live source resolution, final publication and source/head eligibility are read through the SAME Mongo transaction snapshot using central withKnowledgeReadSnapshot, KnowledgeVisibility and effective-reader. No live callback/query authorizes the final DTO. Every-reference and full generation-inventory matching withholds missing/private/redacted/changed/ambiguous evidence, including uncited changed siblings. Snapshot capability/errors fail closed; no collection-only fallback. The minimal projection preserves stored IDs/status, optional validated owner and all literal current citations. Source-digest match is provenance, not semantic support.

Shared apiFetch validates and minimally projects response. Actual SessionDetailPage panel uses current key/session/sessionVersion/revision identity to hide old results synchronously and discard late responses, including same-key login and transcript refresh. All citations link to exact turns; source locations use seconds or characters. Empty means no current visible stored candidate, never no real decisions. Stored verified is a record review state, never genuine human gold or whole-feature certification.

## Evidence and current gates

Cycle1 independent FAIL is preserved in qa/verdicts/goal-u25-consumer.md: actual original third-await RED had healthy control1/1 retained and ISS-CU25CONSUMER-001 withdrawal0/1 refused (returned1, expected0), exit1. Baseline reader bytes and exact unchanged probe/control are preserved by checker. Actual cycle2 exact regression/control is now2/2 PASS exit0 (ISS-CU25CONSUMER-0011/1 refused, healthycontrol1/1 retained), central receipt qa/evidence/goal-t051checker-broker-u25-third-await-current-regression.json; all14 inner pins unchanged during that run. Since execution, shared trusted-readers changed D1AFA→D66E2 (metadata privacy projection); checker current-14-pins.json records this sole delta. The old2-case receipt is attributed only to its tested bytes. BUILDING remains: standing30 plus new14 API tests and dependent11 client/panel tests consuming actual mounted-route transport need current shared pins and actual green receipts before readiness. A51turn current source literal quote is scripted provenance only; separate3turn decision fixture proves software behavior. Test-only snapshot model proves software session wiring, never actual Mongo MVCC/deployment capability. No maker compiler/test, provider/browser/real production DB/full suite/export/deploy/promotion.

Full U2.5/U2.2 P1-P4 remain HOLD: actual configured-provider semantic extraction/no-decision samples, actual live product consumption, all U2.2 stage quality measurements and dependency acceptance, individually approved decision gold (genuine0), approved binding thresholds. Fake provider, stored reviewed status and local UI transport cannot close these gates.

## Current PUBLIC synthetic scope — ROOT 2026-10-15

Supersedes the private-inclusive queued plan above: current independent contract addendum C1-C5 + PUBLIC synthetic C6 + C7 only. New actual three-turn producer→stored→authenticated root-route test writes separate public-transport.json; default UI uses only that actual public artifact, no authored/fallback response. Original authentic51 API/persistence/panel callbacks and every assertion are preserved under literal KB_U25_PRIVATE_TOC_TESTS=1 gates before private reads; ordinary specs explicitly set0. Authentic artifact stays excluded from publication regardless of local presence.

Current hashes/full32-pin specs are in packet and qa/evidence/goal-u25-consumer/public-api-spec.json plus public-ui-spec.json. Sole executor docker_governance_review queue: authored45 API registered/43 public+2 private-HOLD, then11 UI registered/10 public+1 private-HOLD; actual exits/counts/transport proof pending. Original731E independent2/2 result preserved on its tested bytes; no duplicate run. Status remains BUILDING until actual public stage/downstream evidence, complete current freeze pins and matching independent cycle2 verdict. Actual Mongo deployment/MVCC, authentic C6 and full-parent acceptance remain HOLD.

## Fix cycle 2 maker packet (lane w16-u25cons, 2026-10-16)

Base a9fac545; branch lane/w16-u25cons2 (worktree C:/Users/product/Desktop/KnowledgeBase-lanes/w16-u25cons). Candidate SHA = the lane commit tip (see commit).

Finding: the C3 fix for ISS-CU25CONSUMER-001 was already present in base reader.ts (SHA 5C6E9DDA...): after the third live current await, final source/head/approval/publication AND the stored decision rows are read inside ONE withKnowledgeReadSnapshot transaction, and each candidate must match the earlier fingerprint in the snapshot rows. No further reader/route/persist change was required; decisions-persist.ts and router.ts reviewed, unchanged (router passes only the auth-derived tenant; persist never reads in the consumer path).

Changed paths:
- apps/api/src/session-decisions/reader.test.ts: two new regressions.
  1. Sweep: withdrawal of the stored rows, and separately of the source, immediately before EVERY live (non-snapshot) await of a clean run; each position must execute and return null/empty.
  2. Mounted GET /sessions/:id/decisions with withdrawal during the third getSessionDetail await (rows and source): body has no decision text/evidence, status 200 with empty decisions or 404.
- apps/api/src/indexing/decisions-persist.ts (new, re-export only): the checker-owned probe (qa/evidence/goal-u25-consumer/third-await.test.ts, SHA 731E373B..., unchanged) imports this legacy path, but the implementation had moved to indexing/persistence/. Without the shim the verbatim probe fails with module-not-found. Root may instead choose to keep the shim out and repoint nothing; probe bytes must not change.

Contract clauses: C3 (withdrawal during awaited resolution never returns earlier snapshot; real boundary tested), C1/C2 (route disclosure on race), C7 (current actual focused output).

Evidence (REAL output, worktree, KB_U25_PRIVATE_TOC_TESTS=0, node v24.19.0):
- node --test --test-force-exit --test-reporter=tap --test-concurrency=1 --import tsx qa/evidence/goal-u25-consumer/third-await.test.ts (cwd lane root): tests 2, pass 2, fail 0, exit 0, 63.1 s. ISS-CU25CONSUMER-001: withdrawal 1/1 refused, healthy control 1/1 retained.
- cwd apps/api: node --test --test-reporter=tap --import tsx src/session-decisions/reader.test.ts: 17 TAP lines = 16 tests, 15 ok, 1 SKIP (authentic private TOC transport, HOLD), 0 failing tests; the process then did not exit (open handle) and was killed by timeout 400 (exit 124, file-level "not ok"). Same hang observed on the pre-edit file (killed at 200 s), so it is pre-existing, not from the new tests; use --test-force-exit.
- Not run: typecheck, client/panel tests (apps/web), standing API suites beyond reader.test.ts, producer tests. Checker should run them.

Left open: authentic C6 and full-parent P1-P4 remain HOLD as before; real Mongo MVCC is unproven (fixture session model only). Ledger row ISS-CU25CONSUMER-001 left open for the checker to close.

## Fix cycle 3 maker packet (lane w16-u25web, 2026-10-16)

Base 4f13dc34 (cycle-2 commit cccd3108 + checker HOLD verdict); branch lane/w16-u25web (worktree C:/Users/product/Desktop/KnowledgeBase-lanes/w16-u25web). Candidate SHA = lane commit tip. Cycle-2 HOLD named only C5/C6/C7 evidence as missing; no API/reader change in this cycle.

Defect found and fixed (C5/C6 evidence-blocking): apps/web/src/pages/sessions/decisions/SessionDecisionsPanel.test.tsx built its artifact path with the global URL, which under vitest jsdom resolves import.meta.url against http://localhost:3000, so existsSync was always false and the whole public suite silently turned into one skipped HOLD test (observed: "1 test | 1 skipped", exit 0, zero assertions). Fix: use node:url URL (aliased NodeURL) for the two transport.json/public-transport.json paths. Assertions unchanged.

Changed paths: apps/web/src/pages/sessions/decisions/SessionDecisionsPanel.test.tsx (2 lines), qa/manifests/goal-u25-consumer.md, qa/evidence/goal-u25-consumer/c3/* (receipts, new).

Evidence (REAL output, KB_U25_PRIVATE_TOC_TESTS=0, node v24.19.0, lane root; receipts in qa/evidence/goal-u25-consumer/c3/):
- C5 client+panel+SessionDetailPage mount: from apps/web `node node_modules/vitest/vitest.mjs run --no-file-parallelism src/pages/sessions/decisions/SessionDecisionsPanel.test.tsx`: 1 file passed, Tests 10 passed | 1 skipped (11), exit 0, 46 s (web-panel.out/.exit). The 1 skip is the authentic 51-turn private-TOC case, HOLD by contract. Covers shared apiFetch with encoded session id and Bearer, all evidence links, reachable SessionDetailPage panel, empty/error states, apiKey/sessionId/sessionVersion/revision change invalidation, same-key re-login late callback, literal status/owner/char positions/unsafe HTML, client rejection of foreign/invalid rows. Before the fix the same command gave 0 passed / 1 skipped (first run).
- C6 local non-live transport: `node --test --test-reporter=tap --test-concurrency=1 --import tsx qa/evidence/goal-u25-consumer/public-transport.test.ts`: tests 1, pass 1, fail 0, exit 0, 21 s wall (public-api.out/.exit). It runs the real extractAndPersistDecisions with a scripted provider, the authenticated mounted GET /sessions/:id/decisions on a localhost test server (tenant from key, in-memory fixture, no network/DB/provider) and rewrites public-transport.json; regenerated file is byte-identical to the committed blob (sha256 6e6a0fd0...e9). The panel test above then consumed that actual artifact (no fallback). A first run WITH --test-force-exit passed the test (ok 1) but the process hit a Windows libuv teardown assertion and exit 1 after 157 s; kept as public-api.forceexit-run.out. Run without --test-force-exit exits 0.
- Needs live/other: authentic 51-turn C6, real Mongo MVCC, real browser, actual configured provider, full-parent P1-P4 remain HOLD. Not run here: the other four files in public-api-spec.json (decisions.test.ts, persistence/decisions-persist.test.ts, session-decisions.test.ts, reader.test.ts) and typecheck; reader.test.ts and tsc were run by the cycle-2 checker at cccd3108 and apps/api is untouched since.
- C7 current hashes: c3/current-pins.json holds sha256 (CRLF-normalized = git blob content) for all 32 files in public-api-spec/public-ui-spec pins plus client.ts, SessionDecisionsPanel.tsx, SessionDecisionsPanel.test.tsx, SessionDetailPage.tsx, router.ts. Key current values: reader.ts 5c6e9dda...(unchanged); third-await.test.ts 731e373b...(unchanged); SessionDecisionsPanel.test.tsx c10d1972...(was 974a52cc, this fix). FINDING: 22 of 32 spec pins differ from this lane's files (e.g. decisions-persist.ts 82c6b637 -> 9e5fbdfc because the legacy path is now the cycle-2 re-export shim; persistence move; decisions-persist.test.ts is MISSING at the pinned legacy path and lives at apps/api/src/indexing/persistence/). The spec JSONs under qa/evidence are checker/broker-owned and were left unedited; they are stale for this SHA, so the checker should treat c3/current-pins.json as the authoritative pin set for cycle 3.

Left open: ledger row ISS-CU25CONSUMER-001 already verified fixed in cycle-2 verdict. SessionDetailPage mounting is root-owned and unchanged.

## Fix cycle 4 maker packet (lane w16-u25web, 2026-10-16)

Base 725c4962 (cycle-3 checker HOLD). Test-only. Candidate SHA = lane commit tip.

Finding closed: mutant disabling the foreign-evidence check (client.ts:31, `e.sessionId !== sessionId`) survived because the old case had a single evidence row and the span check (client.ts:37) fired first. Added one case to SessionDecisionsPanel.test.tsx: both evidence rows kept, row 0 sessionId "foreign", so span/min-max pass and line 31 is the only guard.

Evidence (apps/web, KB_U25_PRIVATE_TOC_TESTS=0, receipts in qa/evidence/goal-u25-consumer/c4/):
- Green: vitest run --no-file-parallelism on the panel test: 10 passed | 1 skipped (private TOC HOLD), exit-clean (green.out).
- Mutant (line 31 foreign-session condition removed, per-mutation byte backup): the new case FAILS ("promise resolved ... instead of rejecting"), 1 failed | 9 passed | 1 skipped (mutant.out). Restored via cp, cmp equal, git hash-object client.ts 8d1277aa... == HEAD blob.
- Receipts for the four other authored API files (checker run at 0c0c1af6, verdict lines ~132): packages/index decisions.test.ts, persistence/decisions-persist.test.ts, session-decisions.test.ts, reader.test.ts: tests 46, pass 44, fail 0, skipped 2 (authentic In-Focus persistence and TOC transport HOLDs), exit 0, ~61 s. apps/api untouched in cycles 3-4.
