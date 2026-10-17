# T054 persistent knowledge freshness warning — maker packet

Root: C:/Users/product/Desktop/KnowledgeBase
Slug: product-transcript-refresh-warning
Fix cycle: 1
Status: BUILDING (broker verification pending)
Base/candidate HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; candidate is HEAD plus exact leased dirty files below, not a clean commit.
Priority: tier 3, useful T-054 product completion. Coordinator granted exact two-file lease.

## Scope and contract
qa/contracts/goal-T054.md clause 10 requires pending/failed refresh to visibly warn dependent knowledge may be stale. Existing save/retry notices did so transiently, but initial load/revisit and manual reload displayed only a bare state. This unit renders a snapshot-bound accessible note for pending/failed with the existing action named. Complete snapshots omit it. No API, save, refresh executor, persistence, schema, auth or production effects changed. Whole T054 acceptance remains open.

## Exact changed bytes
- apps/web/src/pages/transcript-review/TranscriptReview.tsx: initial SHA256 6DE42740B8231F5F7E5ABCAFE1FE6BC35B02183CA87FDF1F521718206C9F03BD; final 8C91418DBC94C51AE53D48927077E57E38A75ABEE7A5B12814144180275844CA. New JSX immediately following Knowledge refresh state; no state or asynchronous changes.
- apps/web/src/pages/transcript-review/TranscriptReview.test.tsx: initial 280CF8B85BA023DBD8DE49D1108DC4CF500EC15B72B59681C72FE9AF0EE2C851; final CD93A30F56CB2302C779A5E4C2B89B4DE0772D422AB62BEEC1840B959B4E1A55. Two parameterized initial pending/failed cases verify stale warning/action then reload to complete clears warning.
- New artifacts: this packet; qa/manifests/product-transcript-refresh-warning.md; qa/coordination/knowledge-brain-20261015/product-delivery/t054-refresh-warning.md; review dispatch assess JSON/result in same notes directory.
Raw patch: git diff -- apps/web/src/pages/transcript-review/TranscriptReview.tsx apps/web/src/pages/transcript-review/TranscriptReview.test.tsx (only this unit in these paths).

## Immediate consumers and risks
TranscriptReviewPage.tsx mounts the editor for session route/manual selection; hash EA1F6F01D60F75CD43DDE8C96725D46EB6A4FD1AD2B5F0753998E4A19299403E. ReviewHistory.tsx consumes same snapshot refresh and exposes matching action; hash 36D03CF4DC3CA4DC6212E95D5EACF9445CCF1AF04EE78676E3B41B680B4AC30C. API parser unchanged hash 945ED78EF8F94FE14031383DABB6FFE241C12E4303F5013FA8739E922BB4DEE7. Warning stays inside existing identity-bound snapshot render, so prior identity content fencing remains authoritative. Plain text only; no auth/tenancy/writes/credentials changed. Existing role=status/alert semantics unchanged.

## Required broker checks
- pnpm --filter @lkb/web exec vitest run src/pages/transcript-review/TranscriptReview.test.tsx src/pages/transcript-review/ReviewHistory.test.tsx : affected editor and immediate history/refresh consumer, including existing lifecycle/commit regression floors. New cases: a loaded pending/failed refresh warns about stale answers until canonical reload completes.
- contracts/verify_contracts.py mandatory repo validator via broker; reuse only exact attributable compatible evidence if governing policy permits.
- Web typecheck integration gate via shared broker if required; no full suite/browser/native DB claim.
No test/build commands executed by maker. CPU/broker restriction respected. Runtime/version/dependency receipt must be supplied by broker; no guessed fingerprint. Lock SHA256 2AF3AADA247F31436A28F46F4803DC8B4294956C21825F7421CA37FAF07D83DD; web vitest config 7F76B80C8E788CBD3EA649DB2596B69852CA0719B7F6D483CADD6DFEC88300F8.

## Evidence/accounting and remaining gates
Source diff inspected: only 3 JSX lines and 13 test lines. Initial apply_patch failed before mutation; PowerShell exact anchored replacements applied final candidate. Actual maker active seconds/tokens/cost unknown, retain null; command durations are not maker active usage. Independent checker owns verdict. No ready-for-check claim until broker receipts bind final bytes. Required whole-feature native Mongo/browser/provider/downstream T054 gates remain separate.
Checker allocation authorized by coordinator: BOOTSTRAP_REVIEW 120s/3000 allocated tokens, protected review90s/2200 + final30s/800. Ratio unverified; fresh context required. Checker must assess at every material phase and persist actual/null accounting.
## Fix cycle 1 — immediate consumer test race
Central coordinator granted exact third-file lease apps/web/src/pages/transcript-review/ReviewHistory.test.tsx (test only). Initial SHA256 D06CE8509B7E678DAE5FF4D4834C1E012050026159119F465F66B464FEC241FC; final 23E6B64A803228DEEBEEAA683DB4375E7E8D358126E94220DD82BF337DFFD4C5. Existing retry case queried role=status while busy already rendered Loading review operation; findByRole resolved before API completion. Replaced only assertion with waitFor exact terminal success text. Kept callback count/API arguments and all identity/markup tests unchanged. No production behavior changed for this repair.

Frozen shared broker receipt qa/goal-vectorless-2026-10-15/verification-frozen-ui-fourteen-20261015T1205.json: own exit1, 110PASS/1FAIL/1privateSKIP; TranscriptReview11PASS; sole failure ReviewHistory retry assertion. Pin set unchanged during execution (hashesUnchanged=true). Complete stdout/stderr paths embedded in receipt. Preserve this failed attempt; do not call shared union all-green. Runtime v24.19.0; executable SHA256 3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237; environment hash e665a022fa0fefb3b2134896e4a46d2f46ed6b8fa36cd47a797c21cb939d2fb3. Shared 42.5080887s command cost remains shared, not maker/checker active time.

Requested final affected-only broker rerun: existing frozen Node/Vitest execution profile, src/pages/transcript-review/ReviewHistory.test.tsx only. Source/editor tests unchanged from 11PASS frozen receipt; require fingerprint matching for permitted evidence reuse. Mandatory frozen validator still needs attributable receipt. Manifest stays BUILDING. Maker active_s/tokens/cost remain null. No reviewer has launched; old cycle0 assess allocation had no actual review charge. New protected reserve identity product-transcript-refresh-warning/1/23E6B64A803228DE.
## Runnable mock harness and minimal reviewer navigation
Existing harness: apps/web/vitest.config.ts (jsdom), src/setupTests.ts, React Testing Library imports in the two scoped test files, API vi.spyOn mocks; no authenticated browser/network/database required. cwd C:/Users/product/Desktop/KnowledgeBase/apps/web. Runtime already fingerprinted in frozen broker receipt; use that same bundled node executable with node_modules/vitest/vitest.mjs. All execution remains through broker.

Current candidate baseline: TranscriptReview.tsx SHA256 8C91418DBC94C51AE53D48927077E57E38A75ABEE7A5B12814144180275844CA; TranscriptReview.test.tsx CD93A30F56CB2302C779A5E4C2B89B4DE0772D422AB62BEEC1840B959B4E1A55; ReviewHistory.test.tsx 23E6B64A803228DEEBEEAA683DB4375E7E8D358126E94220DD82BF337DFFD4C5. Git HEAD is packet base, dirty candidate hashes authoritative. Frozen shared receipt above is existing baseline: editor11PASS, old history assertion FAIL; repaired history rerun/composite still pending. No all-green claim.

Exact minimal filtered commands, retaining broker one-worker profile:
1. C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe node_modules/vitest/vitest.mjs run --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism src/pages/transcript-review/TranscriptReview.test.tsx -t "a loaded .* refresh warns about stale answers until canonical reload completes"
Expected selected executed count: 2; names: "a loaded pending refresh warns about stale answers until canonical reload completes" and "a loaded failed refresh warns about stale answers until canonical reload completes". Each mocked getTranscriptReview resolves pending/failed then complete; render editor k/s1, inspect named note text + action, click Reload transcript, wait for corrected-text input and verify note gone/state complete.
2. C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe node_modules/vitest/vitest.mjs run --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism src/pages/transcript-review/ReviewHistory.test.tsx -t "failed refresh exposes retry; successful refresh invokes canonical reload"
Expected selected executed count: 1. Existing harness mocks refreshTranscriptReview to complete, renders failed state, clicks retry, waits for terminal complete status, confirms canonical reload called once and API called with k/s1/r1.

Independent reviewer chooses/authors its own contract-derived probe rather than treating maker assertions as independent evidence. Relevant logic/consumer paths and exact clauses above are sufficient; no unrelated repository rescan requested. These commands describe focused probes and do not waive mandatory frozen-validator evidence or final attributable composite verification.
## Current harness baseline — affected History rerun
Root reported affected History3PASS exit0, 3.252s; source below read from exact receipt. Root also independently reconstructed old test bytes and authenticated their hash to the failed frozen batch. This preserves attribution of the old assertion failure without replacing its receipt. Frozen failed1205union remains linked above; its unchanged TranscriptReview11PASS attribution remains distinct. Per-unit composite is explicitly requested and pending. Manifest remains BUILDING until composite, mandatory validator receipt and FINAL shared-core export checkpoint; no checker dispatched.

Exact affected harness receipt fields:
`json
{
  "candidate_sha": "98556131e58064aec75787cea98614b7cf0bf4451d1c4a0e4de972657373c52b",
  "elapsedMs": 3252.2115,
  "candidateIdentityKind": "SHA256 of ordered scoped final-file pins; not a Git commit",
  "exitCode": 0,
  "command": [
    "C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe",
    "node_modules/vitest/vitest.mjs",
    "run",
    "--pool=forks",
    "--maxWorkers=1",
    "--minWorkers=1",
    "--no-file-parallelism",
    "src/pages/transcript-review/ReviewHistory.test.tsx"
  ],
  "receipt": "qa/goal-vectorless-2026-10-15/verification-ui-history-three-repair.json",
  "hashesUnchanged": true,
  "runtime_executable_sha256": "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237",
  "lock_hash": "2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd",
  "stdoutPath": "qa/goal-vectorless-2026-10-15/verification-ui-history-three-repair.stdout.txt",
  "environment_hash": "e665a022fa0fefb3b2134896e4a46d2f46ed6b8fa36cd47a797c21cb939d2fb3",
  "runtime_version": "v24.19.0",
  "stderrPath": "qa/goal-vectorless-2026-10-15/verification-ui-history-three-repair.stderr.txt"
}
`


## Attributable composite evidence pointer — 2026-10-15

Receipt: `qa/goal-vectorless-2026-10-15/ui-fourteen-targeted-composite.json`; status `ATTRIBUTABLE_COMPOSITE_READY_FOR_INDEPENDENT_REUSE_DECISION`. This is an attributable reuse-decision input only, not a globally green batch or unit PASS.

- `apps/web/src/pages/transcript-review/TranscriptReview.test.tsx`: 11/11 passed, 0 skipped; reporter status `passed`; original batch exit 1; standalone exit unknown/not run. Raw receipt: `qa/goal-vectorless-2026-10-15/verification-frozen-ui-fourteen-20261015T1205.stdout.txt`.
- `apps/web/src/pages/transcript-review/ReviewHistory.test.tsx`: 3/3 passed, 0 skipped; reporter status `passed-by-affected-file-rerun`; original batch exit 1; standalone exit 0. Raw receipt: `qa/goal-vectorless-2026-10-15/verification-ui-history-three-repair.stdout.txt`.

The composite records fourteen per-file rows: thirteen successful original reporter files plus ReviewHistory three-test repair with its own exit 0. Original batch exit 1 remains preserved. The receipt records 201 unchanged other pins, no runtime/environment identity differences (including lock identity), and no shared unhandled/setup failures. ReviewHistory old byte backup/hash authentication and repair diff remain linked at `qa/goal-vectorless-2026-10-15/ui-history-before-authenticated.tsx` and `qa/goal-vectorless-2026-10-15/ui-history-repair.diff`; repair receipt `qa/goal-vectorless-2026-10-15/verification-ui-history-three-repair.json`. These receipt claims are attributed here without a new source scan or execution. Independent checker decides whether exact per-unit evidence is reusable; no standalone success is manufactured from the original batch. Shared batch/repair process costs are counted once, not denominator padding.

FINAL shared schema/core checkpoint and mandatory unit/type/validator receipts remain pending. All six product manifests remain BUILDING; this metadata append changes no readiness, gate, verdict, or source.
