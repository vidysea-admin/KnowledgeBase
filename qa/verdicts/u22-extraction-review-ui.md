# Verdict: u22-extraction-review-ui (Mode A, cycle 0)

Date: 2026-10-26 (resume-reconcile). Bound to D:/KnowledgeBase, HEAD a8d3c0f4 on docs/devops-golive-2026-10-26.
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17 (manifest carries no pin; dispatch said use the current block)
Contract: qa/contracts/goal-u22.md. It has no online-UI criteria of its own: S2/S3/S4 principles apply by reference and P1-P4 are the unmet parent gates. The criteria below are the manifest and packet behaviours (qa/packets/u22-extraction-review-ui.md), judged as a scoped PASS.

## Check plan
UI plus authenticated data-write consumer, tier M (new page + client; no auth/CAS logic in the diff, those live in unchanged apiFetch and the server). Checks: affected tests, 1 falsification per criterion in copies, Mode D own browser, 4c diff scope, seam read.

## Evidence (all produced in this check)
- Candidate: 4 new files. LF-normalised inventory hashes reproduce Candidate ID sha256:62edcb30...477dcd; working tree equals HEAD blobs (CRLF working copy, same content). 4c: nothing removed or renamed, no file outside "What changed".
- Tests in the bound tree: vitest client.test.ts + ExtractionReviewPage.test.tsx = 9/9 pass. Server consumer: node --test router.test.ts, file-store.test.ts, policy.test.ts = 10/10 pass.
- Seam on master tree (manifest said central reconciliation was pending): App.tsx:63 route inside AuthProvider/LoginGate; NavSidebar.tsx:25 link; App.wiring.test.tsx:12 route entry; routes.ts:51 mounts createExtractionReviewRouter; server.ts:119-127 calls mountIntegratedWorkflows after requireAuth and the rate limiter; reviews.ts:23-24 builds the file store only when LKB_EXTRACTION_REVIEW_DIR/PACKET are set, otherwise router.ts returns 503 unavailable. The seam exists.
- Falsification, one copy per row (base copy green 9/9, one hunk each; outputs in qa/evidence/u22-extraction-review-ui-checker/):
  K1 transport path/encoding: drop encodeURIComponent (client.ts) -> client.test 'sends one exact native option' RED.
  K2 current-revision CAS body: expectedRevision +1 -> same test RED.
  K3 native options start unset: value={choice || "0"} -> 'initially unset' and 'fresh affirmation' tests RED (toHaveValue).
  K4 affirmation cleared on rationale amend: remove setAffirm(false) -> 'requires fresh affirmation' RED (toBeDisabled).
  K5 refusal clears affirmation: remove setAffirm(false) in save() -> 'CAS/source refusal' RED (not.toBeChecked).
  K6 export tenant check: drop the tenantId comparison -> 'refuses foreign export' RED (no alert).
  K8 reviewed/pending coverage text: hard-code 0 pending -> 'authoritative evaluator export' RED.
  K9 prior audit shown: replace condition with false -> 'fresh affirmation' RED (audit summary missing).
  K10 server human-only gate: remove both canReview and reviewerKind clauses from router.ts -> router.test RED (200 vs expected 403). Removing either clause alone survives: they overlap and policy.ts already refuses automation canReview (equivalent mutants, defence in depth).
  K7 stale-login guard in reload(): the shipped tests SURVIVE the mutant (9/9 green). My own probe (await act + 50 ms after finish()) is green unmutated and RED mutated, so the guard works and only the test is weak: ISS-U22REVIEW-001 (low).
- Mode D (LIVE-BROWSER): own headless Chrome over CDP against the real page and the REAL express router + requireAuth + review policy with an in-memory CAS store (synthetic data, no corpus). Playwright MCP was held by another session and the claude-in-chrome extension was not connected. Interacted, not just rendered: candidate containing a b tag rendered literally (0 bold elements); label unset and Save disabled at start; amending the rationale cleared the checked affirmation; save sent exactly {expectedRevision:0,inputSha256,label,affirmIndividualReview:true,rationale} with actor trusted-human derived server-side, coverage 0/2 to 1/2, label reset to unset, stored label and audit shown; an out-of-band revision bump made the next save return a 409 alert with coverage unchanged and affirmation cleared; export downloaded extraction-reviewed-2-of-2.json (format extraction-authorized-export-v1) and showed "does not establish full gold or accepted thresholds" plus remainingGate; an automation key got a 403 alert and no source text. Console errors: 0. Report: qa/evidence/browser-u22-extraction-review-ui-2026-10-26-checker/report.json.

## Criteria
[U1] exact transport, no tenant/actor/threshold in request: MET (K1, K2, live body)
[U2] native options start unset, no default, exact objects: MET (K3, live)
[U3] rationale plus fresh individual affirmation, cleared on change, live revision/input: MET (K4, live)
[U4] source/CAS/trusted-human refusals visible, counts not advanced, affirmation cleared: MET (K5, live 409/403). Friendly wording does not fire against the real ApiError: ISS-U22REVIEW-002 (low)
[U5] prior label/audit shown separately: MET (K9, live)
[U6] export checks tenant+packet before Blob, downloads returned bytes, shows reviewed/pending and gold/threshold limits: MET (K6, K8, live)
[U7] stale-auth results discarded: MET by behaviour (own probe); shipped test weak (ISS-U22REVIEW-001)
[U8] route/mount/unavailable seam and human-only server gate: MET (seam read, 10/10 server tests, K10)
[U9] no automatic mapping, bulk approval, default label, configured threshold or fabricated evidence: MET (read of both source files; humanGoldVerified:false and bindingThresholds:null are only displayed)
Parent P1-P4 and real owner labels, corpus and thresholds remain HOLD; this scoped PASS says nothing about them.

VERDICT: PASS
SCOREBOARD: 9/9 unit behaviours met (contract goal-u22 P1-P4 explicitly unmet and out of scope), 0/0 invariants
TIER: M (new multi-file UI page + client; no auth/CAS/security logic changed in the diff)
FAILURES: none
CAPABILITY-COVERAGE: 9/10 rows reproduced red (K1-K6, K8-K10); K7 survives in shipped tests, behaviour independently falsified by own probe
LIVE-BROWSER: qa/evidence/browser-u22-extraction-review-ui-2026-10-26-checker/
ISSUES-WRITTEN: ISS-U22REVIEW-001, ISS-U22REVIEW-002, ISS-U22REVIEW-003 (qa/issues.u22review.jsonl)
EXECUTOR: claude-sonnet-subagent
EXPLANATION: The four files on master match the candidate ID and behave as the packet claims in unit tests, in falsification copies and in a live browser against the real router. The server mount, App/LoginGate route and unconfigured-503 seam all exist on master. Two low findings (weak stale-auth test, dead friendly error text) fail no criterion.
Metrics: start=2026-10-26T21:50:31+05:30 end=2026-10-26T22:07:00+05:30 wall_min=16 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=11 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=990 mutants=0 defects_unit=0 defects_6c=0 slow: browser bring-up 8 min
