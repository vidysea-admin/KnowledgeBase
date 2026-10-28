# Checker packet: t022-executed-provenance / cycle 0

Status: ready-for-check
Handshake status: ready-for-check
Fix cycle: 0
Reviewer dispatch: HOLD under qa/coordination/knowledge-brain-20261015/quality-delivery/review-budget-prep/admission-hold.md.

Root: C:/Users/product/Desktop/KnowledgeBase
Base SHA: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
Candidate ID: sha256:5a4e4793d7850e980745c9f7c20b3fc1ace30f6cb6f5e6f79b8c9a198b5633d2
Candidate inventory: qa/packets/t022-executed-provenance.inventory
Candidate algorithm: SHA-256 over UTF-8 without BOM, source-owned changed paths sorted ascending; each line is repo-relative path + ASCII space + lowercase raw-file SHA-256 + LF, including final LF. Self-referential QA identity/handshake metadata is excluded from source candidate identity.
Candidate SHA: no new commit; working-tree candidate with source hashes below. No pre-edit working-tree byte snapshot was retained; git base plus scoped diff and final hashes are available. Preserve unrelated work.

## Authorized behavior and clauses

Tier 3 T-022/U0.10 narrow engineering gap. `qa/contracts/goal-t022.md` C5/C8 require judge implementation/source/routing provenance; C9 requires current downstream results; C10 requires matching source/check evidence. Existing actual92 evaluator is frozen and untouched. No new threshold, routing change, human approval, provider execution or task closure.

Previously the runner checked five source files at module entry, before calls and after execution, missing the actual AI router/adapters/parser/barrel. Ordered-provider receipt consumption also accepted predecessor objects with missing or stale implementation fingerprints. The patch expands those existing checkpoints to a deterministic conservative inventory and requires predecessor before/after identities to equal the current one.

## Changed files / final byte identity

- scripts/eval/human-calibration.mjs SHA-256 `BB91820014DA89802E0641A4A232551C32D0FCE498FEE7F37F45C0798DF6AA6C`
- scripts/eval/human-calibration.test.mjs SHA-256 `6D9766EA7F67FDCF8530423F108D45EC2B9299C379E3064461DF4DCF5045DF63`
- New maker metadata: qa/manifests/t022-executed-provenance.md and this packet; neither existed at unit start.
- pnpm-lock.yaml observed SHA-256 `2AF3AADA247F31436A28F46F4803DC8B4294956C21825F7421CA37FAF07D83DD`; unchanged by this unit.

## Change map / consumers

`implementationBindings`: existing five sources, all non-test .ts files under packages/ai/src, root/package/lock/workspace/TS resolution inputs. Includes the eagerly imported barrel, router, both actual adapters, parser, trace registry and its local consumers. Added/removed source inventory changes identity. AI-source symlinks and runtime dynamic import/require syntax refuse pending a resolution policy.

Actual process identity: canonical executable path, Node version/platform/architecture, hashed execArgv/NODE_OPTIONS; no plaintext option/environment values. Actual @lkb/ai resolution from score.ts must canonicalize to packages/ai/src/index.ts. Actual tsx/esm/api resolved entry is byte-hashed. Pins are checked by the runner's existing before-import, after-setup/before-call, and after-execution consumers.

`validateHumanProviderOrder`: every required predecessor must carry both implementationBindings and bindingsAfterExecution matching the current identity before arithmetic/chain acceptance. Its existing input-reference, counter, ordering and predecessor hash checks remain. `runHumanCalibration` passes the exact measured current identity explicitly.

This is conservative **local inventory**, not a certified universal dependency closure. External transitive package bytes are lock-bound but not independently verified. The report states this limitation. Dynamic-import refusal applies to inventoried AI sources; existing explicitly pinned runner/helper literal imports remain as before. Arbitrary malicious rewrites and third-party installation integrity are not certified. No broker call has imported/executed provider code for this unit.

## Proposed execution / impact reasons

Sole execution broker must run under its established bounded command/host policy, capture exact executable/version/working directory, source hashes, lock hash, elapsed seconds, full output and exit code:

`node --test --test-name-pattern "executed provenance" scripts/eval/human-calibration.test.mjs`

Two new nonprivate tests. The affected collector test copies only source/config bytes into a synthetic temporary directory, measures router/adapter/parser/barrel/lock/config drift, added file inventory, unresolved dynamic dependency refusal and missing entry refusal, then deletes only its owned named temporary tree. The immediate downstream predecessor test uses explicitly fictional 30-pair references and counters, accepts identical current identity, rejects missing/stale before/after/runtime identity, and checks the Gemini chained consumer. No raw private corpus is copied; no KB_T022_PRIVATE_REVIEW_TESTS=1 is needed or authorized by this request. Existing private ordering fixture gains the now-required identities but is not executed here. Shared TS imports load on this test file's existing import path; no provider operations, DB, network or browser are requested.

Required repository definition-of-done check: `python contracts/verify_contracts.py` under broker's established interpreter, with its actual output and empty-registry limitation. Full integration/live/human gates stay open and cannot be inferred from these focused receipts. Any mandatory source-refusal/mutation check should run only in an isolated copy with timeout, byte backup, trap restoration and byte comparison per AGENTS.md; maker has performed no mutation runs.

## Broker evidence reconciliation (source unchanged)

Shared raw receipt: `qa/goal-vectorless-2026-10-15/verification-quality-six-unit-twenty-six.json`; exact selected-ID/private-opt-in mapping: `qa/goal-vectorless-2026-10-15/verification-quality-six-unit-twenty-six-units.json`; full output: `qa/goal-vectorless-2026-10-15/verification-quality-six-unit-twenty-six.stdout.txt` and `.stderr.txt`.

The shared exact command is retained in that JSON, including `--import tsx`, serial concurrency, 30-second per-test timeout and the anchored 26-name selection. It is authoritative over the earlier proposed standalone command. Shared run own exit 0; 26 tests passed, zero failures/skips. The two exact `executed provenance ...` names above passed and map only to this unit. There was **no standalone unit process exit**. Shared elapsed 6096.396ms (2026-10-15T10:51:54.028Z–10:52:00.126Z) is charged once centrally, not apportioned or charged again to this maker/checker.

Runtime: `C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`, v24.19.0, executable SHA-256 `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`; Windows broker escalation was automatically approved. Import root is this repository. Environment fingerprint `1f6b045ea8ea78388b899ea4c9e324c4cb6e81929b685d030acc40df41e48bac`; whitelisted NODE_ENV/NODE_OPTIONS/TSX_TSCONFIG_PATH were unset. Unit mapping records KB_T022_PRIVATE_REVIEW_TESTS genuinely removed before child inheritance. This was the pure two-case scope; no private labels were exercised.

Broker before/after pins agree (62 total, no drift), including both exact source pins in this packet and unchanged pnpm lock hash. This unit's source-inventory candidate ID is distinct from the broker's aggregate 26-test candidate hash; matching source pins and named-ID mapping reconcile them, without relabeling the aggregate as the unit ID. Maker independently reread both current source hashes, lock and inventory digest after receiving the receipt; all match.

The initial receipt's explicit 62 dependency pins alone did not enumerate every file in the collector's conservative local inventory or its resolved ESM API entry. That local-inventory evidence gap is now covered by the separate actual-collector receipt below. No universal external transitive-byte closure is claimed.

## Actual collector / final public checkpoint

Actual affected-stage inspection receipt: `qa/goal-vectorless-2026-10-15/verification-t022-actual-inventory.json`, with full `.stdout.txt`/`.stderr.txt`. Exact command is the same bundled Node executable plus `qa/evidence/t022-executed-provenance/inspect-actual.mjs`; own exit0, 372.2042ms, 2026-10-15T11:02:24.475Z–11:02:24.850Z. Its scope/testID string still says "expected exit2 refusal"; that is stale descriptive metadata, not the observed result. Actual exit/output are successful and are the evidence used here.

Output states `current-local-inventory-verified`: 42 source/config files including 29 AI sources, 48 direct pins, identical before/after membership and bytes, canonical expected AI entry, actual ESM tsx API entry and actual executable bound. It acquired no private corpus and made zero provider calls. The probe independently read raw sources/config/lock, source and test pins, its own script/spec, actual resolved entries and executable before/after, and compared the real exported collector's entire file list to that inventory.

Actual inventory digest `d616811c46e5265e88862ff3ad54621030a54403150d09d11618dcb8405eae8a`; direct-scope digest `b12676bb5a71bb017deabbf22d420bca285355a03c0b809917cf8b67ce823e59`; collector digest `5a04f97a5c3f21d06b982fdd61d4535568790edc3f1a38e37429474e64f00e5b`. Probe hash `92dd7132467707a9034cfac05d4ae720af2ed3d70ea9afece18701da36b5c513`; broker-spec hash `8063b531c7565219417935f5689e5c1093cb68e0dfa67286f76c37804b6f2295`. Source pins, Node executable/version/hash, lock and whitelisted environment fingerprint match the earlier shared run. Different invocation option hashes are correctly distinct execution identities; this inspection does not impersonate a live calibration run. External transitive bytes remain uncertified.

Central checkpoint `qa/coordination/knowledge-brain-20261015/final-shared-public-checkpoint.json` records `FINAL_SHARED_SOURCE_FROZEN_NOT_CHECKED`, 18 public shared files plus six selector bindings, drift empty. It is a shared-source snapshot, not a checker verdict or whole-repository acceptance. This unit's candidate remains the same two-source inventory ID above; neither broker aggregate hash replaces it.

Mandatory verifier now present: `qa/goal-vectorless-2026-10-15/verification-final-frozen-contracts.json` plus full `.stdout.txt`/`.stderr.txt`. Exact command: `C:/Users/product/Desktop/KnowledgeBase/.venv/Scripts/python.exe -B contracts/verify_contracts.py`; Python3.12.10, own exit0, 192.9503ms, 2026-10-15T11:06:27.09Z–11:06:27.286Z, no pinned drift. Output: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. This proves required command execution only; it certifies no frozen-contract content. Historical `verification-frozen-contracts-20261015T0914.json` remains historical, not silently reused. No separate changed-TypeScript typecheck gate is introduced by this MJS-only unit; the focused tests and actual inspection parse/load the changed implementation. Any centrally mandatory static/integration gate remains separately governed, not fabricated as passed here.

## Evidence / readiness / accounting

No tests, provider calls, shared-import execution, DB or network have been run directly by this maker. Broker shared focused receipt, actual collector receipt, current required verifier and final public checkpoint are linked above. Readiness self-check reread both raw source hashes and the candidate inventory digest unchanged; scoped affected-stage/immediate-downstream/verifier evidence is complete, with no additional mandatory static gate identified for this source-only MJS unit. Packet and manifest are consistently ready-for-check for cycle0 and the exact candidate ID above. This is not independent PASS or parent completion.

Reviewer admission remains explicitly HOLD under `qa/coordination/knowledge-brain-20261015/quality-delivery/review-budget-prep/admission-hold.md`: canonical actual_total helper installation, finite per-unit actual-total ceilings and fresh canonical assess are required before dispatch; old 6000-token allocations do not authorize it. No reviewer is dispatched. Required independent checker skill: C:/Users/product/.agents/skills/checker/SKILL.md; assess gate before dispatch and each material review phase. Checker alone writes qa/verdicts/t022-executed-provenance.md.

Maker actual active seconds/tokens/cost: unknown (null), not estimated. No execution child/retry usage exists. Wait time not counted as measured work; no efficiency-success claim. Use explicitly bounded BOOTSTRAP_REVIEW if denominators remain unavailable. Historical/shared integration costs remain separately attributed.

Security flags: this source reads owned source/config identity and writes the already-authorized separately named calibration output; no new tenant/auth/credential access or provider spend is introduced. Runtime option values are hashed. Existing genuine-human checks, call caps and output no-overwrite remain unchanged. All current 30 human reviews and actual provider calibration are still unproven/open.
