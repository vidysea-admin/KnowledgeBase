# T022 dirty guard — cycle 1

**Status:** ready-for-check
**Handshake status:** ready-for-check

Coordinator-supplied FINAL shared checkpoint: [final-shared-public-checkpoint.json](../coordination/knowledge-brain-20261015/final-shared-public-checkpoint.json) (24 pins).

## Current human-form identity and remaining handoff gate

Current generated HTML SHA-256 is `918af50de6aad75e50729343faf0bb3556f738d97fc551a480776ba3c6d237f1`. Original preserved HTML SHA-256 is `2b617ff41ccc1fb1e3e68105d366da63b340237a9c8f1f263ddb585549d0c6e5`. Their difference is expected: the current artifact embeds the dirty guard, unload warning, explicit discard control, and asynchronous restore race guard described below. An older PASS for the original HTML does not certify the current artifact.

Owner-reported inspection, relayed by coordinator from existing tool/chat output only: current HTML is 59,977 bytes with the current SHA-256 above; 30 distinct items in three batches of ten; 44 bindings with 44/44 source hashes matching; initial scores unset; embedded packet SHA-256 `799b2cc258ca3478565457c42110cbda9a4eeb6c97d55cf56ff8983c2f1e8eef`. Historical PASS HTML was 58,708 bytes with the original SHA-256 above. No durable readback file exists; there is no receipt path to cite. These facts are owner-reported tool-output provenance, not a new maker verification or current-candidate independent verdict. No reviews, synthetic labels or corpus refresh were added. Human handoff remains gated on current candidate broker evidence and a fresh independent review after the final candidate is pinned.

Root: `C:/Users/product/Desktop/KnowledgeBase`
Manifest/verdict slug: `t022-review-dirty-guard`; cycle 1.
Candidate ID: `sha256:a0a31ab35f22e6c407c36652844f86c4685383836d67bc4223d4b0aaa41d443b`.
HEAD observed: `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a` (shared checkout; not a clean candidate commit).

## Later durable readback evidence (separate from earlier chat-only report)

Coordinator supplied a subsequent root-authorized repeat readback by `acceptance_reconcile`, exit 0: `qa/coordination/knowledge-brain-20261015/quality-delivery/t022-current-form-readback.json`, SHA-256 `f61e28f4e1bc4af3af282e42a46de2aa0169a74fdb1a80d59989841bef71b330`. Reproduction script: sibling `t022-current-form-readback.node-repl.mjs`, SHA-256 `b5819a08703cf8178c0161d2b2071c9b8e23c49457e8a14586eaf1c4da4e62e7`. Reported result: current HTML 59,977 bytes, SHA-256 `918af50de6aad75e50729343faf0bb3556f738d97fc551a480776ba3c6d237f1`; 30 neutral items, three batches of ten, 44/44 binding hashes matching; packet SHA-256 `799b2cc258ca3478565457c42110cbda9a4eeb6c97d55cf56ff8983c2f1e8eef`. Receipt discloses a prior parse failure. This durable result was relayed to this maker without additional reads or execution. It supplements the earlier chat-only report; it is not independent acceptance or a substitute for the current broker/final-candidate review gate.

## Authorization and boundaries

Coordinator lease: generator, focused test, generated HTML and this packet/manifest/evidence directory. Tier 3 repair of demonstrated input loss. Applicable AGENTS maker requirements: preserve unrelated/user work, no maker contract edits, no automatic human-gold promotion, evidence before ready-for-check. No acceptance threshold, provider call, network, DB, label or source change. Only existing client draft persistence is written; auth/tenancy/credentials are unchanged.

## Change map and consumers

- `scripts/eval/t022-offline-review.mjs`: `offlinePage` compares live score/rationale/affirmation against displayed clean fields; blocks item navigation/export/restore with existing accessible alert; explicit discard reloads the saved item; unload warning; edit version prevents asynchronous restore overwriting intervening edits or saved assertions. `renderOfflineHtml` adds the discard button.
- `scripts/eval/t022-offline-review.test.mjs`: two synthetic-only DOM regressions exercise actual generated controls and downstream exported strict draft. Existing private tests remain opt-in.
- `data/eval/t022-offline-review.html`: regenerated with `renderOfflineHtml` from its preserved original embedded snapshot; no current corpus refresh. Existing localStorage key/schema, default null judgments, explicit-save affirmation and false authoritative flags remain unchanged.

The immediate consumer is the generated offline page; exported JSON remains consumed by `validateOfflineDraft`/existing protected transfer workflow. `saveOfflineItem` and draft validation are unchanged.

## Candidate SHA-256 pins

Deterministic identity algorithm: sort the three implementation/test/generated paths below in ascending case-sensitive ordinal order; for each path, concatenate its repository-relative forward-slash path, one ASCII space, lowercase SHA-256 of raw file bytes, and LF (including final LF); encode this full inventory as UTF-8 without BOM and SHA-256 those bytes. Candidate ID is `sha256:` plus the lowercase resulting digest. Exact content-free inventory: `qa/evidence/t022-review-dirty-guard/candidate-inventory.txt`. QA metadata is excluded to avoid self-referential identity. Pins rechecked unchanged when creating identity.

| Path | SHA-256 |
| --- | --- |
| scripts/eval/t022-offline-review.mjs | f3e971cd0bdee3853813a4b490ae317781898ef0622c347c75238699f5752357 |
| scripts/eval/t022-offline-review.test.mjs | 0b55e774cd9115255778741e125f8ba76ed96aba2d20a2ef8d792c924904faa9 |
| data/eval/t022-offline-review.html | 918af50de6aad75e50729343faf0bb3556f738d97fc551a480776ba3c6d237f1 |

Original HTML SHA-256: `2b617ff41ccc1fb1e3e68105d366da63b340237a9c8f1f263ddb585549d0c6e5`. Private byte backup: `data/eval/t022-offline-review.pre-dirty-guard.html` (additional exact coordinator lease). Verified resolved paths inside workspace, absent destination and matching source hash before non-overwriting move; destination hash matched afterward. QA contains only `qa/evidence/t022-review-dirty-guard/backup-receipt.txt`, a content-free hash receipt. Original generator/test pre-edit hashes were not captured; HEAD is supplied without claiming clean-base identity. The exact delta must be reviewed in the shared worktree.

## Checks requested from central broker

### Later central broker result — shared execution

Coordinator reports GREEN evidence at `qa/goal-vectorless-2026-10-15/verification-quality-six-unit-twenty-six.json`, sibling `verification-quality-six-unit-twenty-six-units.json`, and associated full stdout: own exit 0; 26/26 checks, zero skips, 6.096 seconds shared across six units; 62 pins checked without drift. The two named dirty-guard cases are mapped in the unit evidence; `KB_T022_PRIVATE_REVIEW_TESTS` was genuinely unset. This result applies to initial cycle 1 candidate `sha256:a0a31ab35f22e6c407c36652844f86c4685383836d67bc4223d4b0aaa41d443b` with the unchanged three pins above. The broker receipt is the runtime/environment evidence source; exact runtime values were not separately relayed to this maker and remain unverified here. No standalone exit/time is claimed. The 6.096 seconds are shared suite time, not maker or per-unit active time. The durable current-form readback described above remains separate evidence.

Remaining gates: central FINAL shared checkpoint, applicable contracts verifier/static checks, and fresh independent review of the final current-form candidate. Manifest remains awaiting-evidence; no human handoff or T-022 completion claim.

### Final readiness reconciliation (supersedes earlier pending-gate status)

Coordinator supplied mandatory verifier result `qa/goal-vectorless-2026-10-15/verification-final-frozen-contracts.json` and corresponding stdout: own exit 0, 0.193 seconds, existing .venv Python, no candidate pin drift. Empty registry means PASS BY VACUITY only; it provides no substantive behavior coverage. Coordinator confirms FINAL shared checkpoint is available (exact path not separately relayed to this maker). Combined with the two focused guard checks and separate durable current-form readback, the scoped maker evidence is ready for independent review at cycle 1 and the exact candidate ID above. No specific additional applicable static gate is identified for this MJS/browser-control delta; no TypeScript build requirement is invented. These statements rely on central supplied evidence; this maker performed no new reads or test execution.

Independent current-form usability review remains checker-owned. Reviewer dispatch is HOLD pending installed actual_total helper/root finite-ceiling budget gate. Ready-for-check does not assert checker PASS, completed human reviews, human handoff, or T-022 completion. Earlier pending status paragraphs are retained as history and superseded by this final reconciliation.

`node --test --test-name-pattern='dirty form|async restore' scripts/eval/t022-offline-review.test.mjs`

Run with `KB_T022_PRIVATE_REVIEW_TESTS` unset. Requires existing Node and apps/web jsdom resolution. Preflight interpreter/import containment and writable basetemp parent as applicable. No browser, provider, DB, network or private fixture opt-in. New synthetic tests cover navigation/export/restore/unload/discard and edits/saves during asynchronous restore. Existing full private suite intentionally excluded by central CPU/private-content restrictions; this is scoped repair evidence only. Contracts validator and any required broader gate are coordinator-owned and remain unverified here.

Maker execution: one HTML regeneration command exited 0 and reported unchanged embedded snapshot reuse; hash command exited 0. No tests run. Active time/tokens/cost unknown; no measured efficiency claim. Checker budget therefore requires bounded BOOTSTRAP_REVIEW scope under checker skill, rather than invented usage ratios. No issue-ledger reproduction claimed.

History clarification: this maker created the original manifest/packet at cycle 1; no cycle 0 artifact, failure, fix, test result or broker receipt was provided to this maker. Identity metadata was appended without source edits. Coordinator owns broker execution and must bind the receipt to this candidate ID before ready-for-check.
