# Verdict - claims-citable-needs-review (Mode A, cycle 0)
Cycle checked: 0
Checked head: 23abaab127258d5044cc04c18248b3e5c4bce153 (code commit 6d2d9366; base 4a94d2115ded94f0b21d1a9e3c7be3b531cadeb1 = merge-base with docs/devops-golive-2026-10-26)
Policy-Version: proportional-verification/2026-10-19.17

## Check plan (step 0)
Logic changed -> affected tests + falsification floor. UI changed (KnowledgeOutputsPage label) -> Mode D live browser. Schema changed -> gen:types --check + tsc. Persona walk: skip (additive label, no new screen/flow/user type). No L trigger in changed non-test files (no auth/tenancy/write/migration; reader.ts, repository.ts, migrations, ask/, whatsapp/, visibility/ diff empty - I ran `git diff --stat`, 0 lines).

VERDICT: BLOCKED-CAPABILITY
SCOREBOARD: 6/6 criteria evidenced at code/test level, 2/2 invariants hold; the mandatory Mode D live-browser check could not run, so no PASS
TIER: M (multi-file behaviour, public API shape, additive schema field; no concrete L trigger cited)
FAILURES: none (no defect found)
CAPABILITY-COVERAGE: 6/6 floor falsifications reproduced by the checker (see below)
LIVE-BROWSER: BLOCKED-CAPABILITY (playwright MCP failed to connect; claude-in-chrome `tabs_context_mcp` -> "Browser extension is not connected", `list_connected_browsers` -> []). Blocks: render of the "Unverified (needs review)" marker on apps/web KnowledgeOutputsPage in a real browser (C3 web half) and console-error count. Only the jsdom test covers it, which is not Mode D.
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (manifest: claude-sonnet-subagent)

## Re-run by checker (head 23abaab1, worktree untouched)
- `node --test --import tsx packages/core/src/knowledge-outputs/evidence-builder.test.ts apps/api/src/knowledge-outputs/workbench.test.ts` -> tests 45 pass 45 fail 0
- `node --test --import tsx apps/api/src/ask/graph-context.test.ts apps/api/src/visibility/read-side-quarantine.test.ts` -> 27/27 (C6, unmodified tests)
- `cd apps/web && npx vitest run src/pages/knowledge-outputs/workbench.ui.test.tsx` -> 1 passed
- `pnpm gen:types --check` -> OK, 46 generated type files match schema
- `npx tsc --noEmit` in apps/api, packages/core, apps/web -> exit 0 each
- Step 4c diff read in full (13 files, product + tests): no removed assertion on a pinned C6 test, no file outside the manifest "What changed", no config/dependency change.

## Falsification (throwaway copy of `git archive HEAD` outside the worktree; baseline 55 pass / 0 fail; each restore verified by `git hash-object` == `git rev-parse HEAD:<file>`)
| Crit | My falsifying edit | Result |
|---|---|---|
| C1 | evidence-builder gate admits every status except `rejected` | RED: fail 2 (conflicting/withheld tests) |
| C2 | schema property `claimStatus` renamed away (additionalProperties:false) | RED: 8+ failures incl. validator and all-kinds synthesis |
| C3 api | marker expression removed from markdown.ts | RED: fail 1 (needs-review markdown test) |
| C3 web | marker removed from KnowledgeOutputsPage.tsx | RED in vitest (jsdom only) |
| C4 | rank `.sort(...)` removed | RED: fail 2 (core + api rank tests) |
| C5 | early refuse check removed from evidence.ts | RED: fail 2 (refuse test + TOC test) |
| C6 | graph-context.ts:77 status filter narrowed to verified | RED: fail 3 (unmodified C6 pins) |
Differential for the manifest's backward-compat claim: same fixture `create()` at base 4a94d211 and at head gives identical `sourceDigest` 8f28f542...976c, so pre-D-201 stored verified drafts keep their digest.

## Notes (non-blocking, low; filed as notes only, no ledger write)
1. Mutants that SURVIVED (tests do not pin them): (a) digest canonical without `withoutDefaultStatus` (evidence.ts digest line) - the "legacy citations" test builds its legacy draft from a head-computed digest, so it does not prove digest-compat; (b) `withoutDefaultStatus` stripping needs-review too - a verified<->needs-review flip is still caught only because coverage flips; a draft that already has withheld claims would not go stale on a flip under that mutant (the real code is correct); (c) removing `hasUnverifiedCitation` from `refusesDraft` in service.ts - redundant with the coverage-partial check (equivalent behaviour today, defense in depth). Real code is correct for all three; these are test-strength gaps only.
2. Manifest says "Live browser evidence: SKIP" and acknowledges the gap; consistent with this verdict.

EXPLANATION: Every acceptance criterion and both invariants are evidenced by my own re-runs and one red-after falsification each. I found no defect. The verdict cannot be PASS because the UI surface (KnowledgeOutputsPage) requires an independent live-browser check (Mode D) and neither browser instrument is connected in this session. Re-dispatch once claude-in-chrome (or playwright MCP) is connected; only Mode D remains (start apps/web via vite against a local stub/seeded API with one needs-review and one verified citation, confirm the marker shows on the needs-review citation only, console errors 0). Everything else may be reused under evidence identity (head 23abaab1, test blobs in manifest).

Metrics: start=2026-10-28T12:09:00+05:30 end=2026-10-28T12:27:00+05:30 wall_min=18 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1080 mutants=0 defects_unit=0 defects_6c=0
slow: setup-and-differential 8 (copy needed data/toc-migrated restore, base-copy digest probe)
