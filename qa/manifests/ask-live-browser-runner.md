# Manifest — Ask live-browser runner

**Contract:** follow-up evidence for `qa/contracts/web-ask-page.md` C1/C2 and the plan §10 U3.1
live-browser exit criterion. The original unit's I1 is not reused as a blast-radius rule here: that
unit is closed, while this defect is in the existing cross-app runner `scripts/demo-live.mjs`.
**Goal task:** U3.1 (remains `in_progress`; a real submitted answer is gated as disclosed below)
**Date:** 2026-09-09
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-243 (high), ISS-244 (high)
**Status:** checked-PASS (cycle 1 — `qa/verdicts/ask-live-browser-runner.md`)

## Why

`pnpm demo:up` started the API and web app on different ports but never passed the selected API URL
to Vite. `apiFetch()` therefore resolved `/ask` and every other request against Vite itself. Vite
has no proxy, so the mandatory live-browser runner could render the page while its real API path was
unreachable. The runner also omitted `/ask` from `PAGES`, despite Ask being the product's flagship
surface and U3.1 explicitly requiring a browser proof.

## Change, in place

- `scripts/demo-live.mjs` `PAGES` now includes `/ask` and limits its automatic checklist to the
  authorised non-egress check; the real-question check explicitly points to the human gate.
- The existing Vite `spawn()` now receives `VITE_API_BASE_URL: API`, so custom `--api`/`--web`
  ports and the defaults both describe one working stack.
- `--up` now refuses to start without `MONGO_WORK_DB`, and the API child receives that exact value
  as `MONGODB_DB`, preventing an inherited/default database from becoming the live-demo target.
- `scripts/eval-recall.mjs` now passes a no-op audit writer into the embedding router. The offline
  evaluator can read existing chunks but cannot create job-ledger records.

No app component, API route, production collection, or source corpus was changed.

## Acceptance evidence produced by the maker

1. **Static/suite:** `node --check scripts/demo-live.mjs` passed; AskPage tests **6/6** passed;
   `apps/web` `tsc --noEmit` passed; `git diff --check` passed.
2. **Isolated live data:** the repository's local TOC corpus was seeded into the explicit work
   database `lkb_codex_work_20260909`: 23 sources, 23 sessions, 1,950 turns, 23 session pages,
   72 claims. Its tree root is `tenant:toc`. The default `lkb` database was not written.
3. **Real browser, real HTTP:** after the safety fixes, the corrected runner was restarted with only
   `MONGO_WORK_DB` set (no inherited `MONGODB_DB`) on API `http://localhost:3312` and Vite
   `http://localhost:5182`. The API reached the selected work database. In the in-app browser, the
   work-only key authenticated on `/ask`; the
   persistent nav exposed Ask; `/sessions` loaded 23 real links; clicking the first loaded its real
   overview, 6 claims, and 291-turn transcript; returning to `/ask` and entering whitespace left the
   Ask button disabled.
4. **Safety boundary:** starting `--up` without `MONGO_WORK_DB` exited 2 with the explicit refusal
   before either child was spawned. The embedding evaluator's routing callback is a no-op, so it
   cannot write jobs; any eventually authorised embedding run must also compare the jobs count
   before and after as an external-state backstop.
5. **Known boundary, not disguised as PASS:** clicking Ask with a real question would send internal
   tree/candidate text to Gemini. That specific egress is awaiting Umesh's answer in
   `qa/gates/external-eval-data-egress.md`. Therefore this unit proves the runner defect fixed and
   the non-egress browser interactions; it does **not** claim U3.1's final “real answer + citation”
   exit criterion is met.

## Checker dispatch

Mode D is required because this is UI-touching verification infrastructure. Independently start the
runner on unused ports against an isolated/non-production database, authenticate, navigate via the
visible Ask and Sessions links, prove real session data loads, and confirm whitespace cannot submit.
Do not submit a real Ask query until the external data-egress gate is explicitly answered.

## Close-out

Fresh checker PASSed cycle 1 in Mode A+D: 2/2 criteria and 1/1 applicable invariant. Its own
browser authenticated against the isolated work database, loaded 23 sessions, opened a real
6-claim/291-turn session detail, and proved whitespace plus Enter did not submit. It observed zero
console errors. The checker also reproduced the missing-`MONGO_WORK_DB` exit-2 guard with zero
listeners and independently traced the evaluator-local no-op writer. U3.1 correctly remains
`in_progress`: the final real question plus citation-link proof is still gated.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
