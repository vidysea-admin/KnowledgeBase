# w27-askbudget

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w27-askbudget.md
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-askbudget (branch lane/w27-askbudget)
Base SHA: 4264418c7488d95e76bc0d86e3920efb0e0ccd72
Issue: ISS-ASKSHARED-001 (qa/issues.askshared.jsonl)

## Changed paths
- packages/ask/src/ask-graph.test.ts (one test added; production code unchanged, it was correct)
- qa/manifests/w27-askbudget.md
- ask-graph.baseline.json untouched

## Behaviour
New test: boundedX({swallowedHuge:true}) with scoreFnForComplete returning 0.05, no tavily. Both askV2 and askGraphV2 must reject /budget exhausted/ with calls == ['ask.select_nodes']. Without the first assertHealthy after evaluate (ask-graph.ts evaluateNode), refineNode returns the "No supported internal source" success early.

## Checks
- cd packages/ask; node --test --import tsx src/ask-graph.test.ts : tests 60 pass 60 fail 0 (baseline 59)
- tsc --noEmit -p packages/ask/tsconfig.json: exit 0
- D-020 mutation: ask-graph.ts line 127 (budget.assertHealthy()) replaced by comment -> new test FAILS (pass 0 fail 1); restored, git -c core.autocrlf=true hash-object == HEAD blob 895bc4e0.
- lint-loc --all: loc, dirsize, root, dupes, migrations, codex-hooks, snapshot pass. lint-tests and tracker hit SIGTERM under load (vary run to run); dependencies fails on unresolvable @lkb/ingest etc. in meeting-bot (lane has no workspace junctions; not touched by this unit). Not all 10 stages green: unresolved.
