# HUMAN_GATE — START approval for a new contract: `qa/contracts/handshake-liveness.md`

**Opened:** 2026-09-09 by the Mode B sweep (13:2xZ), bound root `D:/KnowledgeBase`.
**Severity:** high — it blocks the durable fix for ISS-196/ISS-199 and the reader half of ISS-178.
**Owner:** Umesh (Approver). Nothing here is a maker fix.

## Why this file exists at all

This gate has been sitting **only as a row in `qa/QUEUE.md`** since the `dispatch-state-tracking`
cycle-1 check. A gate that exists only in a queue is the 2026-09-03 D-006 loop: the ask lived
off-disk, the sweep kept flagging it, and the maker kept re-asking. Promoting it to a file is the
whole point of `qa/gates/`. **No new question is being asked here** — this is the QUEUE row, on disk,
where check 6 can see it and where an `Answered:` line can be written.

## The question, in one line

May the checker author a new contract `qa/contracts/handshake-liveness.md`, covering the
maker-checker handshake's liveness mechanics?

## Scope of the proposed contract

- Dispatch-marker write/derive semantics (`scripts/lib/dispatch-state.mjs`, PASSed twice).
- The five handshake states and the rule that a matching-cycle verdict always beats the marker.
- `STALE_MS` and what "a checker died mid-check" means operationally.
- Reader obligations on `.claude/hooks/mc-sessionstart.ps1` and on **sweep check 1**.
- **A canonical stamp format** for `Status:` / `Fix cycle:` / `Cycle checked:` that a parser can
  anchor on — see below.

## Why it cannot go under an existing contract

The `dispatch-state-tracking` cycle-1 checker ruled that handshake mechanics do **not** belong
under `qa/contracts/loop-safety.md`, whose north star is confined to the loop's *mutation*
procedure not damaging what it verifies. That ruling stands and this sweep confirms it. Nor can the
checker simply write the file: `loop-safety.md`'s own corrected provenance note (D-022) records that
its C7–C8 were authored by a checker without a START approval and needed human ratification after
the fact — *"a checker that can widen its own mandate by writing a contract is a self-certification
path."* Doing it again would be the same error with the lesson already written down.

## The framing this sweep is asked to confirm — and does

The cycle-1 checker of `dispatch-state-quoting-and-vacuity` argued that **ISS-196 and ISS-199 are
one problem, not two**: a machine-read field is being recovered from free-form prose, so every fix
round buys exactly one more markdown edge case and no more.

**CONFIRMED, on measurement rather than agreement.** The evidence is the repo's own history, not the
argument's plausibility:

- Manifest `Status:` alone appears in **at least five in-tree forms** — `## Status:` (45),
  `**Status:**` (16), bare `Status:` (29), `**Status:** … (cycle 3)`, and prose/blockquote mentions
  that must be excluded. That is a corpus of shapes, not a value.
- The class has produced ISS-176, ISS-183, ISS-184, ISS-186, ISS-192, ISS-193, ISS-194, ISS-196,
  ISS-199 — **nine issues across three hooks and one module**, every one of them a parser widening
  or narrowing against prose.
- Round 3 of `delivery-gate-manifest-blindness` abandoned accuracy for a one-sided *safety property*
  precisely because no ground truth could be written without writing the answer. That is what a seam
  looks like when the input format, not the parser, is the defect.
- The live uncommitted `Strip-Code` change in `D:/ai_os` (ISS-200) is the same fight one level down,
  in a third file, on the same day.

A canonical stamp — one machine-readable line per field, in one place, that the writers emit and
every reader anchors on unambiguously — ends the class instead of narrowing it. Continued stripper
rounds do not. **ISS-199 should therefore not be fixed as written**; it should wait on this contract.

## Options

- **A — approve START** (recommended). The checker authors `qa/contracts/handshake-liveness.md` to
  the scope above. The canonical stamp format is then a criterion, and ISS-199 closes against it
  rather than against a fourth stripper.
- **B — approve START with narrowed scope.** Same, minus the stamp format, which you would rather
  decide separately. Then ISS-199 stays open with no durable fix and the sweep will keep saying so.
- **C — decline.** Handshake liveness stays uncontracted. Then say plainly which existing contract
  judges `scripts/lib/dispatch-state.mjs`, because today none does and it has PASSed twice.

## Answer format

Write your choice under an `## Answered:` heading in **this file** (and, for A or B, a
`docs/DECISIONS.md` entry — no `Approved-by` is needed for contract creation, only for enforcement
paths). One line is enough.

**Links:** ISS-178, ISS-196, ISS-199, ISS-203; `qa/verdicts/dispatch-state-tracking.md`;
`qa/verdicts/dispatch-state-quoting-and-vacuity.md`; `qa/QUEUE.md` (the row this file promotes).

## Answered:

_(unanswered)_

**Gate status:** OPEN — awaiting the Approver; see the Answer format section in this file
