# The Living Knowledge Base maker-checker loop

*(adapted from #068 "The evidence-first feature loop" — Rashid Ali, AI Engineering DexaMinds —
`evidence-first-feature-loop`; adapted per ISS-019, scaffolded via `/loopify` at `/maker init`
step 3b, 2026-09-04)*

Use when: any substantive dev work in `D:\KnowledgeBase` — a feature slice, a schema/data-model
change, a multi-file edit, or an issue-fix batch that can be divided into one checkable unit at a
time. This is the project's own `/maker continue "D:\KnowledgeBase"` cycle, restated in the
publishable loop schema so the checker sweep (Mode B, check 4) can verify it stays honest.

Prompt: Bind to `D:\KnowledgeBase`. If `qa/.paused` exists, stop. Otherwise reconcile disk state
(flip any manifest with a matching-cycle PASS verdict to `checked-PASS`; re-dispatch any
`ready-for-check` manifest with no matching verdict), sweep if due (`qa/.last-sweep` >2h old),
then pull ONE unit by the project tiers: `qa/QUEUE.md` top clear TODO; critical/high open issue;
next unblocked pending roadmap task from `.goal/goal.json` or `TASKS.md`; medium open issue;
contract gap; feedback. Build it, write real evidence, and dispatch a fresh isolated `/checker`
subagent — never self-certify. On FAIL, fix only what the verdict names (max 3 cycles, then
STALLED). On PASS, checker closes the matching `/goal` task; maker confirms closure, flips the
manifest, and commits narrowly. Stop for approval before any CRITICAL action.

Verify: the adapter's slot-1 check (this project uses the DEFAULT coding adapter — no
`qa/adapter.json` on disk): `pnpm -r test` exits 0 with every package's own reported count
matching a fresh re-run (never trust a pasted total — sum it), `pnpm lint:structure` exits 0,
`python schema/validate.py` exits 0/PASS when the unit touches `schema/`, and — for anything
`gws`-backed (Calendar/Gmail integrations) — a real end-to-end call against the live service,
independently re-runnable by the checker, not a fixture stand-in claimed as proof.

Steps:
1. **Observe** — bind to the root; read `qa/.last-tick`, `qa/QUEUE.md`, open issues,
   `.goal/goal.json`, and `TASKS.md`.
2. **Choose** — pick exactly one unit using the six project backlog tiers in Prompt order; state
   which and why in one line.
3. **Act** — build the slice; run the real verify commands as you go, not just at the end.
4. **Verify** — write the evidence manifest (`qa/manifests/<slug>.md`, `Status: ready-for-check`)
   with real pasted command output.
5. **Record** — dispatch a fresh, isolated `/checker` subagent; it writes
   `qa/verdicts/<slug>.md` independently, re-runs every command itself, and on PASS closes the
   matching goal task.
6. **Repeat or stop** — PASS: maker confirms checker-owned goal closure, flips the manifest,
   commits narrowly, and continues to the next unit. FAIL: fix exactly what's named, re-dispatch
   (max 3 cycles). Empty backlog: stop.

Stop: named terminal states, per `/maker`'s own contract —
`ADVANCED` (one unit moved on evidence) → continue · `BACKLOG_EMPTY` (no pending handshake, no
open critical/high/medium issues per D-013 -- open low issues do not keep the loop alive --, no queue rows, sweep fresh, and no unblocked pending roadmap task in
`.goal/goal.json` or `TASKS.md`) → stop · `HUMAN_GATE` (next unit needs a decision only Umesh can
make, nothing else unblocked) → heartbeat up to 8×, then stop · `STALLED` (max fix
cycles hit) → diagnose via `/agent-debugger`, then stop · `EXHAUSTED` (tick/token bound hit) →
diagnose, then stop, never report as success · `BLOCKED` (environment prevents execution) →
retry heartbeat · `PAUSED` (`qa/.paused` exists) → stop immediately, nothing auto-continues until
`/maker resume`. Never invent a time/iteration/cost limit beyond these seven.

Human gate: exactly the CRITICAL actions this project's CLAUDE.md and AIOS rules already name —
production Mongo writes (this repo's Mongo is otherwise read/write-through-work-DB only per the
"hard boundary" rule), any irreversible delete, any real external communication sent on Umesh's
behalf (a real meeting-bot joining a call in silent-capture mode, a real email/message sent, a
real Gmail action beyond read-only scan), and publishing/promoting anything to a production or
customer-facing deployment. Also gates: ownership/scope/product-direction decisions (e.g. the
ISS-022 class of "is this task's scope actually done" judgment calls) — a same-evidence sync fix
citing an already-documented determination (like `TASKS.md`) is not this class and may proceed;
a genuinely new scoping judgment is.
