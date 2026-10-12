# fix-apps-api-typecheck-after-grounded-schema

**Handshake status:** checked-PASS
Fix cycle: 0
Lane: lane/schemaapifix. Class: type-only fix to restore a red typecheck on main (c99c44d); no schema/generated-type change. Tier: critical build break.

## Cause
Lane schemaedit typechecked apps/api against the main tree's old @lkb/core (lane node_modules junctions resolve @lkb/* to main), so two errors surfaced only after merge: apps/api/src/indexing/session.ts(161) (RuntimeItem/RuntimeQA evidence is `RuntimeEvidence[]`, generated CitedItem/QaEntry require a non-empty `[QuotedEvidence, ...]` tuple) and apps/api/src/routes/brain.test.ts(139) (screenEvidence fixture lacked required `tStart`).

## Fix
- session.ts: new `toCitedItems` / `toQaEntries` convert validated runtime items to the generated types via the existing `toEvidenceTuple` (throws on empty evidence, so an evidence-less item is never emitted as CitedItem/QaEntry); no `as any`/`as unknown as`. Used when building `preparedPage`.
- brain.test.ts: fixture screenEvidence gains `tStart: frame.tStart` (schema-valid).
- Not touched: schema/, packages/core generated types.

## Behaviour change
None for valid data: runtimeEvidence already throws on empty evidence, so items always have >=1 evidence and the conversion is a shallow copy of identical fields. Only difference: a hypothetical evidence-less item would now throw inside the existing grounded-preflight try/catch (-> status.index failed) instead of emitting a schema-invalid document; unreachable via validateRuntimePage.

## Evidence (main-tree tsc.js, `--noEmit -p tsconfig.json` run in each dir, lane worktree)
Before: apps/api exit 2 (the two errors above). After: packages/core 0, ai 0, ask 0, db 0, index 0, ingest 0, meeting-bot 0, apps/api 0, apps/web 0.
Tests (`node --test --import tsx`, no Mongo/network): apps/api src/indexing/session.test.ts exit 0; src/routes/brain.test.ts exit 0.
