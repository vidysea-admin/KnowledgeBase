# T-054 checker packet — cycle 0

Repository: `C:\Users\product\Desktop\KnowledgeBase`. Maker skill: `skills/maker/SKILL.md`.
Assigned scope: pure planner + strict client + standalone editor; roadmap tier 3. Checker skill:
`skills/checker/SKILL.md`; contract `qa/contracts/t054-transcript-review-planner-editor.md`, criteria 1–9.
Base HEAD `4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd`; all six product/test paths below were absent/untracked.
No linked issue-fix corpus; this is new capability, not claimed closure of an existing issue.

## Candidate files and SHA-256

| Path | Hash |
|---|---|
| apps/api/src/transcript-review/planner.ts | 12C9F9EDA0F1AD7AD69875C2CEC0C21AECEAF167AB30ECF7622D71181094D783 |
| apps/api/src/transcript-review/planner.test.ts | 10E819EA8B21DD3C49ED041E21DC43B81238C9F3D305C5641EAB831C29C4C81B |
| apps/web/src/api/transcriptReview.ts | 16F876B99E8E0B91B2CEF40E6A25544634E8A9B6C7187498A4BB8E5F1BE315AF |
| apps/web/src/api/transcriptReview.test.ts | 693180025F3CECE36FD9BED462715E55BDACE76841BEFD3F0854537A7DE0691A |
| apps/web/src/pages/transcript-review/TranscriptReview.tsx | 998816A097E3BA21EEF8F21DA7C9108F88A1BD9D7A2756FFC0766DBF67862B41 |
| apps/web/src/pages/transcript-review/TranscriptReview.test.tsx | 0D6D5F1956FA206BC4207A32A482ACEE19B0673FDAA484D430C2184BDE598427 |

## Interface and change map

`parseReviewRequest` accepts only `expectedRevision`, `reason`, `corrections:[{turnId,text}]`,
optional `mapping:{turnIds,speakerRef,speakerLabel}`. Reasons are mandatory, up to 2000 characters,
allow multiline text and refuse NUL. Text is nonblank, up to 20000 characters. Correction/mapping limits: 100.
Revision tokens: `[A-Za-z0-9._:-]{1,400}`.

`planTranscriptReview(snapshot, request, trusted)` checks exact revision and trusted tenant/session/actor/time,
snapshot row scopes and chronological finite turn timings. No database/API/provider functions are called.
Mappings must be an explicit consecutive same-current-reference block; repeated labels elsewhere remain unchanged.
Output copies turn records without changing timing or unrelated fields; detached before/after audit values cover actual changes.
Input-preserving does not mean Object.freeze: callers can mutate returned planning values.
Output `expectedRevision`, deterministic `nextRevision`, `nextTurns`, `audit`, and `refresh:{status:'pending',revision,targets}`.
Targets: claims, session-page, chunks, tree, graph. Planner success is neither commit nor completed refresh.

`getTranscriptReview` GET `/sessions/:id/transcript-review` requires exact session, revision, unique ordered valid turns,
and `refresh:'pending'|'complete'|'failed'`. `saveTranscriptReview` POST sends quoted `If-Match` and body expectedRevision.
Receipt must bind to session, different revision, `commit:'committed'` and a valid refresh state.

`TranscriptReview` consumes this real client; new explicit optional `onCommitted()` informs a future SessionDetail mount.
No current production caller exists. It retains drafts on conflicts/uncertain saves, requires reload before retry,
fences late key/session/unmount requests, uses Map for arbitrary turn IDs, and renders escaped React text.
After a receipt, editing is unavailable until canonical GET returns the committed revision.
Pending/failed refresh messages remain explicit; callback failure cannot cause a committed write to be retried.
Cancellation is stale-result fencing, not network abort (existing `apiFetch` has no AbortSignal).

Existing dependencies consumed unchanged: `apps/web/src/api/client.ts`, React, browser fetch.
Immediate consumer: standalone editor calling real client through simulated HTTP; independent checker execution pending.
Existing `SessionDetailPage.tsx`, `SpeakerSuggestions.tsx` and suggestion APIs are unchanged and not mounted here.

## Security and future integration gates

Auth/tenancy/data-write flags: yes in the intended feature; this unit has no actual server or canonical writes.
Planner trust data is server-supplied separately from client payload and client cannot inject it.
Future routes must derive tenant and actor from verified auth, apply a write-capable scope, compare quoted If-Match
with body expectedRevision, atomically commit turns + detached audit + pending refresh under revision precondition,
and preserve human review through reindex. These are excluded gates, never inferred from scoped PASS.
Canonical schema/store, mounted routes/editor, refresh workers, full review/reindex-survival and live acceptance remain open.

## Evidence and execution facts

Runtime resource coordinator: `/root/runtime_inventory`. One lightweight slot required; no browsers/provider calls.
Original tsx/Vitest paths encounter known sandbox esbuild spawn EPERM. Coordinator provides cache-only TypeScript
loader at `.cache/coordination/safe-test-runtime/register.mjs`; no product/lock/config changes for the harness.
Node invocation: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/transcript-review/planner.test.ts`.
Frontend runtime: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register-react.mjs qa/evidence/t054-transcript-review-planner-editor/checker-dom.test.tsx`.
Required frozen contracts: `python contracts/verify_contracts.py`.
Maker execution after coordinator slot1 GO:

- Planner command above: exit 0, 6/6 passed, duration 679.214 ms (tool wall 1.1259427 s). Tests exercised immutable correction/audit/refresh,
  bounded block-only mapping, trusted scope/revision refusal, duplicate/foreign/disjoint/mixed IDs, injected trust/provenance,
  empty/oversized/no-op/invalid corpus refusal. Exact output: `tests 6; pass 6; fail 0; cancelled 0; skipped 0; todo 0`.
- React command above (checker-authored independent test source, executed by maker): exit 0, 4/4 passed, duration 1969.1114 ms
  (tool wall 2.3974784 s). Exact output: `tests 4; pass 4; fail 0; cancelled 0; skipped 0; todo 0`. Checks real client-to-editor
  precondition/commit/canonical consumption, stale reload refusal with retained success, in-flight unmount fence, callback unmount fence.
  The independent probe was subsequently expanded by checker from four to seven tests; four-test source hash was not captured.
  This run does not certify the expanded probe. Product/test candidate hashes above remained unchanged.
- Frozen validator command above: exit 0, wall 0.4873189 s. Exact output:
  `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`.

Standing Vitest files (3 API client tests + 9 editor tests) were authored but not executed because esbuild spawning is restricted.
No Vitest pass, package typecheck, browser proof, provider call, durable backend write or full T-054 completion is claimed.
Independent checker PASS cycle 0 is persisted at `qa/verdicts/t054-transcript-review-planner-editor.md`; final six hashes matched.
Real-client React probe: 7/7, exit 0, Node 2846.6112 ms; retained-sample probe: 2/2, exit 0, Node 462.756 ms.
Literal valid first 100 of 291 source turns planned one exact correction and preserved detached audit; full 291-turn input refused
existing t141/t142 invalid timings without mutation. Original failed fixture assumption and corrected assertions are retained.
Exact command/output/timing evidence: `qa/evidence/t054-transcript-review-planner-editor/checker-final-results.json`.
Frozen validator independently exit 0 by vacuity; no full 291-session validity, backend/mount/live or whole-task completion is certified.
No environment values/credentials, live DB, migrations, registrations, notifications or deployments are needed.
