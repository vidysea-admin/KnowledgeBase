# Independent verdict — vectorless-publication

VERDICT: FAIL
**Verdict:** FAIL
**Status:** FAIL
**Cycle checked:** 6
**Reviewed SHA:** 8398a420331cd135944f727df98b0f25377f1c9bec1ffc9538574a5f1d894d06

Independent checker: publication_checker. Source review scope only; no completion claim.

PRE-TEST READINESS: incomplete. Independently hashed packet (177e9bf3e34153fa3912d309432d9ca9b56390af7ac2443266bb40d2ba29f3b6), candidate index, and all 24 indexed files; all current pins match. Manifest is ready-for-check, Fix cycle 6.

R0 and R4 preserve successful historical receipts but have different test bytes for indexing/vectorless-publication.test.ts and indexing/promote-entities.test.ts. R1 matches those current bytes, but its exact 10-node selection excludes native rollback, unsupported native transactions, unknown-commit provider non-replay and unsupported preserved-human-claim refusal. Declared erased type annotations do not satisfy the skill's exact receipt identity requirement. These mandatory boundaries lack authenticated current-byte green evidence. No behavioral failure is established.

Clauses 1–5 were read; scoped implementation inspection covered vectorless default, manual snapshot/majority transaction and commit-only retries, current-source reviewed-claim verification and fail-closed judge handling. This is incomplete verification, not acceptance. No test/build/browser/live Mongo/provider run was launched by this checker. Root/broker received a narrow four-node readiness-repair request. Required independent contract-derived failure probe remains unexecuted, as required readiness was not complete before testing.

Evidence: qa/packets/vectorless-publication-cycle6/packet.md, pins.json, receipt-index.json, checker-receipt-summary.json, checker-phase2-assess.json, checker-start-publication-checker.json, checker-final-publication-checker.json; raw R0/R1 receipts and stdout remain in qa/goal-vectorless-2026-10-15/. Existing failures and earlier unknown usage were preserved.

Budget: assess returned BOOTSTRAP_REVIEW/ALLOW with finite cumulative 360 seconds/12000 allocated tokens, including the once-charged historical shared debit180/6000. Actual historical usage, tokens and money remain unknown; efficiency ratios unverified. Prospective start/end accounting is in checker-final-publication-checker.json. No extra allocation authorized or requested here.

Remaining gates: current-byte readiness receipts; independent failure probe and remaining source/consumer review; real replica-set Mongo transaction/durability/restart acceptance (standalone staging remains HOLD), real provider/capture, all-source cited Ask/search, 92-question/human quality and parent acceptance. No unsafe transaction fallback is authorized.

ISSUES-WRITTEN: none

## Bounded continuation, same cycle and candidate

Root authorized next90 active seconds/2000 allocated tokens, cumulative450s/14000. Historical measured161.0335024s and unknown tokens/cost preserved; old HOLD was correct at issue time. New assess ALLOW is checker-continuation-budget-result.json.

Fresh current-byte mandatory-four receipt verification-publication-mandatory-four-20261015T1018.json authenticates 4/4 PASS, zero skips, exit0, stable23 executable unit pins; runtime executable hash/version, lock/import/environment match. Contract absent from broker runner pins but independently rehashed against current index. checker-four-authentication.json records this distinction. These four readiness gaps are repaired.


Independent contract-derived C4 probe completed: verification-publication-independent-three-20261015T1023.json, own exit 0, stable pins True, 3/3 fail-closed cases (missing judge, foreign verdict ID, exhausted budget); 0.6795844 seconds shared broker command measured separately. Probe SHA B5E06A7EB8962A504DBBDA2AF9D4EF1C184BECA5EFC710357CA7E83FA59E98E3. Current24 pin drift count: 0.

Authoritative HOLD remains: remaining applicable source/consumer review and exact-scope authentication beyond the repaired four nodes were not completed within finite allocation. Independent C4 failure probe is now satisfied. Real Mongo and parent gates remain open. Continuation accounting: checker-continuation-final.json.


## Final source-review finding — C3 FAIL

F1 (high, data-write/paid-work retry boundary): active transcript correction can replay indexing providers. `apps/api/src/transcript-review/refresh-executor.ts:25` executes `deps.index` at line35 inside `session.withTransaction`. The transaction view has no client; `indexing/session.ts:73` therefore joins this outer callback rather than using its manual commit-only retry. Active `composition/integrations/transcripts.ts:32–37` binds that callback to vectorless strict `indexSession` and paid `routeComplete`. Installed mongodb7.6.0 `src/sessions.ts:814` invokes fn(this); lines855–859 retry the whole transaction on callback TransientTransactionError, and lines894–896 do so after a transient commit error. Completed provider calls before a later conflict are therefore invoked again. A transaction abort rolls back database writes, not completed provider charges. This violates contract C3's retry/idempotency boundary and packet's “work runs once; never providers” statement for an immediate active consumer.

Static proof is conclusive; no database/provider calls or extra test were run. The native indexSession unknown-commit regression covers a different wrapper and cannot discharge this path. Reproduction/regression plan: a fake ClientSession driver-compatible withTransaction invokes its callback again after one labelled transient error thrown after an index completion; count complete/judge calls, aborts, commit attempts and physical generation writes. Correct behavior must refuse/recover without rerunning paid callbacks, preserve last accepted generation, and never introduce a non-atomic fallback. Add the corresponding transient-commit variant.

Clauses1/2: vectorless default, throwing-embedder path and lexical replacement/gap policy inspected; C4 preserved-review verification/CAS and independent3 refusal probes inspected; C5 connector exact generation and production mode inspected. C3 cannot PASS due F1. Remaining source validation stops at the proven failure; unrelated history and broader checks were not expanded. Historical HOLD and green4/3 evidence remain above for chronology; these do not override authoritative FAIL fields.

This final phase was explicitly bounded at180active seconds/3000allocated tokens, cumulative630seconds/17000 allocated tokens. Prior unknown closeout remains unknown and conservatively covered by the prior90/2000 debit. Efficiency remains unverified. Final phase evidence/accounting: checker-source-budget-input.json, checker-source-budget-result.json, checker-source-final.json and checker-source-identity.json in the packet directory.
