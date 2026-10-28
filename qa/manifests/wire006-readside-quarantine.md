# Manifest — wire006-readside-quarantine

Status: checked-PASS
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-wire006 (branch lane/w17-wire006), base 9e55b642. Candidate SHA: the lane HEAD commit.
Task: T-007, ISS-WA-REVIEW-WIRE-006 (HIGH tenancy / privacy class, full ceremony). The ledger row stays `open` until a checker verdict.

## Finding
At base 9e55b642 every apps/api reader named in the ISS-WA-REVIEW-WIRE-006 row already routes through `createKnowledgeVisibility` (visibility/knowledge.ts) directly or via `composition/integrations/trusted-readers.ts` (listed in the evidence below). `packages/index` (graph, search, vector) and `packages/ask` perform NO database reads: they are pure functions over trees, edges, sessions and turns that apps/api hands them already gated, so they have no reader to fix (grep for getDb/scopedCollection/.collection( in both src trees, excluding tests: 0 hits). **Production source is NOT changed.** What was missing was the criterion-9 regression: no test planted answer-bearing WhatsApp text and proved each reader withholds it. This unit adds those tests and proves each one by mutation.

## Changed paths (all new or test-only)
- apps/api/src/visibility/wa-quarantine.testsupport.ts (fixture: one tenant, WhatsApp session in pending/rejected/approved state + public control session, old-wiring claim/chunk/page/tree node/graph edge all carrying the PLANT string)
- apps/api/src/visibility/read-side-quarantine.test.ts (17 tests: lexical /search, semantic corpus + semantic search, /ask lexical+vector arms, claims list, knowledge outputs, eligible-tree input, topic catalog)
- apps/api/src/visibility/read-side-quarantine-trusted.test.ts (9 tests: brain list/detail, grounded content, citations, /ask tree, /graph; imports composition readers, edits none)
- apps/api/src/ask/source-context-quarantine.test.ts (3 tests: source hydrator; source-context.ts NOT edited)
- apps/api/src/ask/graph-context.test.ts (+1 test: topic graph snapshot with an unreviewed WhatsApp source)
- qa/issues.W17WIRE006.jsonl (2 low rows, see below), qa/evidence/w17-wire006/* (mutation script, log, summary), this manifest.
Not touched: apps/api/src/composition/**, apps/api/src/ask/source-context.ts, qa/contracts/**, TASKS.md, DECISIONS.md.

## Contract clause
qa/contracts/whatsapp-ingestion-first-slice.md criterion 9 (quarantine covers every trusted read path; plant unique text, prove the arm would select it with the guard removed, prove the real response neither uses nor cites it, approved text answerable only after approval, remains unavailable after rejection).

## Ledger corpus (D-015)
The ISS-WA-REVIEW-WIRE-006 row records no literal inputs; its `repro` is a list of reader paths. Count by reader path:
- ISS-WA-REVIEW-WIRE-006: 9/12 named paths covered by a planted-text test that passes with the guard and fails with it removed: ask-arms (lexical, tree input, vector), search-store, semantic-search (corpus + store), grounded-content/reader, store.ts session/turn/claim detail + citations + tree + graph (via trusted-readers), claims list (router via store), source-context hydrator, graph-context.
- Named but with no database reader (pure, nothing to guard; no test possible): transcript-review/planner.ts, packages/index graph (build-graph, routes/graph consumes the gated trustedGraphReads), packages/ask. That is 3/12. Net: 9 covered + 3 not applicable = 12.
- Also covered beyond the row: knowledge outputs reader, eligible-tree input, topic catalog (all reach the same trusted perimeter).
- "Purge of already-indexed WhatsApp rows": NOT done (deleting data is a human action). `auditWhatsAppQuarantine` already reports them.

## Checks a checker must run (cwd apps/api, node on PATH from the codex runtime, wrap each in `timeout 600`)
 node --test --import tsx src/visibility/read-side-quarantine.test.ts            # 17 pass
 node --test --import tsx src/visibility/read-side-quarantine-trusted.test.ts    # 9 pass
 node --test --import tsx src/ask/graph-context.test.ts                          # 10 pass (9 pre-existing + 1 new)
 node --test --import tsx src/ask/source-context-quarantine.test.ts              # 3 pass
 node ..\..\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json         # clean
Fake-DB only (in-memory Mongo subset); no browser, Mongo, provider or network. A real replica-set run was not done.

## Mutation proof (D-020 + 2026-09-28 amendment)
`qa/evidence/w17-wire006/run.sh` (+ run10.sh): per mutation, a byte backup of that one file, a trap on EXIT/INT/TERM/ERR scoped to that mutation, `timeout 600`, `cmp` against the backup, and a final HEAD-fidelity hash. The mutant replaces `createKnowledgeVisibility` in ONE reader with `__mutant_permissive.ts` (admits everything; "guard removed"). All 10 mutants KILLED, by name:
 M1 search-store.ts 3 fail | M2 semantic-search/current-corpus.ts 5 | M3 ask/ask-arms.ts 2 | M4 claims/store.ts 2 | M5 knowledge-outputs/reader.ts 2 | M6 indexing/eligible-tree.ts 3 | M7 knowledge/metadata-visibility.ts (topic catalog) 2 | M8 composition/integrations/trusted-readers.ts 7 | M9 ask/graph-context.ts 1 | M10 ask/source-context.ts 3.
No load/syntax errors in any mutant log. All mutated files were restored from backup and verified identical to HEAD (see HEAD-fidelity note). Whole-reader mutants only; per-method survivors (several readers hold two independent guards, e.g. current-corpus filterTurns + safeCitationSession) were not enumerated.
HEAD-fidelity note: Git Bash `git hash-object` reports MISMATCH for every file because this machine's system gitconfig has core.autocrlf=true (working tree is CRLF, blobs LF) while the shared repo config says false. `git -c core.autocrlf=true hash-object` equals `git rev-parse HEAD:<file>` for all 10 mutated files.
The trusted-readers test file was re-typed for tsc after M8 (types only, no assertion changes).

## Filed, not fixed (qa/issues.W17WIRE006.jsonl)
- ISS-W17WIRE006-001 (low): transcript-review router `authorizeSession` is optional (fails open if a composition omits it). Production binds it; fixing needs composition/**.
- ISS-W17WIRE006-002 (low): evaluation-flywheel store reads raw turns/chunks; restricted to lkb_t059_* databases, digests only.

## Not established
Real MongoDB snapshot/MVCC behaviour; web (apps/web) surfaces; the already-indexed-rows purge; the pre-existing ledger statuses.
