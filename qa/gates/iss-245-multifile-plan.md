# HUMAN_GATE — ISS-245 browser-opener accountability plan

**Question:** May the following two existing files be changed to make `pnpm demo:live` fail
honestly when the operating-system browser opener fails?

## Exact in-place plan

1. `scripts/demo-live.mjs` — refactor the page-opening block at current lines 109-121 into an
   import-safe async helper. Await every `execFile` callback, report the exact URL and opener error,
   aggregate failures, exit non-zero when any page fails, and print the reconciliation checklist
   only after every opener succeeded. Preserve the 350 ms tab-order stagger.
2. `scripts/lint.test.mjs` — add a regression test with an injected opener that fails one URL.
   Assert that the helper rejects, identifies that URL, and never emits the success-shaped
   checklist. Add a success-path assertion so the failure guard cannot become unconditional.

## Verification

- `node --check scripts/demo-live.mjs`
- the focused Node test, then `pnpm test:lint`
- `pnpm lint:structure`
- fresh senior-software-engineer review, followed by a fresh maker/checker Mode A verdict

No browser page, API route, Mongo collection, production data, or external service is changed.

## Options

- **A — approve the two-file plan (recommended).**
- **B — decline or revise it.** Leave ISS-245 open and state the desired change.

**Answer format:** `iss-245-plan: A` or `iss-245-plan: B <revision>`.

**Blocks:** ISS-245 only. Other read-only/local work remains available.

**Opened:** 2026-09-09T18:00:46+05:30 after checker sweep `d358090`.

**Answered:** 2026-09-21 — **A (approve the two-file plan)**. Umesh approved the exact in-place plan above (scripts/demo-live.mjs opener accountability + scripts/lint.test.mjs regression test; no browser page, API route, Mongo collection, production data, or external service changed).

## Checker reconciliation (Mode B sweep 2026-09-21)

The question above was answered on disk on 2026-09-21 (A) and the answered work is landed (commit e22dea5, manifest qa/manifests/iss-245-opener-accountability.md, verdict qa/verdicts/iss-245-opener-accountability.md, checker PASS). The earlier **Answered:** 2026-09-21 - **A (approve the two-file plan)** line above already resolves this gate; this note adds the on-disk pointer so no later sweep re-asks it. (Checker note 2026-09-21T23:4x+05:30; no decision content changed.)
