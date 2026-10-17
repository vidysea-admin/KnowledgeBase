# Collections bounded chooser retention

Status: authored; broker execution and independent verdict pending. Fix cycle: 0.
Root: C:/Users/product/Desktop/KnowledgeBase. Priority tier: 3, T-055.
Base/candidate HEAD observed: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; candidate includes uncommitted two-file patch.

Lease: apps/web/src/pages/knowledge/CuratedCollections.tsx and CuratedCollections.test.tsx only. Both tracked and initially clean; no new product files. No central tracker, contract, API, schema or composition edits.

Base SHA256: component cc5ca5ef22cb617a2f7cc949af0dfd525819814ca9a550a389707a755b2d112b; test 52fda13eaf3dae715e426baf42112df27f000df413e1380a49d96d7f2cdcd1a3.
Candidate SHA256: component 6af57e2b05ca643bd15a17ea2d550336dfdd2c3d210a87bb200f6395cfa4ce97; test 84d89021db6758fa80b9e651c0b6d10f75b8d383e8a77884eba557f4bc92d7b3.

Contract: qa/contracts/goal-t055.md C5 saved durable membership; C7 fail-closed auth/tenancy and unavailable-member projection; C8 explicit bounds and usable editing. Scoped repair only; whole T-055 remains open.

Problem: Edit selected only saved members present in bounded /knowledge/members choices. Rename/save silently removed available persisted members outside that returned window.
Change: append available persisted editing members missing from chooser as explicit selectable options, labeled by their already-public saved IDs; select all available persisted members initially. Original saved order survives a rename. Intentional checkbox deselection removes the corresponding member. Server-withheld unavailable members remain omitted and edit-disabled by the existing unavailableMembers boundary. Warning now explains preservation and explicit removal.

Immediate consumers: collectionsClient.ts writeSavedCollection maps kind/id and validates matching deduplicated response; GET client strips unavailable members and propagates generic unavailableMembers. API collections-router.ts PUT validates tenant-owned members; collections-store.ts checks persisted membership and revision before replacement. None modified.

Auth/tenancy/data-write flags: existing authenticated UI initiates PUT writes; behavior changes membership payload selection. No credentials, new I/O, external effects or actual DB writes. Existing auth generation fences remain unchanged.

Authored checks: table-driven component regression verifies bounded-choice rename preserves member order and explicit deselection removes only the desired member. Existing unavailable-ID/no-link/edit-disabled test retained. No execution claims.
Broker request, cwd apps/web: pnpm exec vitest run src/pages/knowledge/CuratedCollections.test.tsx src/pages/knowledge/collectionsClient.test.ts. Coordinator owns typecheck/bundle and contracts/verify_contracts.py requirements and independent checker dispatch. No child tests/builds were run. No network/browser/provider/DB run.

Maker active time/tokens/cost: unknown. Wall wait is not active-time evidence. Efficiency ratio unverified; use bounded bootstrap review if needed. Same-byte receipts, mandatory verification and independent persisted verdict remain owed.

Standard handshake: qa/manifests/collections-bounded-choice-retention.md cycle0/building; verdict target qa/verdicts/collections-bounded-choice-retention.md. Contract/source/consumer/config/lock SHA256 pins: collections-shared-pins.json in this directory. Canonical checker helper dispatch assess retry2 input/result in this directory reports BOOTSTRAP_REVIEW, ratio_verified false, protected30s800 reserve within total120s3000; next review90s2200. Earlier invalid helper attempts retained. Checker must independently phase-assess and preserve all incurred charges; do not treat placeholder not-launched row as measured reviewer usage.

## Independent probe preparation targets

Existing runnable offline harness: apps/web/src/pages/knowledge/CuratedCollections.test.tsx uses Vitest/jsdom, React Testing Library, MemoryRouter/AuthProvider and a stubbed fetch. mount() renders the actual component; reply() supplies mocked authenticated read/write responses. No browser/network/database is needed. The existing mock returns saved collection members separately from the bounded chooser and captures actual PUT body. The checker independently chooses or authors its minimal failure probe in this harness; maker assertions are navigation, not independent proof.

From cwd apps/web, minimal boundary command: `pnpm exec vitest run src/pages/knowledge/CuratedCollections.test.tsx --testNamePattern='editing preserves saved members outside bounded choices|server member unavailable remains inert'`.
Expected selected count: 3 cases (2 table rows plus 1 unavailable-member case); other cases skipped by pattern. Exact table titles: `editing preserves saved members outside bounded choices unless explicitly removed (remove=false)` and `editing preserves saved members outside bounded choices unless explicitly removed (remove=true)`. Exact refusal title: `server member unavailable remains inert and never becomes a guessed profile link`.

Probe targets from C5/C7/C8: an available persisted document omitted from chooser remains selected and retains original member order in a rename PUT; explicitly unchecking that appended option removes only that member; a server-unavailable speaker identifier never appears in text/link and editing stays disabled. The checker may adapt the two independent read responses and inspect actual captured payload/DOM rather than expand into unrelated source surveys.

Current baseline pointer: coordinator-owned union/composite broker receipt is pending explicit attribution; no receipt path or passing count is invented here. Requested baseline scope is component+collectionsClient test files as recorded above. Coordinator must attach the current receipt and verify final hashes before review readiness; these preparation commands have not been executed by maker.


## Attributable composite evidence pointer — 2026-10-15

Receipt: `qa/goal-vectorless-2026-10-15/ui-fourteen-targeted-composite.json`; status `ATTRIBUTABLE_COMPOSITE_READY_FOR_INDEPENDENT_REUSE_DECISION`. This is an attributable reuse-decision input only, not a globally green batch or unit PASS.

- `apps/web/src/pages/knowledge/CuratedCollections.test.tsx`: 6/6 passed, 0 skipped; reporter status `passed`; original batch exit 1; standalone exit unknown/not run. Raw receipt: `qa/goal-vectorless-2026-10-15/verification-frozen-ui-fourteen-20261015T1205.stdout.txt`.
- `apps/web/src/pages/knowledge/collectionsClient.test.ts`: 2/2 passed, 0 skipped; reporter status `passed`; original batch exit 1; standalone exit unknown/not run. Raw receipt: `qa/goal-vectorless-2026-10-15/verification-frozen-ui-fourteen-20261015T1205.stdout.txt`.

The composite records fourteen per-file rows: thirteen successful original reporter files plus ReviewHistory three-test repair with its own exit 0. Original batch exit 1 remains preserved. The receipt records 201 unchanged other pins, no runtime/environment identity differences (including lock identity), and no shared unhandled/setup failures. ReviewHistory old byte backup/hash authentication and repair diff remain linked at `qa/goal-vectorless-2026-10-15/ui-history-before-authenticated.tsx` and `qa/goal-vectorless-2026-10-15/ui-history-repair.diff`; repair receipt `qa/goal-vectorless-2026-10-15/verification-ui-history-three-repair.json`. These receipt claims are attributed here without a new source scan or execution. Independent checker decides whether exact per-unit evidence is reusable; no standalone success is manufactured from the original batch. Shared batch/repair process costs are counted once, not denominator padding.

FINAL shared schema/core checkpoint and mandatory unit/type/validator receipts remain pending. All six product manifests remain BUILDING; this metadata append changes no readiness, gate, verdict, or source.
