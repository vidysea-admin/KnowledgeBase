Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
CODE-REVIEW: PASS
PUSH-CANDIDATE: YES
SENIOR: Approve
DATA: Approve within this CI repair's snapshot, owner-isolation and corpus-preservation scope; no production ingestion logic changed.
PARENT: CONTINUE-NEEDED
ISSUES-WRITTEN: none
FAILURES: none

Fresh independent primary review against f6bf0597ca8340c7e92430515f617be87914212e. No sibling current verdict/evidence used. Installed checker and senior/data guidance read; this checker performed the applicable instruments directly under the explicit no-agent boundary. No agents, credentials, network, browser, production access, shared-source mutations, commit or push.

CHECK-PLAN: WEB -> actual stage/import closure plus verified copied-context build and isolated missing-COPY falsification; STRUCTURE -> exact historical bodies/AST calls/assertions, CI reachability, recorded ISS-298 replay and removed-assertion falsification; CACHE -> exact moved-body comparison, caller/readOnly/TTL/authority/invalidation review, focused actual enforcement/downstream checks and cached-authority falsification; API -> original assertion preservation, real VM/error identity and no-query refusal, unauthorized-owner falsification. Four criteria evidenced, four intended falsifications killed. No broad suite/TSC/build repeats.

CHECKED-STATE: current HEAD equals base f6bf0597. All four request identity hashes match: maker policy 236bc0e7c075f9729ef464dbd8aa2bdbec02754e95e228c936480c96d4c8fe39; checker protocol 835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1; structure config c8a801f40f53e5ba84b63bca2012e732d5b4f15526f75c754eb7fe86ddaf4928; pnpm lock a42c0cd17ac0b2afda449c0b00c0de9ea02923319800accb3c01faf6570b10fd. Runtime v24.13.1-win32-x64. Manifest SHA256 38292fe506b299f517052fd32d9ad1b18775cfdf63bdc8055a38d23879b89f95 matches handoff.

Source SHA256 and canonical Git blob checks match qa/.delivery/runtime/ci-release-source-identity.json for all nine code/test/config entries: eight existing files plus the absent allocator test. Each canonical entry also matches final committed fixture 6c84fe3de204ebbd1050f4c4e97e59c22a0f81bc. Fixture tracked state is clean. Fixture diff from the same base contains exactly those nine entries. Root's additional changes are D-194's eight-line append and two TASKS.md note replacements retaining statuses; these are not executable-input parity claims.

WEB: Dockerfile:43 copies the existing policy subtree into web-build before its build. Both frontend imports resolve at their preserved paths. The complete five-file closure is join-rules.ts, platform.ts, join-rules-normalize.ts, join-rules-optout.ts and meeting-identity.ts; no external/dynamic/Node dependency found. The unchanged .dockerignore permits them. A read-only SHA256 walk matched 341 current web source/config/policy files to the actual short-context build copy. Raw logs web-short-context-red.log, web-short-context-green.log and web-short-context-vite.log plus web-build-short-context.json record before TS2307 at both imports, after TypeScript exit 0 and Vite exit 0. Reused, not rerun. This proves host copied-context compilation, not an image/container run.

STRUCTURE: normalized original retained body and transferred fix1 body are verbatim substrings of the merged file. TypeScript AST comparison independently proves every complete test call is retained: 29 declaration sites = 20 + 9, yielding 31 registered cases with the original loop. All titles and 110 assertion sites preserved. Existing test lexical scopes, LF/CRLF defaults, temp-only append/cleanup, real-ledger read-only access and Windows-only ACL skip remain intact. Measured 399 nonblank lines and 30 files; budgets/validators unchanged. package.json's test:lint is the exact old command plus scripts/qa/ledger-alloc.test.mjs; .github/workflows/ci.yml:104 runs pnpm test:lint. Deleted historical file remains readable from the pinned Git base.

CACHE: normalized body comparison proves the moved block is identical after exactly the approved signature/result typing, degraded(c,event) -> notifyDegraded(event), and dirname -> path.dirname substitutions. There remains one handler and one rejected-authority set. join-rules-last-valid.ts:134 binds endpoint/key/tenant; :139 invalidates hard failures and respects readOnly for unlink; :161 gates persistence; :178 checks cached authority/tenant; :180 keeps original expiry. Enforcement :109 suppresses readOnly alerts and contains alert failures; :167 passes that wrapper; :183 uses the same authenticated document for reselection. Canonical authoritative-store/lock helpers are unchanged; remote snapshot I/O remains transitive and is not described as write-free enforcement. Existing single-writer 6/6 and final structure 10/10/no dependency violations were inspected and reused.

API/DATA: production store.ts is unchanged. VM supplies the actual Mongo error constructors and imported WhatsAppUnavailableError. AST comparison preserves all 13 original assert expressions in order; current total 16. The actual test proves unauthorized owner b is rejected before connections or queries, all archive queries are owner-qualified, and writes retain tenant a. Three archive fixture messages become exactly two authorized turns; the foreign third is excluded. Mutating archive order, IDs, payload, labels and Date objects after the first write cannot alter snapshot-derived IDs, Unicode text, labels, timestamps, offsets, session date or consent provenance. No record-count, schema, idempotency or production-write behavior changed in this scope.

Independent commands/results, each executed through spawnSync with a finite 60,000 ms timeout:

```text
node --test --import tsx "--test-name-pattern=remote snapshots|remote policy is authoritative" scripts/webinar/scheduler/deps-runtime.test.mjs
exit 0; tests 2, pass 2, fail 0 (credential rotation/revocation, transient-only fallback, exact expiry, readOnly cache/alerts, persistence failure)

node --test --import tsx apps/api/src/whatsapp/store-mongo-snapshot.test.ts
exit 0; tests 1, pass 1, fail 0

node --test "--test-name-pattern=ISS-298|numbering: a lane" scripts/qa/ledger-alloc.test.mjs
exit 0; tests 2, pass 2, fail 0; ISS-298: 5/5 against recorded reproduction

node --test --import tsx "--test-name-pattern=selection and veto consume one verified document" packages/meeting-bot/src/calendar/join-rules/join-rules-approved-trust-tick.test.ts
exit 0; tests 1, pass 1, fail 0
```

Read-only Node-stdin identity/preservation instruments used fs SHA256, git hash-object --path=<file> <file>, git -C <fixture> rev-parse <commit>:<file>, git show f6bf0597:<file>, normalized exact-body comparison, TypeScript createSourceFile AST call comparison and exact package-script prefix comparison. Results: policy/config/dependency 4/4, final code identity 9/9, allocator bodies 2/2, declarations 29/29, assertion sites 110/110, API original expressions 13/13, copied web inputs 341/341. A preliminary textual test-call regex counted strings embedded in test code; AST counts above are the authoritative declaration count.

Bounded falsifications used only C:\Users\Lenovo\AppData\Local\Temp\ci-primary-owned-7NQa3r. Each subprocess had timeout 30,000 ms; each mutation restored its byte backup in finally and verified Buffer.equals. Outer finally removed only the resolved owned temp directory. Shared source and committed fixture were never mutated.

```text
WEB:
node --test "--test-name-pattern=web-build copies" <owned>\scripts\qa\dockerfile-media-tool.test.mjs
green exit 0, 1/1. Remove only the policy COPY in owned Dockerfile: exit 1, intended assertion "web-build source missing: packages/ingest/src/join-policy/join-rules.ts". Byte restoration MATCH.

CACHE:
node --import tsx <owned>\cache-probe.mjs
green exit 0. Probe imports the actual copied helper with adjacent imports redirected to unchanged source, caches key-a then simulates ECONNREFUSED under key-b, asserting 'error' in result. Remove only "cached.authority !== authority || " in owned snapshot.ts: exit 1, intended assertion "different credential must refuse the previous credential snapshot". Byte restoration MATCH.

API:
node --test --import tsx <owned>\api\store-mongo-snapshot.test.ts
green exit 0, 1/1. In owned store.ts replace the invalid-owner throw with return of fixture owner 111111111111111111111111: exit 1, intended assertion "Missing expected rejection." Real imported error identity and VM assertions remain unchanged. Byte restoration MATCH.

STRUCTURE:
node <owned>\corpus-probe.cjs <owned>\ledger-copy.mjs
green exit 0, assertion sites 110/110. Probe asserts (text.match(/\bassert\.[A-Za-z]+\(/g)||[]).length === 110. Remove only the transferred lane-C namespace assertion: exit 1, actual 109, expected 110, intended assertion "original corpus assertion count". Byte restoration MATCH.
```

Reusable integration evidence: actual committed fixture 3770186e35f4f9a223646259d84467dc47117a33 ran the modified pnpm test:lint command: 176 tests, 176 pass, 0 fail, 0 skipped, 39,759.3258 ms, exit 0, clean tracked state. Original-versus-final Git diff independently confirms the sole later change is removal of one extra EOF LF in the snapshot helper; seven other existing code files and deletion are identical. Final fixture 6c84fe3d matches all nine current canonical entries and received catalogue/single-writer follow-up 19/19. Raw ci-committed-fixture-test-lint-final.log and ci-fixture-eof-followup.log inspected. No claim that the original 176 run used the later byte identity. Windows longpath/dependency setup failures were repaired before those runs and are not counted as passing executions. Existing affected closure 72/72, WhatsApp/owner/routes 19/19 and structure 10/10 raw summaries were also inspected, not rerun.

REMAINING for this CODE verdict: none. Branch-push candidate approval only; both required blind decisions remain the parent's closeout condition. Actual Docker daemon is unavailable locally; new image/main CI must be checked after separately authorized branch push. No Docker, deploy, unattended-runtime or production acceptance claimed.

Full original C1-C8 remains CONTINUE-NEEDED: complete actual Calendar/Gmail comparison including missing/skipped/cancelled events; configured authenticated Windows account/host bridge and shared durable coverage; actual all-join/rule/opt-out attendance without RSVP changes; timezone/dedup/notification behavior on real feeds; independent two-slot real AV, cancellation/reschedule/interruption/restart/capacity evidence and seven-day observation; server role/key/account/review/WhatsApp/connector configuration; source-grounded repair proposals with separately approved production promotion; actual capture -> transcript -> extraction -> index -> provider-backed cited Ask; independent Ubuntu portability and final semantic gates. No original task/status closes through this CODE approval.

LIVE-BROWSER: not applicable to this packaging/refactor/test-harness CODE scope; runtime/browser work explicitly excluded.
Metrics: start=unavailable end=2026-10-27T16:18:40Z wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable builder_min=unavailable check_min=unavailable maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17
Metrics note: independent execution comprised four focused acceptance commands (six passing tests), four isolated green controls and four intended mutant failures. No helper agent. Sandbox process startup failed twice; approved escalated read-only/focused execution succeeded. Exact elapsed telemetry unavailable, not zero. Temporary missing-path/read/PowerShell-parser attempts were not counted as passing checks.
