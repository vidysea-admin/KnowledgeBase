# Verdict - groundbudget

**Cycle checked:** 0
**Verdict:** PASS
**Commits:** 9ee21f86

## Evidence
- Same serializer: extractPayloadLength builds `{phase:"extract-summary", spans, inventory: runtimeInventory(spans)}`, the identical shape and inventory function summarize passes to runtimeComplete. claims.ts sends phase "extract-claims" (1 char shorter), so it is covered. Budget is in JS string chars (JSON.stringify length), same unit runtimeComplete enforces.
- Probes (deleted): 100k-char single turn -> 24 windows, max request 8711; 20000 quote chars (escape doubling) max 8380; 9000 newlines max 10701; CJK + emoji max 11038, surrogate boundary kept, span text reconstructs the turn exactly; 3000 tiny turns -> 65 windows max 15976, all 3000 spans present; 500 empty turns all present. No evidence dropped in any case.
- Oversize single span: budget 4000 with a 4000-char turn throws "source metadata exceeds window budget" (loud, not silent).
- Env: "abc", "100", "NaN" throw; "" and unset = 16000; through summarizeSession the garbage value degrades with the explicit reason, no crash. Numeric-but-odd "1e5", " 20000 ", "0x4000" are accepted (Number()); harmless.
- Grounding: in-window citation only; a claim citing a turn outside its window degrades ("quote not bound to submitted source"). Short sessions n=1,2,5,12,18 byte-identical to old 12000 packing (test). Judge x4=64000, reconcile x2=32000, judge context x3=48000 equal the old constants at default.
- Runs: packages/index node --test: tests 678 / pass 677 / fail 1 (known judge.test.ts vision-route, lane indextests). apps/api with D2_FIXTURE_PYTHON=main .venv python: tests 874 / pass 874 / fail 0 (activity-health failure was environmental, now gone). tsc --noEmit -p packages/index exit 0. lint-loc --all OK (969 files), all stages exit 0.
- Mutation (per-mutation byte backup, try/finally, timeout 240 s, hash applied check, git hash-object == HEAD after each, all restored==true):
  KILLED: drop exact-request clause (3 fail); +2000 slack (3 fail); inventory omitted from size (3 fail); window-boundary grounding clause removed (1 fail); min 4000 -> 100 (1 fail).
  SURVIVED: removing the single-span `fits([span])` pre-check (near-equivalent: the over-budget span would still be refused loudly by runtimeComplete, but the dedicated error and the budget-4000 long-turn throw are untested).

## Notes (low, not filed)
- Minimum 4000 allows a budget at which a legal 4000-char span can never fit (budget < ~5000 with long turns throws). Loud, operator-visible; consider raising the floor to ~6000 or shrinking spans for small budgets.
- The `fits([span])` throw has no test.
- Judge request size (spans+context+items) is only bounded by the x4 budget refusal, as before; not changed here.

ISSUES-WRITTEN: none
