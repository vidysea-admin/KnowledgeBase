# Independent verdict — outputs-vectorless-integration (T-058 scoped)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Base compared: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a (the manifest and packet record no base SHA; this is the window start recorded by the sibling T-059 manifest)
Checker: independent, fresh context, lane `lane/w17-t058check` (worktree, core.longpaths=true)

**PASS is scoped to the manifest's stated behavior only: separate generation and grounding callbacks, production factory takes an explicit verifier, verifier failure never falls back to the generator. Whole T-058 (qa/contracts/goal-t058.md C1-C12) stays HOLD.**

## Identity note
Packet SHA256 pins (types.ts 95e3e3d1..., synthesis.ts 3ecca4de..., wiring.ts 514ab71c..., workbench.test.ts 1d07bb03...) do not match the files at 9e55b642 (sha256 of the checked-out copies: types 3f3250ce..., synthesis eff76308..., wiring ef0c102f..., workbench.test.ts ca721a27...). The commit also carries later edits by other units to the same paths (for example the consent line in workbench.test.ts and the sample-path fix). I reviewed the committed bytes at 9e55b642, not the pinned hashes. The receipt "candidate" 8057591c... is an inventory hash and was not used as evidence.

## Source review (git diff 5c4cbade 9e55b642 on the unit paths)
- synthesis.ts:10-12 `modelCall(..., assess=false)`; `const complete = assess ? deps.verify ?? deps.complete : deps.complete`. Only `validateItems` (synthesis.ts:46) passes `assess=true`; `synthesize` (line 69) generation uses `deps.complete`. Callers of validateItems: create (via synthesize), service.ts:62 revalidate/edit. Correct split for C1/C2/C6.
- types.ts: `verify?` optional on OutputDeps (legacy fixtures fall back to `complete`, as the manifest states).
- wiring.ts:10: `createConfiguredOutputService(db, complete, policies, verify)` takes `verify` as a REQUIRED parameter; sole caller answers.ts:68-74 passes `createOutputVerifier(input.routing)`.
- answers.ts (central-owned, reviewed as consumer only): generation is pinned to chain `["ollama-cloud"]`, verifier to `["ollama-cloud-verifier"]` regardless of configured chains; `assertValidTenantId` runs before `routeComplete` in both. Generator cannot be reached from the verifier route, and the reverse.
- Verifier failure propagates out of `create` (no generator retry, no draft persisted).
- Web (apps/web/src/pages/knowledge-outputs): `show()` now refreshes the saved-list row (title/revision/updatedAt) after save/revalidate. No auth/tenant surface touched. Test migrated from node:test harness to vitest.

## Independent evidence (all run by the checker at 9e55b642, exit codes captured to files)
| Check | Result |
|---|---|
| `node --test --import tsx src/knowledge-outputs/workbench.test.ts` (apps/api) | exit 0, 23/23 |
| `node --test --import tsx src/composition/vectorless-routing.test.ts` (apps/api) | exit 0, 3/3 (distinct generator/verifier chains, unsafe-chain override cannot reach generator, invalid tenant refused before provider call) |
| `vitest run src/pages/knowledge-outputs/workbench.ui.test.tsx` (apps/web, jsdom, no browser) | exit 0, 1/1 |
| `python contracts/verify_contracts.py` | exit 0, vacuous ("no frozen contracts yet") |
| Mutation (per-mutation byte backup, timeout 600, trap, HEAD-fidelity): synthesis.ts line 12 changed to `const complete = deps.complete;` | KILLED: exactly "independent verifier assesses generation and edits without using the synthesis chain" and "independent verifier failure cannot silently fall back to the synthesis chain" failed (21/23 pass, exit 1). Restored; LF-normalized hash b4d09f9c4b13... equals `git rev-parse HEAD:` blob. |

Evidence reused from the maker: none relied on. The maker's broker receipt (59/59) was not trusted or needed.

## Clauses covered (scoped)
C1 (separate generation callback), C2 (independent entailment callback, tenant-bound), C3 (provider failure stays visible, nothing persisted), C6 (edited text reassessed by verifier; unsupported edit becomes needs-review), C7 (export refused for unvalidated edit, test line "await assert.rejects(f.service.export(...))"). Existing citation/freshness/CAS behavior was not recertified.

## Findings (none blocking)
- Note: "production factory requires an explicit verifier" is enforced by the TypeScript signature only. `createOutputService` still falls back to `complete` if `verify` is undefined at runtime (documented legacy behavior). The sole production caller supplies it. A runtime guard in `createConfiguredOutputService` (`if (typeof verify !== "function") throw`) would harden this; low severity, not filed.
- Note: no T-058 base SHA is recorded in the manifest or packet; future packets should state one.

## Remaining gates / not verified
Live GLM/DeepSeek provider output and usefulness, durable isolated Mongo, mounted browser/source click-through (D-024), Umesh acceptance (C10/C11), typecheck/build receipts (not rerun), full parent C1-C12. Node/package resolution used the main tree's node_modules via junctions, so `@lkb/*` workspace packages resolved to the main tree (e7af7354), not 9e55b642; the changed unit lives in apps/api and apps/web.

Ledger: no qa/issues*.jsonl row is tied to this unit; nothing to flip. Parent T-058 status must not change.
ISSUES-WRITTEN: none

## Accounting
Checker token and active-time totals: unknown (no host telemetry available to this reviewer); no maker denominator supplied, so ratio unverified. Shared-suite costs: none run.
