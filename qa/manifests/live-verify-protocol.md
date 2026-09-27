# Manifest — live-verify-protocol

**Contract:** qa/contracts/developer-api.md (the routes being verified) — this unit adds no new
product surface; it builds the *verification* apparatus that plan §9 Phase 0a specifies.
**Goal task:** none yet (Phase 0a of the §9 re-baseline; the catalogue that will track it is
unit 0b, not this one)
**Date:** 2026-09-07
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** ISS-024 (high), ISS-025, ISS-026, ISS-027 (medium), ISS-028 (low) — all
five raised by the checker's cycle-1 FAIL

## Fix cycle 2 (2026-09-07)

Cycle-1 verdict (`qa/verdicts/live-verify-protocol.md`, commit `fbda37b`): **FAIL**, one high
honesty defect + four supporting issues. The checker confirmed the apparatus itself was sound
(reproducibility held across two independent runs; no seeding; collection counts true name-for-
name; DIRTY-TREE cannot mask a failure; a fabricated citation id really is caught, 2/3 → FAIL).
What failed was the thing this unit is *about*. All five are now fixed:

- **ISS-024 (high) — the tool asserted a constant for its own side effect and was wrong by
  ~20x.** The header and every generated `summary.md` said `POST /ask` "appends one real `jobs`
  ledger row"; the checker measured 20 and 26 in two runs. **Fixed by measuring instead of
  asserting**: `countDocuments("jobs")` immediately before and after the `/ask` call, with the
  real delta recorded as its own check and written into `summary.md`. My own re-run measured
  **12** — a third distinct value, which is itself the proof that no constant was ever correct
  here. This was the right call by the checker: an unmeasured claim inside the tool built to
  eliminate unmeasured claims.
- **ISS-025 (medium) — vacuous PASS.** If every cited source lacked `evidence.sessionRef`,
  `refs=[]` gave `0 === 0` → PASS. Now every cited internal source must yield a resolvable ref
  (`unref === 0 && refs.length > 0 && found === refs.length`), else FAIL naming how many were
  unverifiable.
- **ISS-026 (medium) — the suite penalised progress.** `expect:501/404` were equality assertions,
  so *implementing* `GET /search` or `GET /health` would have turned the run red. They are now
  "not-worse-than" assertions: a 2xx where a stub was recorded is a **PASS** with the note
  *"was 501, now implemented: promote this to a real check"*.
- **ISS-027 (medium) — exit code flattened the caveat.** A DIRTY-TREE run printed prose saying it
  was "not valid as final acceptance evidence" but still exited 0. Now exits **4**, and the
  headline reads `PASS (DIRTY-TREE — not attributable to <sha>)`. Also fixed the secondary point
  the checker noted: `qa/evidence/` is excluded from the dirty calculation, so the tool no longer
  dirties the tree it measures (its own output made the next run's count worse, 10 → 11).
- **ISS-028 (low) — my LOC figures were hand-typed and wrong.** Re-measured with `countLoc`, the
  metric `lint-loc` actually enforces: **live-verify.mjs 292**, **mint-key.mjs 46**,
  **demo-live.mjs 67** (budget 300). Same class of error as ISS-024, correctly called out.
  Noting for the record that live-verify.mjs at 292/300 is close to the budget — the next
  addition to it should split, not stretch.

### Proof of the two fixes the real server cannot exhibit
Neither case can be produced against the live API (nothing returns 200 for `/search`; real `/ask`
responses always carry `sessionRef`), so both were exercised against a throwaway fake API in the
scratchpad — real execution, not reasoning:
```
[PASS] GET /search — HTTP 200 — was 501, now implemented: promote this to a real check   # ISS-026
[FAIL] POST /ask citations resolve to real sessions
       — 3/3 cited source(s) carried no evidence.sessionRef — unverifiable               # ISS-025
```
Before the fix these were, respectively, a FAIL (for succeeding) and a silent PASS.

### Re-run after the fixes (real, against the live API + real Mongo)
```
[PASS] POST /ask side effect measured — appended 12 real `jobs` ledger row(s)
[PASS] POST /ask returns at least one citation — 3 internal + 0 web · verdict=correct
[PASS] POST /ask citations resolve to real sessions — 3/3 cited sessionRef(s) exist in Mongo
overall: PASS (DIRTY-TREE — not attributable to fbda37b4)
$ node scripts/live-verify.mjs --skip-ask >/dev/null; echo $?
4          # DIRTY-TREE now has its own exit code
$ pnpm lint:structure   # exit 0, all checks OK
```

## Why

Umesh: *"use /checker to validate first with visible browser"*, after having challenged earlier in
this session whether validation was genuine at all. The project had **no reproducible way to
answer "does it actually work right now"** — every prior claim was a transcript assertion. This
unit makes that answerable by one command, and separately makes it *visible to a human*.

## What changed

1. **`scripts/live-verify.mjs`** (new, 292 non-blank LOC — the `lint-loc` metric) — writes a dated `qa/evidence/live-<stamp>/`:
   `preflight.json` (git HEAD + working-tree cleanliness, and a real `countDocuments` for **all
   24 collections**, driven off `schema/` so a newly added collection is never silently
   unmeasured), `api/<route>.json` (raw response bytes per read route), `summary.md` (verdict
   table + the collection-count table + explicit "not exercised" list). Exit **0 / 2 / 3 / 4** for
   PASS / FAIL / INCONCLUSIVE / PASS-but-DIRTY-TREE.
2. **`scripts/mint-key.mjs`** (new, 46 non-blank LOC) — mints one API key and prints it. Deliberately
   separate from `seed-demo-server.mjs`, which also **rebuilds `tree_index`**: a verification run
   must never mutate the content it is about to measure. This is what makes the protocol's "never
   seed" rule actually enforceable rather than aspirational.
3. **`scripts/demo-live.mjs`** (new, 67 non-blank LOC) — opens the operator's **own** browser on all 9 app
   pages and prints the reconcile checklist. `pnpm demo:live`.
4. **`package.json`** — `demo:live` and `verify:live` scripts.
5. **`.gitignore`** — `qa/evidence/live-*/{pages,api}/` ignored; `preflight.json` + `summary.md`
   ARE committed. Rationale in the file: the bulk is regenerable by re-running the command, which
   is the entire design principle; committing ~2MB of binaries per run would bloat the repo for
   evidence anyone can reproduce on demand.

### Verdict vocabulary (deliberate, and load-bearing)
`PASS` · `FAIL` · `STUB` (a deliberate 501 — a recorded product fact, not a failure) ·
`MISSING` (route absent) · `INCONCLUSIVE` (the remote Mongo is genuinely flaky — a timeout must
never be reported as PASS *or* FAIL) · `DIRTY-TREE`.

`DIRTY-TREE` was added **while using the tool**: the first design made an uncommitted working tree
a `FAIL`, which conflates "the app is broken" with "this evidence can't be attributed to a
commit". It is now its own verdict that does not fail the run but is printed prominently and
recorded in `summary.md` as "not valid as final acceptance evidence for a shipped commit" — and it
cannot be used to hide a real failure, because every other check still stands on its own.

## Real evidence

### A real bug this unit found in ITSELF, before it could mislead anyone
The first run reported **`FAIL — POST /ask returns 0 citations`**. Rather than report the product
as broken, the raw body in `api/POST_ask.json` was read: `/ask` actually returns
`sources: {internal: [3 real sessions], web: []}` — an **object**, while the check asserted a flat
array. **The check was wrong, not the product.** Fixed to assert the shape the server really
sends, and hardened further: every cited `sessionRef` is now looked up in Mongo, so a
plausible-looking hallucinated citation id would fail. This is exactly the failure mode the
protocol exists to prevent, caught on its own first execution.

### Final run — `qa/evidence/live-2026-09-07-01-35-54/summary.md`
```
[DIRTY-TREE ] preflight: evidence attributable to a commit — 10 uncommitted file(s)
[PASS       ] preflight: mongo collection counts — 11/24 collection(s) have ≥1 real document
[PASS       ] GET /sessions · /sources · /gaps · /graph · /calendar/upcoming
[PASS       ] GET /meeting-candidates · /whatsapp/groups · /keys        (all HTTP 200)
[STUB       ] GET /search — HTTP 501
[STUB       ] GET /citations/none — HTTP 501
[MISSING    ] GET /health — HTTP 404
[PASS       ] reconcile: GET /sessions length == sessions in Mongo — api=26 mongo=26
[PASS       ] GET /sessions/2026-04-21-visa-blueprint-part2-italy-france-nz — HTTP 200
[PASS       ] POST /ask — HTTP 200
[PASS       ] POST /ask returns at least one citation — 3 internal + 0 web · verdict=correct
[PASS       ] POST /ask citations resolve to real sessions — 3/3 exist in Mongo
overall: PASS
```

### The headline finding the protocol now makes undeniable (real `countDocuments`)
**11 of 24 collections hold real documents; 13 are empty.**
```
POPULATED: turns 2118 · jobs 108 · claims 81 · sessions 26 · sources 26 · session_pages 24 ·
           meeting_candidates 13 · api_keys 4 · eval_runs 4 · tree_index 1 · trusted_senders 1
EMPTY:     chunks · consent_policies · decisions · features_event · gaps · graph_edges · media ·
           orgs · programs · speakers · tenants · topics · watched_sources
```
This is the on-disk proof behind §9's claim that the Brain is roughly half-built — no vector layer
(`chunks`), and no `topics`/`speakers`/`decisions`/`graph_edges` despite all four having schemas.

### Browser layer — all 9 pages, headed browser, real API + real Mongo
`qa/evidence/live-2026-09-07-01-35-54/pages/*.png` (9 full-page screenshots, gitignored,
regenerable). **0 console errors across all 9 pages.** Dashboard reads `26 Sessions · 26 Sources ·
2 Active API keys · 0 Open gaps` — reconciles exactly with both the API bodies and the Mongo
counts above. `/meeting-bot` correctly self-labels *"Not live yet — here's exactly what's real
today and what isn't"*. `/calendar` shows a real upcoming meeting from the connected calendar.

### Human layer
`pnpm demo:live` executed for real; it opened all 9 pages in the operator's own default browser
(not an automation-controlled one) and printed the per-page reconcile checklist.

### Lint / structure
```
$ pnpm lint:structure
lint-loc: OK (209 file(s) within budget)      # the 3 new scripts are within the 300-LOC budget
lint-dirsize: OK (74 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (239 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (1064 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration
✔ no dependency violations found (239 modules, 702 dependencies cruised)
```

## Disclosed limitations (not hidden)

- **`demo-live.mjs` does not start the servers**, contrary to the plan §9 sketch. Spawning
  detached cross-platform servers from a throwaway script leaves orphan processes behind, which is
  worse than one printed instruction; it now checks both ports and prints the exact commands if
  they are down. Deliberate deviation, disclosed rather than silently dropped.
- **Write paths are deliberately not exercised** (`POST /ingest`, `POST /whatsapp/ingest`,
  `POST /compete/*`, `POST /gmail/scan`, `POST /keys`, `DELETE /keys/:id`,
  `POST /webhooks/register`) — a verification run must not mutate content. They are listed in
  `summary.md` as *uncovered*, not silently skipped. `POST /ask` IS exercised (it is the core
  product path) and causes the server to append `jobs` ledger rows — the run MEASURES that delta
  rather than asserting a figure for it (ISS-024); `--skip-ask` opts out.
- The browser layer is driven by Playwright for repeatability; the genuinely human check is
  `pnpm demo:live`, and the protocol says so rather than pretending automation substitutes for it.
- This run is `DIRTY-TREE` by construction — the unit's own code is uncommitted while in flight.
  A post-commit re-run is the checker's cleanest confirmation.

## How to verify (for the checker)
1. `node scripts/mint-key.mjs` → prints a key (verify it is accepted: `curl /sessions` → 200).
2. `LKB_API_KEY=<key> node scripts/live-verify.mjs` → expect `overall: PASS`, exit 0, and a fresh
   `qa/evidence/live-<stamp>/` folder. **Re-run it a second time** — a second folder must appear
   with the same verdicts; that is the reproducibility claim, and it is the whole point.
3. Confirm `preflight.json` counts match reality by querying Mongo yourself independently.
4. Confirm the reconcile check is real: it compares `GET /sessions` length against the Mongo
   `sessions` count (both were 26).
5. `pnpm lint:structure` → exit 0.
6. Read `scripts/live-verify.mjs` and confirm it never writes application content (no seeding, no
   tree rebuild, no ingest) — grep it for any write to a collection other than the `jobs` row that
   `POST /ask` causes server-side.
7. Confirm `DIRTY-TREE` cannot mask a failure: every other check is independent of it.

## Status: checked-PASS (see qa/verdicts/live-verify-protocol.md, Cycle checked: 2, commit cd9e320)

Checker cycle 2: **PASS, 12/12 criteria, 5/5 invariants**, ISS-024..ISS-028 all flipped
`open → verified` under its own instruments (it bracketed a live run with its own Mongo count,
190 → 202, and the delta of 12 matched both the tool's reported figure and the fresh
`summary.md`; it stood up its own fake servers to reproduce the ISS-025 and ISS-026 fixes).

Four non-blocking observations it recorded rather than failing on, carried here so they are not
lost: (1) the `qa/evidence/` dirty-file exclusion is a regex rather than a path predicate;
(2) the jobs delta is bracketed around `/ask` rather than isolated to it — inherent to a shared
ledger, still strictly better than a constant; (3) **292/300 LOC means the next change to
`live-verify.mjs` must extract, not append**; (4) unrelated to this unit, `qa/issues.jsonl`
line 17 is malformed JSON — already tracked as ISS-020, left byte-intact per append-only.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
