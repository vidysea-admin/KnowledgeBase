# HUMAN_GATE batch — resume reconcile 2026-10-26

Opened: 2026-10-26T22:00+05:30 by /maker resume tick. One batch (.16-2). Each question carries the
maker's recommended default; answer with the number + choice, or "defaults". Answers are appended
below as `Answered: <ISO> — <n>: <choice> — <where>`.

## Q1. Live acceptance runs (blocks t013, t045, t057, t058, u32 — all code on master, fixture checks clean)
Each HOLD waits only on live evidence: a real-browser walk (T-013 voice/avatar, U3.2 two-persona
search C7, T-057 operations C8, T-058 output workbench) and live accounts (T-045 Meet/Teams/Zoom
bot + STT key; T-057 C18 Gmail/Sheets + disposable Mongo).
- a) **(recommended)** Run them against the live deploy https://34.47.136.12:8081 once the server
  ops below are done (hosting env, bot launcher, GEMINI/TAVILY keys); a fresh checker does the walk.
- b) Run them locally against a disposable stack now (no live accounts → T-045/T-057 C18 stay HOLD).
- c) Accept the fixture evidence and close the units without live runs.

## Q2. u2-4-phase3-precision-regate — ISS-282 (critical, open)
Phase-3 bars measured 0% precision / 8 wrong links. Fix lives on unmerged `wave/u2-4-phase3-fix`
(paused by D-038, `qa/.paused.u2-4-phase3-precision-regate`). Speaker-write unit stays blocked.
- a) **(recommended)** Resume the paused c1b/c2 live qwen3:8b eval (needs ~8 GB free RAM), then
  merge the fix branch on a checker PASS.
- b) Accept fd674478's suggestion-path re-measure as the evidence and close ISS-282.
- c) Keep paused.

## Q3. codexwave1-governance — D-166 `Approved-by: Umesh` was self-asserted by an agent
Checker FAIL (HIGH): the entry claims your approval without an on-disk confirmation.
- a) **(recommended)** You confirm or reject D-166 in chat; maker records the answer here and the
  checker re-judges.
- b) Supersede D-166 with a new entry carrying your real approval.

## Q4. Answer policy for live Ask/Counsellor/Knowledge outputs (from today's live test)
All 1,768 claims are `needs-review` and the conservative policy refuses → counsellor sources wiped,
knowledge outputs 422.
- a) **(recommended)** Add a tenant policy `onInsufficient: draft` + visible "needs review" label.
- b) Keep refuse; review/accept claims in the Review queue first.

## Not a gate (maker proceeds unasked)
- t011-live-consent-orchestration: re-run on a quiet host after the current checker wave (SERIAL: CPU load).
- t039-manual-jobs-operation-authority: fix cycle = repin stale hashes + rerun broker, after the wave (SERIAL: CPU load).
- Server access (SSH/gcloud for 34.47.136.12) is an access request, not a decision.
