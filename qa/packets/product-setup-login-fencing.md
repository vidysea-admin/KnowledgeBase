# product-setup-login-fencing — cycle 0 maker packet

Root: C:/Users/product/Desktop/KnowledgeBase. Base/candidate HEAD 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; candidate includes uncommitted tracked changes, identified by the exact hashes below. Manifest qa/manifests/product-setup-login-fencing.md remains BUILDING pending broker checks. Source writes frozen by maker at these hashes. Independent checker owns qa/verdicts/product-setup-login-fencing.md; maker does not issue verdicts.

## Authorization, contract and scope

Integration coordinator granted only apps/web/src/pages/setup-wizard/SetupWizardPage.tsx, setupModel.ts and SetupWizardPage.test.tsx. Priority tier 3, T-057 E4 onboarding; same-key authentication safety is uncapped security class. One historical setup PASS exists (qa/verdicts/t057-e4-setup-wizard.md). No filed issue claimed fixed and no substitute ledger corpus.

Applicable authority: AGENTS.md; D-170 source implementation authorization; qa/contracts/goal-t057.md C6 current apiKey/sessionVersion/refresh identity, no unauthenticated display/request and existing transport preserved; C7 immediate producer/consumer focused evidence; C8 actual browser evidence remains unavailable and unclaimed; C9 frozen truthful file handshake. This is a scoped extension of E4, not satisfaction of C1-C18 or whole-parent T-057.

## Changed behavior and exact pins

| Path | Pre-edit SHA256 | Candidate SHA256 |
|---|---|---|
| apps/web/src/pages/setup-wizard/SetupWizardPage.tsx | 1e0e873432306e5c16e0ddad91d29efab01ee4e860404b712bd1a4e34eea86b9 | 8bba40ee375cc0310778d51a7f26db245ea498ab720f6104c418caf6693d3b46 |
| apps/web/src/pages/setup-wizard/setupModel.ts | 734b2e1891fd23274df2dcb74cd70f940746068cfcceadc17d1c5d5cada13fd5 | c30a66eadb0d02f9474e720b784947b18f44e7247b9a6407cc2c6ea02be86c87 |
| apps/web/src/pages/setup-wizard/SetupWizardPage.test.tsx | c36570c4ebe0abd0a139e4f5e170d5aef81c6f6c3066506e1695e37eb0e5adf5 | 27d74f4de4a0acc7552e970c160f8ad5ed608393fa462ee58d5010d6a04b2d81 |

SetupWizardPage consumes useAuth.sessionVersion, stores version in each completed snapshot, checks apiKey+version+generation before displaying it, and restarts/cancels its effect on version changes. Existing cancelled effect prevents obsolete completions from replacing current data. Explicit apiKey guard ensures logged-out content never displays. Same-key login invalidates the previous checklist immediately, including React-batched logout/login. Four existing read requests remain bounded and unchanged.

setupModel.buildItems keeps Gemini's existing presence boolean but treats its absence as optional To do, no longer declaring unrelated AI capabilities unavailable. A configured key explicitly does not prove a working model. A new always-Unknown readiness item tells users that current endpoints do not test provider runtime/model access/routing/output and names the next sample verification step; no new endpoint/model probe/provider claim.

Test consumer adds four real-AuthProvider/shared-client scenarios with deferred /system-status snapshots: completed checklist same-key login invalidation; old success while new login pending; old 401 after current same-key login success; refresh then logout with late completion. Existing endpoint-count/no-secrets assertions remain and model expectations reflect honest configuration/readiness separation.

## Immediate consumers and security boundaries

| Path | SHA256 | Relevance |
|---|---|---|
| apps/web/src/auth/AuthContext.tsx | 196181dc165208a35cb23c9d7f9b7ae5e293a7eb40135a7cd90686ddb4ec3e1c | setApiKey/clearApiKey increment sessionVersion even when credential reused; actual consumer exercised by tests |
| apps/web/src/api/client.ts | 854f0bc3301e097b83e2caefcd01a8eae19530e3a6390add4dd6c9cfaf429802 | apiFetch current authSession fences old 401; transport remains unchanged |
| apps/api/src/activity-health/setup-status.ts | 200866b369e1c4f4157a420cddf25f142adc6a9c1d6b75b8fab6e087cb28fa99 | existing authenticated booleans-only producer; no new API/config keys |
| apps/web/package.json | df657c35ff929f98bba82399f616c5b201a02a2c07c66d71905ca55cb720528e | existing vitest/typecheck commands/dependencies |
| apps/web/vite.config.ts | 2f6affa66eab3926da4415e4252033fd52b99284f0ac78ba3c666c273bc1e938 | actual Vite/Vitest configuration |

App.tsx mounts /setup and NavSidebar links it; existing test imports actual App source and mounts NavSidebar. Shared composition remains centrally owned; broker must capture its current hashes with final environment receipt before READY. AuthContext lines defining sessionVersion and setApiKey/clearApiKey, apiFetch/invalidateAuth, and SetupWizardPage useEffect/current expression are sufficient navigation; source/diff remain authoritative.

Auth=true: authenticated checklist display. Tenancy=true: stale authenticated source-count/join-rule-derived information must not survive login changes. Writes=false: only unchanged four GET reads; test-only browser key persistence belongs to existing AuthProvider. Credentials=false for changed logic: no new credential read, storage, logging, URL, server target or outbound provider operation. Existing shared API-key transport preserved. No migration/schema/generated/dependencies/server/App/tracker/enforcement edits.

## Broker request and evidence state

No local tests/builds executed. Sole verification_broker should run bounded focused Vitest for apps/web/src/pages/setup-wizard/SetupWizardPage.test.tsx, then affected web typecheck if permitted by its CPU lease. Proposed cwd apps/web: existing pnpm test -- src/pages/setup-wizard/SetupWizardPage.test.tsx (Vitest run script) and pnpm typecheck. Default 30-second broker bound; actual executable/environment and isolated worker arguments are broker-owned, retain compatible installed environment. Capture exact commands, output/counts/exit/duration and before/after source/dependency hashes. Frozen-contract verifier is a repository required check; route through broker as required, disclose any trivial/vacuous contract result. No browser/network/live DB/provider/external effects or full suite.

Actual maker token/cost usage unknown; active implementation accounting unknown, not measured efficiency success. Independent review planned finite BOOTSTRAP_REVIEW 120 seconds / 3000 allocated tokens with protected completion reserve and skill helper assess gate, coordinator-controlled; checker admission pending. No independent dispatch or tests from this worker. Actual browser, live provider success, parent catalogue acceptance and every existing T057 live gate remain HOLD/unproven.

## Canonical protected dispatch assessment

Explicitly loaded C:/Users/product/.agents/skills/checker/SKILL.md and ran its canonical scripts/review_budget.py assess helper using C:/Program Files/Python312/python.exe. Input: qa/coordination/knowledge-brain-20261015/product-delivery/t057-setup-assess-input.json. Result: qa/coordination/knowledge-brain-20261015/product-delivery/t057-setup-assess-result.json. Exit 0; BOOTSTRAP_REVIEW; exceeded=[]; ratio_verified=false; completion_reserve protected. Total allocation120s/3000tokens, review90s/2200, finalization30s/800 inside that total. No reviewer has launched for this unique unit; pre-dispatch time/tokens are zero, maker actuals/cost remain null. Replace the pre-dispatch row with actual metrics or positive conservative debit after dispatch; retain all subsequent rows/retries, and assess finalization only with that updated ledger.

Exact cycle0 candidate fingerprint: 236481551c092f4897a2e4415938dc4e2868232d6b958fc40e513189d827b60a, computed as SHA256 of UTF-8 records in the source-table order, each `path TAB lowercase SHA256 LF`. Exact reserve identity: product-setup-login-fencing/cycle0/236481551c092f4897a2e4415938dc4e2868232d6b958fc40e513189d827b60a. The gate input includes all three current raw-byte pins. No source edits/tests/builds occurred during admission preparation. Manifest remains BUILDING pending broker evidence; assessment alone does not authorize a missing-evidence verdict or checker dispatch.

## Minimal runnable fixture and staged baseline

Coordinator reports current per-file broker baseline20/20 passing for this exact test file; composite integration remains pending. This is attributed coordinator evidence, not an independent maker/checker execution or receipt authentication. Broker's immutable command/environment/pin receipts must be linked and checked before READY; no unavailable receipt path is invented here.

Existing runnable fixture is apps/web/src/pages/setup-wizard/SetupWizardPage.test.tsx. It mounts the actual AuthProvider and SetupWizardPage with LoginControls invoking actual setApiKey/clearApiKey. holdStatusReads defers only /system-status; the unchanged shared apiFetch transport and real authSession invalidation behavior execute, while all four endpoint responses are hermetic HEALTHY/route fixtures. No live provider/DB/browser/network account is accessed. No new fixture or unrelated source survey is needed to start a scoped probe.

Minimal filtered existing command, cwd C:/Users/product/Desktop/KnowledgeBase/apps/web:

```powershell
pnpm exec vitest run src/pages/setup-wizard/SetupWizardPage.test.tsx -t 'configured integrations:|missing integrations are optional|a completed checklist is immediately hidden|old success cannot fill|old 401 cannot sign out'
```

Expected selection5 tests,15 skipped from the current20-test file (selection count derived from named tests, command not run by maker). Broker retains its existing worker limits and30-second command bound. Exact selected cases:

- configured integrations: checkable items Ready; runtime readiness, scopes and Google remain Unknown — configuration presence cannot establish working model readiness.
- missing integrations are optional To do and cannot establish AI unavailability — no Gemini-only capability assertion.
- a completed checklist is immediately hidden on same-key login, then freshly read — immediate display invalidation and bounded fresh reads.
- old success cannot fill a new same-key login's pending checklist — stale snapshot/sessionVersion boundary.
- old 401 cannot sign out or replace the later same-key login — actual shared-client invalidation respects current login.

Reviewer independently chooses or authors the smallest contract-derived failure probe within its existing budget and broker execution rules. These maker tests identify fixture entry points and baseline scope; they do not substitute for independent reasoning/probe or authorize duplicated broad tests. No new budget gate, source changes, builds or maker test runs occurred for this preparation.

## Independent probe count reconciliation

The independent checker selected the unchanged regex recorded in qa/coordination/knowledge-brain-20261015/product-delivery/checkers/setup-prep-checkpoint.json: `old success cannot fill|old 401 cannot sign out|configured integrations:|missing integrations are optional`. Static matching against all20 current test names yields exactly4 selected and16 skipped. This differs from the broader maker five-case suggestion above, which additionally selected the completed-checklist immediate-reset case. The independent command therefore expects4pass/16skip if execution succeeds; a coordinator's provisional three-case estimate was incorrect. This is static selection reconciliation, not test execution evidence.

Exact independent selected names:

- configured integrations: checkable items Ready; runtime readiness, scopes and Google remain Unknown
- missing integrations are optional To do and cannot establish AI unavailability
- old success cannot fill a new same-key login's pending checklist
- old 401 cannot sign out or replace the later same-key login

Independent regex/assertions remain unchanged. No test execution/source edit occurred during reconciliation; verification_broker and product_delivery_coordinator were notified.


## Attributable composite evidence pointer — 2026-10-15

Receipt: `qa/goal-vectorless-2026-10-15/ui-fourteen-targeted-composite.json`; status `ATTRIBUTABLE_COMPOSITE_READY_FOR_INDEPENDENT_REUSE_DECISION`. This is an attributable reuse-decision input only, not a globally green batch or unit PASS.

- `apps/web/src/pages/setup-wizard/SetupWizardPage.test.tsx`: 20/20 passed, 0 skipped; reporter status `passed`; original batch exit 1; standalone exit unknown/not run. Raw receipt: `qa/goal-vectorless-2026-10-15/verification-frozen-ui-fourteen-20261015T1205.stdout.txt`.

The composite records fourteen per-file rows: thirteen successful original reporter files plus ReviewHistory three-test repair with its own exit 0. Original batch exit 1 remains preserved. The receipt records 201 unchanged other pins, no runtime/environment identity differences (including lock identity), and no shared unhandled/setup failures. ReviewHistory old byte backup/hash authentication and repair diff remain linked at `qa/goal-vectorless-2026-10-15/ui-history-before-authenticated.tsx` and `qa/goal-vectorless-2026-10-15/ui-history-repair.diff`; repair receipt `qa/goal-vectorless-2026-10-15/verification-ui-history-three-repair.json`. These receipt claims are attributed here without a new source scan or execution. Independent checker decides whether exact per-unit evidence is reusable; no standalone success is manufactured from the original batch. Shared batch/repair process costs are counted once, not denominator padding.

FINAL shared schema/core checkpoint and mandatory unit/type/validator receipts remain pending. All six product manifests remain BUILDING; this metadata append changes no readiness, gate, verdict, or source.
