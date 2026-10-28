# answer-policies-vectorless — cycle 0 frozen readiness packet

Root: C:/Users/product/Desktop/KnowledgeBase. Manifest: qa/manifests/answer-policies-vectorless.md. Status ready-for-check, cycle0. Maker source/test execution remains frozen; root supplied authorized broker receipts, attached below. No checker verdict is claimed.

Admission: qa/coordination/knowledge-brain-20261015/answer-policy-assess-input.json and answer-policy-assess-result.json. Canonical installed checker review_budget.py assess under Python312 returned exit0, BOOTSTRAP_REVIEW, exceeded=[]; ratio unverified. Fresh review allocation180s/6000 includes independent failure probe; cumulative360s/12000 preserves shared historical180s/6000 debit with unknown actuals, charged only once centrally. Reassess before a materially new review/command phase; this does not authorize skipping mandatory evidence or confer PASS.

## Contract and scope

- User-approved plan / D-173 and D-174: versioned derived knowledge; corrections, revocations and deletions invalidate stale answers/citations; tenant-bound policy application and durable review CAS remain required.
- qa/contracts/ask-router-v2.md clauses 3–5: separated original sources and actual Ask pipeline/provider audit behavior remain unchanged; no replacement retrieval/answer implementation.
- qa/contracts/t056-answer-policy-simulator.md clauses 2–4 and 8 provide adjacent tenancy, provenance and focused sample/downstream requirements. Its scope explicitly excludes durable application/history/review; it cannot alone certify this change. Checker must adopt/map the durable acceptance requirements before a PASS. Maker does not edit qa/contracts/.
- qa/verdicts/t056-conflicts.md cycle 1 is historical scoped store/service PASS, not a verdict for this release guard. No issue-fix corpus is claimed or substituted.

## Changed behavior and immediate consumers

1. answer-workflow.ts extracts snapshotFreshness: candidateDigest equals digest(candidate), evidenceDigest equals digest(evidence), trusted verify accepts current evidence; effective policy lookup must still match selected policy id/version or remain absent for a default-policy run.
2. freshness retains existing recursive conflict-resolution lineage checks and calls snapshotFreshness first. published independently validates the snapshot before returning get/history results; stale state withholds answer, sources, scored nodes, audit and sourceEvidence. Existing descendant conflict semantics remain separate.
3. queue validates freshness before exposing candidate/evidence; failures return a sanitized candidate and empty evidence. Review approval still requires freshness plus existing store CAS; no new write path or tenant identity source.
4. Existing direct callers: apps/api/src/answer-policy/answer-router.ts authenticated history/review endpoints; apps/api/src/routes/ask/ask.ts saved-policy execution. Composition owner: apps/api/src/composition/integrations/answers.ts supplies durable Mongo adapters and visibility-backed evidence verifier. This maker does not lease those consumers.
5. Fixture consumers: answer-workflow.test.ts uses actual askV2 with in-memory stores/offline structural providers; answer-router.test.ts exercises actual HTTP access/scopes. answer-persistence.test.ts separately covers durable adapter CAS and transcript overlays; this patch does not change that adapter.

Security flags: tenant isolation, evidence disclosure, stored answer release and approval writes. Auth remains verified req.auth tenant; no secrets are read. Policy lookup or evidence-verification exceptions fail closed at read release. This is not proof of cross-collection atomicity or a live Mongo review transaction.

## Candidate identity

Git base at metadata capture: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a. Both changed files were already modified in the shared working tree; do not attribute their entire git diff to this maker. Earlier goal-t056 specs are historical and are not an exact pre-edit baseline claim.

| Path | Current SHA256 |
|---|---|
| apps/api/src/answer-policy/answer-workflow.ts | E82864A8893EA8D5B08EEC7A2D5329BBFC746E1627B3891E0CA7F97AEC94D5A0 |
| apps/api/src/answer-policy/answer-workflow.test.ts | F3CA9A5034B2A0B48B3143DF1B1B60746BB512FF8825DF9F0FA6E25E60FF21DC |
| apps/api/src/answer-policy/application.ts | DE29BBF4667D4F345BC1C2D7BB6D5968AC9A5D3267B53F0229229AA514FB6BFB |
| apps/api/src/answer-policy/answer-record-store.ts | C01786804E32D37EA536146AF09AD592E98479BC3AAD2E09F680D535411B60C3 |
| apps/api/src/answer-policy/answer-evidence.ts | 398FE65EA968BD2FC19C8E670ADEC8DFB912375FC9DE3FEDE3B5C64DDDEE1C00 |
| apps/api/src/answer-policy/answer-router.ts | 009CD93B3394C8C12AEBDFA1429D96ED9DECB1874E714FB2F3BAA1CF590372E6 |
| apps/api/src/answer-policy/answer-router.test.ts | 53FE0EB3CC866DE35131C3914C67F3550C20D26E012249D46FFBC95761018171 |
| apps/api/src/composition/integrations/answers.ts | 14E0AEBDB481C4DD258A921EF850AB7973C5BC4E65F62A9239AF3B4B816EACA8 |

Packet and manifest are new metadata files with no prior base. They are not included in the source candidate hash claim.

## Mandatory minimal nodes — broker verified

Changed behavior nodes in answer-workflow.test.ts:
- saved allowed and approved answers fail closed after policy revision, retirement or contradiction
- new saved policy invalidates a default-policy answer and its pending review
- stored candidate and evidence digest corruption cannot release or expose review content

Immediate downstream node in answer-router.test.ts:
- actual history/answer-review endpoints separate candidate access, bind verified tenant and require review write scope

The broker selected these exact four nodes with the following command shape from repo root; raw receipt records the exact arguments:

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern='^(saved allowed and approved answers fail closed after policy revision, retirement or contradiction|new saved policy invalidates a default-policy answer and its pending review|stored candidate and evidence digest corruption cannot release or expose review content|actual history/answer-review endpoints separate candidate access, bind verified tenant and require review write scope)$' --import tsx apps/api/src/answer-policy/answer-workflow.test.ts apps/api/src/answer-policy/answer-router.test.ts
```

Required dependencies: existing node_modules/tsx and workspace imports; offline fixtures only. No credential/env values required; no live database/provider. Broker wrapper must enforce an overall timeout and capture executable/lock/import/environment identity and exact output. Existing shared HTTP/node execution used require_escalated with automatic approval on Windows; that receipt does not authorize this new command. Do not retry a known subprocess restriction as if unobserved. No mutation test is requested.

Independent review determines any additional minimal regression nodes; the existing lineage tests are particularly relevant because freshness was extracted. No full-suite or durable-policy checker verdict follows from the focused green receipt alone.

## Compact current evidence identity

- Raw receipt: qa/goal-vectorless-2026-10-15/verification-answer-policy-four-20261015T0950.json; SHA256 46AEC267D3213E2A5083F1C49A8AC923461C2A0002A2CE0A166338759EF8C434. stdout/stderr use the same stem with .stdout.txt/.stderr.txt. Four mandatory nodes above passed4/4,fail0,skip0,exit0; elapsed2533.8524ms, node duration2422.0644ms. UTC started08:40:45.599,completed08:40:48.135 on2026-10-15 (filename label is not the execution clock).
- Scoped candidate identity from receipt: 4d26285ce1dc2473016e66ec1eeb3c47db0166242f3f1b8cdfcf6ef70dff2705; it hashes the receipt's ordered scoped pins, not a Git commit. Workflow/test and downstream test pins match the table above; receipt hashesUnchanged=true. The full pin map stays linked in raw JSON, not duplicated into reviewer context.
- Node24.19.0 executable SHA256 3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237; lock2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd; environment1c84569ca4a508b42d8b1c71e1dcb76c259b9f05b50cca20ff8f057e299ab8e2. Local mock provider/database + loopback only; approved escalated Windows runtime. No live/provider claim.
- Frozen-validator receipt qa/goal-vectorless-2026-10-15/verification-frozen-contracts-20261015T0914.json: Python312 -B contracts/verify_contracts.py,exit0,162.89ms, "no frozen contracts yet ... PASS by vacuity". Current validator1240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3 and registryD31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940 match receipt pins; this supplies no behavior coverage.

## Evidence reuse and cost honesty

Context only: qa/goal-vectorless-2026-10-15/verification-api-remaining49-20261015T0925.json reports 47 PASS / 2 SKIP. Its command/testIDs include no answer-workflow or answer-router nodes, so none of the four required nodes above is covered. Root also reports three typed-fixture source drifts; do not infer current full reuse. Earlier verification-api-coherent-20261015T0855.json contains 69 PASS / 3 FAIL / 2 SKIP, not green evidence.

qa/evidence/goal-t056/api-affected-downstream-spec.json is a historical request/spec, not proof of execution; both changed-file pins differ. Current focused execution is the broker receipt above. Actual token and monetary usage are unavailable. Estimated or historical test budgets must not be presented as measured costs. Full T-056 UI/live integration, human review and parent acceptance remain open.
