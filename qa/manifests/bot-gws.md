# Manifest — bot-gws
**Contract:** none specific (D-205 go-live batch 4; survey qa/evidence/bot-linux-survey-2026-10-29.md blocker 8, unit U4)
**Goal task:** none
**Date:** 2026-10-29
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** no (no auth, tenancy or production write: resolves a CLI binary path only)
**Persona walk:** skip (no screen, flow or user type)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one-function change with precise design; edit-in-place.

## Criteria
- C1 On win32 the default gws binary stays <repo>/.cache/tools/gws-0.22.5/gws.exe.
- C2 Off win32 the default is the bare command `gws` (PATH lookup, no .exe, no repo path).
- C3 LKB_GWS_PATH (trimmed, non-empty) overrides on every platform; blank/whitespace is ignored.

## What changed (edited in place)
- packages/meeting-bot/src/autojoin/gws-channels.ts: new exported `resolveGwsBinary(repoRoot, env, platform)`; `createGwsRunner` calls it instead of the inline win32-only default. Header comment updated. Nothing else touched (Dockerfile is U1's).
- packages/meeting-bot/src/autojoin/gws-channels.test.ts (new, the module had no test file of its own): C1, C2, C3.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 2 files, 3 criteria, est 15 min, single builder, one test file per invocation, no checker dispatch by the builder
Tier: S (platform default of a binary path; no auth, tenancy, data write)
Base / checked state: base 77ba22d8; code commit 4e764ed9 on wave/bot-gws (the manifest commit follows and touches only qa/).
Affected tests: autojoin/gws-channels.test.ts (new), autojoin/alerts.test.ts (imports gws-channels; unmodified).
Independent review: NOT run by the builder; the checker owns review.
Known limits: no real gws binary is started anywhere (runner seam only); the pinned Linux gws install and LKB_GWS_PATH in the image belong to U1.
Tests[C1]: packages/meeting-bot/src/autojoin/gws-channels.test.ts::"win32 default keeps the pinned gws.exe under .cache/tools"
Tests[C2]: packages/meeting-bot/src/autojoin/gws-channels.test.ts::"linux default is gws on PATH (no .exe, no repo path)"
Tests[C3]: packages/meeting-bot/src/autojoin/gws-channels.test.ts::"LKB_GWS_PATH overrides on every platform"
Tests[R1]: packages/meeting-bot/src/autojoin/alerts.test.ts (12) — unmodified, green
Pre-check[C1]: 4e764ed9 node --import tsx --test packages/meeting-bot/src/autojoin/gws-channels.test.ts -> exit 0, 3 passed t=1 blobs=packages/meeting-bot/src/autojoin/gws-channels.test.ts:37819e27
Pre-check[C2]: 4e764ed9 node --import tsx --test packages/meeting-bot/src/autojoin/gws-channels.test.ts -> exit 0, 3 passed t=1 blobs=packages/meeting-bot/src/autojoin/gws-channels.test.ts:37819e27
Pre-check[C3]: 4e764ed9 node --import tsx --test packages/meeting-bot/src/autojoin/gws-channels.test.ts -> exit 0, 3 passed t=1 blobs=packages/meeting-bot/src/autojoin/gws-channels.test.ts:37819e27
Pre-check[R1]: 4e764ed9 node --import tsx --test packages/meeting-bot/src/autojoin/alerts.test.ts -> exit 0, 12 passed t=1
Pre-check[T1]: 4e764ed9 pnpm exec tsc --noEmit (cwd packages/meeting-bot) -> exit 0, clean t=1
Pre-check[S1]: 4e764ed9 pnpm lint:structure -> exit 0, 10 stages 0 failed; node scripts/snapshot.mjs --check -> OK
Metrics: builder_min=12 mutants=3 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
Test file written before the source edit; against HEAD source it failed at import: "SyntaxError: The requested module './gws-channels.js' does not provide an export named 'resolveGwsBinary'".

## Falsifications (one per criterion)
Per-mutation byte backup taken immediately before each single mutation and restored right after (timeout 150, no EXIT trap, committed tree). After each restore `git hash-object gws-channels.ts` equalled `git rev-parse HEAD:<file>` (fidelity OK for all 3).

| Criterion | falsifying edit | test file | observed |
|---|---|---|---|
| C1 | `platform === "win32" ? ` -> `false ? ` (win32 gets "gws") | gws-channels.test.ts | 1 failed / 2 passed |
| C2 | non-win32 branch `"gws"` -> the .exe path | gws-channels.test.ts | 1 failed / 2 passed |
| C3 | `if (override) return override;` disabled | gws-channels.test.ts | 1 failed / 2 passed |

## How to verify
`node --import tsx --test packages/meeting-bot/src/autojoin/gws-channels.test.ts`
