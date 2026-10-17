# Independent full-parent verdict — goal-t013

VERDICT: HOLD
Cycle checked: 0
Task: T-013 / C13 real-time voice / C14 3D-avatar assistant
Contract: qa/contracts/goal-t013.md F1–F9, unchanged.
ISSUES-WRITTEN: none

## Scope and remaining acceptance

This is a full-parent HOLD, not a scoped PASS. Source-candidate readiness and 21 green fixture checks do not narrow the contract or close T-013. No independently proven source defect was found in this check.

| Clauses | Established evidence and outstanding gates |
|---|---|
| F1 | Actual source route/import/nav sits inside AuthProvider/LoginGate and calls the existing authenticated ask seam. Running mounted application and real provider/API answer have not been demonstrated for this client. |
| F2–F3 | Attributed fixture checks cover transcript delivery, explicit conversation readback, permission/capability/error and cancellation. Actual microphone recognition, audible synthesis and live stop are absent. |
| F4 | Independent source review confirms real WebGL triangulated depth-tested mesh logic. Three passing tests import the actual Avatar component for absent/throwing context and null shader allocation cleanup. These establish failure handling only; successful GPU rendering, live state transitions and reduced-motion behavior remain unproved. The page test mocks Avatar and cannot establish rendering. |
| F5 | Source and fixture evidence preserve separate safe lists, encoded session/turn links, returned speaker/timestamps/quotes and honest missing provenance. Source review confirms SessionDetail decodes and finds the cited turn or reports absence. Actual tenant-authorized click-through with real source evidence is absent. |
| F6–F7 | Source review and attributed fixtures cover weak-coverage speech qualification, API failure clearing old output, auth replacement including same-key login, late callbacks, stop and unmount. This is bounded fixture evidence, not fresh live API auth/rate-limit/provider validation. |
| F8 | Required real sample flow microphone/typed query → established provider/API → grounded answer → actual avatar/voice → authorized source view is absent. Existing Ask-page proofs and injected callbacks do not substitute. |
| F9 | Ready cycle/hash identity and 21 fixture results verified. Frozen validator receipt is reusable on identical validator/registry bytes and is vacuous. Current coherent type/build/structure acceptance remains unresolved; coordinator reports 39 API / 5 web compiler errors, with no owned T-013 diagnostic reported. Historical 09:23 green compiler receipts are explicitly not current acceptance. |

## Independently reviewed boundaries

Directly reviewed all new product logic and focused tests, with relevant existing API/client/auth/provenance consumer context. The renderer now catches blocked getContext, checks null shader/program/buffer handles and cleans partial resources. Voice generations retire recognition and synthesis callbacks before abort/cancel; page generation plus mounted and key/session-version identity guard delayed answers and transcripts. Explicit conversation mode submits the recognized final text and speaks the actual coverage-qualified answer. Credentials remain in the existing mechanism; no tenant selector or separate answer model was introduced.

The independent boundary request was WebGL allocation/context failure and stale rendered voice notification after auth change, beyond initial maker happy-path proposals. Maker subsequently implemented those probes; broker executed them. Checker reviewed their actual source and execution receipt but did not independently rerun them. Additional real-render/device/API/source probes are necessary for full acceptance and were not authorized in this execution allocation. This limitation is a reason for HOLD, never an inferred PASS.

## Attributed executed evidence

- Receipt: qa/evidence/goal-t051checker-broker-t013-web.json SHA256 `0164AA3C6A136384B219A27AB4A9B44D769DF6B466F098561C719ABC4E163FFC`.
- Exact executable: `C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`; arguments: `node_modules/vitest/vitest.mjs run src/pages/counsellor/CounsellorPage.test.tsx src/pages/counsellor/voice.test.ts src/pages/counsellor/provenance.test.ts src/pages/counsellor/Avatar.test.tsx --maxWorkers=1 --minWorkers=1`; cwd `C:/Users/product/Desktop/KnowledgeBase/apps/web`; environment overrides `{}`; timeout 120000 ms.
- Broker start/end: 2026-10-14T21:52:08.823Z / 2026-10-14T21:52:16.987Z; outer duration 8.1585565 s; exit 0, signal/error null. Four files / 21 tests passed: page 9, voice 8, Avatar 3, provenance 1. Internal Vitest duration 7.15 s is distinct.
- Actual stdout read: qa/evidence/goal-t051checker-broker-t013-web.stdout.txt SHA256 `F43513B50677CA389381A5D970A38E1BB64D06146F21F9ABF3FF811BCD3A2F0E`; reports `Test Files 4 passed (4)` and `Tests 21 passed (21)`.
- Actual stderr read: qa/evidence/goal-t051checker-broker-t013-web.stderr.txt SHA256 `898A80F32B7916801406C56F96D7A385FE420E5CDF72DD6376A2A0EBFAC39622`; two React Router future-flag warnings, no failing assertion.
- Frozen-validator receipt qa/evidence/goal-t051checker-validator.json: command `python contracts/verify_contracts.py`, exit 0, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Executed in 2026-10-14T18:39:31.7184876Z–18:39:33.1459082Z combined batch 1.4327147 s; individual duration unknown. Current validator SHA256 `1240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3` and registry `D31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940` independently match receipt.

No checker test/typecheck/validator rerun, browser, microphone, provider, database, mutation, deployment or publication action was performed. No live handle remains. This unit is not an issue-fix unit; ledger reproduction corpus counts are not applicable.

## Checked bytes and provenance

Independent hash audit: qa/evidence/goal-t013/checker-source-pins.json SHA256 `A2FE4E5FD560AD49E018AB82EA2F233F0FEF4809E5B65F159936CF51744B8EAC`. The artifact records exact hashes for all eight new source/test files, root-owned App/Nav/SessionDetail, immediate ask/client/types/AuthContext/safe-url and Vitest setup/config, docs and contract. All 20 current product/runtime/doc/contract pins match broker pre/post execution. The twenty-first receipt entry was the pre-execution building manifest; its explicit ready metadata change is recorded separately and is not concealed as a product-byte change.

- Ready manifest SHA256 `C71A7C749720F16037A19705FD2CE061CA9A57FDCE7D2399C846ED2335BE773A`; Status and Handshake status ready-for-check; Fix cycle 0.
- Ready packet SHA256 `AF71AE4EBECB780C7FEB144DFB4A68AB1AE504DDACBA41FEA1F70C144BEF89B3`.
- Contract SHA256 `0C89198CC6DE12462C8D352D94911CF0661747AE78C80F1A6F560581CC8F540C`.
- App/Nav/SessionDetail checked hashes respectively `EEF7AF89EB3C3C261678AED701F309D9399E0F77921B73E3B9CE97B1055571EA`, `39319E1CE324EC1110EE101528C08A56F88EB8D46032074CB54D69FBD4CA23F6`, `16BD213AD66F6C76B2555CCE655FA7E2A880F0BE5B170E2022AEB41DB2620487`.

## Timing and command accounting

This ready-candidate check launch: 2026-10-14 21:57:54 UTC. Earlier contract preparation and building-candidate source reviews occurred before multiple coordinator/user pauses; their total elapsed time is unknown and is not represented as continuous checking.

Scope/receipt read completed in shell duration 0.3946083 s. Independent hash/source/log command completed in 0.5492342 s; internal hash audit duration 0.1450139 s, artifact timestamp 21:58:17.1489440Z. Scoped evidence-name/navigation/validator/hash read completed in 0.4364836 s. Historical compiler-receipt read completed in 0.7387143 s and established only that those old receipts were green at 09:23; they were not reused. Scoped evidence-name lookup completed in 0.300017 s. All these read/hash commands exited 0; no test process was started. Exact read targets and hash inputs are recorded above and in the pin artifact. Initial read-review phase ended by 21:58:28 UTC; draft/persistence began at 21:59:02 UTC. Broker/compiler-path request was sent during drafting; any receipt not yet supplied is attributed as coordinator report only. No approval request/resolution occurred in this check. Unmeasured subphase intervals remain unknown and are not inferred by subtraction.

Completion timestamp and final hash recheck are recorded below after persistence confirmation.

EXPLANATION: The delivered source and bounded fixtures provide useful evidence, including the actual Avatar component's failure paths. Required successful real GPU/voice/provider/API/downstream source evidence and coherent integration gates are missing. Preserve full acceptance and T-013 in-progress; do not flip the maker manifest to checked-PASS on this HOLD.

Persistence confirmed and final byte recheck: 2026-10-14T22:00:13.6808308Z; all 20 candidate/runtime pins plus ready manifest/packet unchanged. Launch-to-confirmation elapsed 139.681 seconds (launch clock precision one second). Final recheck command exit 0.
