# Manifest — browser-profile-privacy (T-011)

Status: checked-PASS (Cycle checked: 1, verdict `qa/verdicts/browser-profile-privacy.md`)
Contract: `qa/contracts/browser-profile-privacy.md`

## Disclosed scope-down (read this first)
Real Playwright browser automation is explicitly out of scope (already deferred by
`browser-joiner.ts`'s own T-024 doc comment — TODO(T-024b), needing no new contract). This unit
builds the two pure decision primitives underneath it: per-user profile-directory resolution
(isolation-safety) and the live-monitor "exclude private segment" filter.

## What changed

1. **`packages/meeting-bot/src/profile/user-profile.ts`** (new) — `resolveProfileDir(tenantId,
   userId, baseDir)`. Validates each segment on its RAW value (before any `path.normalize()`),
   rejecting any `/`, `\`, `..`, or absolute-path content — a bug was caught and fixed during
   testing here (see below). A defense-in-depth second check confirms the joined path's `relative`
   to `baseDir` never starts with `..`.
2. **`packages/meeting-bot/src/live-monitor.ts`** (new) — `excludePrivateSegments(turns,
   privateWindows)`: drops any turn overlapping any window (any overlap, not just full
   containment — a straddling turn is fully excluded, never truncated); returns a new array;
   empty windows is a no-op.
3. **`packages/meeting-bot/src/index.ts`** — exports both new modules.

## Bug caught and fixed during this unit (disclosed, not hidden)
My first `assertSafeSegment` implementation validated the **normalized** value, not the raw one —
`path.normalize("toc/../other")` collapses to `"other"` (the ".." cancels the preceding segment),
so a multi-segment `tenantId` like `"toc/../other"` slipped past the "contains a separator"
check entirely, because by the time the check ran, the separator was already gone. The dedicated
test `a tenantId containing a path separator throws` caught this on first run (real FAIL, not
hypothetical). Fixed by validating the RAW value before any normalization — a segment must never
itself contain `/`/`\`/`..`, full stop, regardless of what it would resolve to. Re-ran; all 40
tests green.

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm --filter @lkb/meeting-bot test
tests 40 / pass 40 / fail 0   (27 pre-existing + 13 new: 7 user-profile.test.ts + 6 live-monitor.test.ts)

$ pnpm -r test
core 7 / index 19 / ai 23 / ingest 34 / ask 30 / meeting-bot 40 / apps/api 18 — all green

$ pnpm gen:types --check
OK: 22 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 22 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (142 file(s) within budget)
lint-dirsize: OK (63 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (197 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (720 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (111 lines, budget 200)
✔ no dependency violations found (152 modules, 428 dependencies cruised)
```

## Files touched
- `packages/meeting-bot/src/profile/user-profile.ts` (new)
- `packages/meeting-bot/src/profile/user-profile.test.ts` (new)
- `packages/meeting-bot/src/live-monitor.ts` (new)
- `packages/meeting-bot/src/live-monitor.test.ts` (new)
- `packages/meeting-bot/src/index.ts` (exports)
- `qa/contracts/browser-profile-privacy.md` (new contract, maker-drafted)

## Follow-up (not this unit, disclosed in contract Non-goals)
A real Playwright `BrowserLauncher` implementation consumes `resolveProfileDir`'s output as its
persistent-context path. A future live-monitor UI/worker collects `privateWindows` from a "mark
private now" control and calls `excludePrivateSegments` before turns reach the ingest pipeline.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
