# Umesh Calendar attendance — preparatory scope packet

Status: NOT READY FOR CHECK; no maker candidate, manifest or fix cycle exists yet.
Scope: checker-owned acceptance preparation only; not a source-edit authorization or unit verdict.
Root: `C:/Users/product/Desktop/KnowledgeBase`.
Contract: `qa/contracts/umesh-calendar-attendance.md` C1–C8, I1–I4; preserve existing default-mode portable release criteria.
User authority: explicit attendance for `umeshsugara@vidysea.com` and interim Windows 24/7 operation; no form registration or organizer messages.

## Candidate ownership for root to confirm

Existing API acquisition/transport: `apps/api/src/gws-calendar.ts`, `apps/api/src/routes/calendar.ts` and corresponding tests. Existing canonical noncollection transport: `packages/core/src/domain/webinar-types.ts`. Existing bot validation/reconciliation/selection: `packages/meeting-bot/src/calendar/schedule-tick.ts`, `calendar-client.ts`, `auto-join.ts`, `auto-record-policy.ts`, `schedule-state.ts` only where demonstrated needed, plus affected existing tests. Existing runner: `scripts/webinar/run-pipeline.mjs` and its tests. Proposed dedicated launcher: `scripts/webinar/windows-runner.ps1` plus a focused launcher test only if needed. These are potential dependencies, not authorization to edit every listed file.

Root/maker must bind the smallest approved set, its base revision/patch or original hashes, final hashes, manifest slug/cycle, runtime paths, fixtures, concrete security flags, exact commands and known gates before submission. No current candidate hashes are invented here.

Do not touch `.env`, live-proof/runtime state, API/DB configuration/processes, existing other-owner QA, hooks/settings, root frozen contracts or unrelated extraction/index code. Do not start browsers/capture or full suites during the active shared worker restriction.

## Focused command candidates (explicit argv; final selection depends on changed call sites)

Executable: installed absolute Node 24+ path confirmed by maker. Cwd: repository root.

- API acquisition/downstream: `["--test", "--import", "tsx", "apps/api/src/gws-calendar.test.ts", "apps/api/src/routes/calendar.test.ts"]`.
- Bot selection/transport: `["--test", "--import", "tsx", "packages/meeting-bot/src/calendar/auto-join.test.ts", "packages/meeting-bot/src/calendar/schedule-tick.test.ts", "packages/meeting-bot/src/calendar/webinar-policy.test.ts"]`; include reconciliation/state tests only if those call sites change.
- Runner-to-CLI: `["--test", "scripts/webinar/run-pipeline.test.mjs"]`; require a controlled integration that exercises accepted generic meeting → actual runner command arguments without launching a real browser or external request.
- Relevant package typechecks only; frozen-contract validator when applicable. Launcher verification must exercise argument/path construction with controlled doubles, not register/activate a real task during build.

Security floor: absent/foreign/ambiguous account proof and tenant refusal before work writes; accepted generic/personal positives; declined/cancelled/tentative/unverified/malformed negatives; unsafe/registration links; sticky rejection; rotating-token/occurrence dedup; overlap single capture; existing live-proof failure; registration/send call count zero in attendance mode. Preserve default webinar-only regression behavior for all non-opted operators.

Issue IDs/corpus: none claimed fixed yet; maker must link actual union-ledger rows if this becomes an issue-fix unit. Source-bound existing evidence may be attributed and reused explicitly; changed files require direct independent review/behavioral evidence.

## Handoff and live gates

Maker fills `qa/manifests/umesh-calendar-attendance.md`, matching slug/cycle and hashes, before ready-for-check. Independent checker writes only its matching verdict; maker closes canonical/legacy status after matching PASS. Dispatch a self-contained `fork_turns="none"` brief using `skills/checker/SKILL.md`; target measured 120–180 seconds, never waive required evidence to meet it.

Pending live gates: actual Google account/attendance proof, managed signed-in browser/Python/media prerequisites, genuine Windows proof marker, configured downstream/alerts as required, measured shared-worker capacity and observed Windows interactive/restart behavior. `.env` presence and authorization are not credential validity or media evidence. No activation or product PASS is implied by this packet.
