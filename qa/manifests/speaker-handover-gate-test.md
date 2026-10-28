# Manifest — speaker-handover-gate-test

Status: merged-no-check (test-lane) — test-only diff (one file: packages/index/src/pipeline/speaker-name-rules-handover.test.ts, +28 lines, no deletion); handover file 3 -> 8 tests, all pass
**Handshake status:** merged-no-check (test-lane) — test-only diff; no product file changed, no assertion deleted or weakened
**Contract:** none (QUEUE row speaker-handover-gate-test, human-asked by Umesh 2026-10-28)
**Goal task:** none
**Date:** 2026-10-28
**Fix cycle:** 0 of max 2
Fix cycle: 0
**Dual check:** no (one test file; no auth, tenancy, security or prod-write path touched, no dual-trigger line applies)
**Issues addressed:** ISS-SPEAKER-001 (resolved, qa/issues.speaker.jsonl, by d2a6b888)
**Executor:** claude-sonnet-subagent
**Executor rationale:** one test file addition against an already-exported predicate; no delegation needed

## What changed
- packages/index/src/pipeline/speaker-name-rules-handover.test.ts (edited in place): imports the exported `hasNamingCueAt` and `citesNameAsAnIntroduction` (hasNamingCue itself is not exported; no product symbol was exported for the test). Adds 3 gate tests (the ISS-255 recorded sentence, its short form, and ISS-104's "Coming up next, Nilesh from the west zone."), each asserting both predicates refuse the weak `from` cue after a handover marker; 1 control proving the same cue binds with no marker; 1 control proving a self-naming cue survives the gate.
- qa/issues.speaker.jsonl: ISS-SPEAKER-001 flipped to resolved, resolved_by d2a6b888.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (test-only, one file)
Round: 1 files, 2 criteria, est 25 min — one test file plus a copy-mutation pass
Base sha: 182aa51f
Base / checked state: code sha d2a6b888 (manifest committed after it)
Gate answers: none (no gate files touched)
Affected tests / full-suite trigger: speaker-name-rules-handover.test.ts only; no safe-fallback trigger; no full suite run.
Tests[C1]: packages/index/src/pipeline/speaker-name-rules-handover.test.ts::"ISS-255 gate (predicate): a handover marker refuses the weak `from` cue" (x3) plus the "from cue binds when no handover marker precedes it" control
Tests[C2]: packages/index/src/pipeline/speaker-name-rules-handover.test.ts::"ISS-255 gate (predicate) control: a self-naming cue survives the handover gate" and the existing "handover markers do not block genuine direct self-naming" test
Falsification[C1]: copy (packages/index/src/mutcopy, removed afterwards): M1 deleted the gate line `if (handover && !SELF_NAMING_CUES...) return false` -> handover file red 3 fail of 8, exactly the 3 new gate tests; M2 also stubbed `handover = false` -> same 3 red; control (no mutation) green 8/8; per-mutation backup restored, git hash-object copy = original = HEAD blob ce43fc93 for speaker-name-rules.ts
Falsification[C2]: copy: M3 changed the gate to refuse every handover context including self-naming (`if (handover) return false`) -> 2 red of 8 (the new self-naming control and the existing "handover markers do not block genuine direct self-naming" test); restored, hash = HEAD blob ce43fc93
Pre-check[C1]: d2a6b888 node --test --import tsx packages/index/src/pipeline/speaker-name-rules-handover.test.ts -> 8/8 pass, 0 fail; tsc --noEmit -p packages/index/tsconfig.json clean t=7 blobs=speaker-name-rules-handover.test.ts:39caad3
Pre-check[C2]: d2a6b888 node --test --import tsx packages/index/src/pipeline/speaker-name-rules-handover.test.ts -> 8/8 pass, 0 fail (includes the self-naming control) t=7 blobs=speaker-name-rules-handover.test.ts:39caad3
Metrics: builder_min=25 start=2026-10-28T01:00 end=2026-10-28T01:25 wall_min=25 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=2 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=3 defects_unit=0 defects_6c=0

## Acceptance
- C1: the ISS-255 handover gate is covered at predicate level: deleting it turns the handover file red and, with it in place, the file is green.
- C2: the gate's carve-out is covered too: a self-naming cue still binds after a handover marker.

## How to verify (commands + expected)
- `node --test --import tsx packages/index/src/pipeline/speaker-name-rules-handover.test.ts` -> tests 8, pass 8.
- Delete line 206 of speaker-name-rules.ts in a copy -> 3 of 8 fail.

## Actual outputs
- With gate: 8 pass, 0 fail. M1 and M2: 5 pass, 3 fail (the 3 gate tests). M3: 6 pass, 2 fail.

## D-015
No issue's fix is measured here. ISS-SPEAKER-001 was filed by this seam's previous unit and is resolved by this one; the sentences used are the ISS-255 recorded reproduction (from the existing tests) and the ISS-104 "Coming up next" case.

## Capability coverage
Criterion C1 -> M1, M2. Criterion C2 -> M3.

## Cleanup
The copy lived in untracked packages/index/src/mutcopy (no reparse points inside, verified) and was removed; speaker-name-rules.ts hash equals HEAD (ce43fc93).
