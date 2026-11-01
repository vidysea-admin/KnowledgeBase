# Verdict (coordinator B) — wa-student-data-gate

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Base: ba7d5249  Head: 70d8ac64 (code head db37c712)  Tier: L (dual; security trigger `apps/api/src/visibility/knowledge.ts:119`)
Date: 2026-10-30  Bound root: D:/KnowledgeBase/.worktrees/wa-student-data-gate  Contract: none specific; scope plan.md W11 part B + docs/whatsapp/student-data-call-sites.md; policy gate H-10 (`qa/gates/wa-student-data-default.md`).
Blind: coordinator A's verdict and evidence were not read.

## Check plan (step 0)
Instruments: (1) `git archive` copies of 70d8ac64 (`ref`, `mut`) and of ba7d5249 (`basecopy`) outside the bound root, node_modules junctioned to the main tree and removed afterwards with `cmd /c rmdir`; (2) re-run of every manifest test file plus the whole `apps/api/src/**/*.test.ts` suite on the head copy, with the failing files re-run one by one against base; (3) 12 mutants, one or more per criterion, each in the `mut` copy with a per-mutation byte backup, a real `timeout`, no EXIT trap and a `git hash-object` vs `HEAD:` blob check; (4) 9 own probes (`chkb-probe.test.ts`, not committed) aimed at leaks the maker's tests do not name; (5) a read of every egress point the survey lists (A1-A11, B1-B7) against the diff. No Mongo, no production, no `.env`, no push, no consent check (D-210).

## Results
- Re-run (head copy): external-model-gate 19/19, external-model-tree 9/9, external-model-hydrators 16/16, external-model-reader 6/6.
- Whole `apps/api` suite on the head copy: 2495 tests, 2424 pass, 38 skipped, 33 fail. All 33 failures are in 20 test files (plus 13 named tests) that need `scripts/`, `qa/`, `migrations/` or `raw/` files my partial copy does not carry; each of the 20 files fails identically (1 test, 0 pass, 1 fail, a module-not-found at load) on the base copy of ba7d5249. Zero failures differ between base and head. The manifest's W-7 file list is a subset of the passing set.
- `tsc --noEmit -p apps/api` on the head copy: exit 2 with exactly three TS2307 "Cannot find module" errors, all in untouched test files importing `scripts/lib/mint-scopes.mjs` and `qa/packets/*.json` that my copy lacks; no other diagnostic. Not a unit regression.
- `node scripts/lint-loc.mjs --all` in the bound root: loc, dirsize, root, dupes, migrations, codex-hooks, lint-tests OK. `snapshot` and `tracker` fail as the manifest says (snapshot lists `scripts/whatsapp/` ahead of the committed tree; tracker is the bare-ISS advisory family), neither file touched by this unit. `dependencies` fails here only because `dependency-cruiser` is not installed in the bound root; NOT independently re-run (manifest claims exit 0 with junctions).
- `git diff -w` of `knowledge.ts`: every changed line outside `extEligible`/interface/exports is a line join or a comment move; no semantic change found.

## Falsification (mut copy; 12 mutants; all restored, HEAD-fidelity True each)
| Crit | Mutant | Result |
|---|---|---|
| W-1 | drop `source !== null &&` (unknown source id becomes eligible) | KILLED (gate 2 red) |
| W-1 | missing link row treated as eligible (`link === null \|\| studentData === "no"`) | KILLED (gate 3, hydrators 6) |
| W-2 | tree prune ignores `evidence.sessionRefs` | KILLED (tree 5 red) |
| W-2 | `/ask` tree store unwrapped in production.ts | KILLED (tree wiring 1 red) |
| W-3 | transcript hydrator gate made dead (`includes(null)`) | KILLED (hydrators 5) |
| W-3 | native hydrator check replaced by `if (false)` | KILLED (hydrators 7) |
| W-3 | production `nativeSources` factory passes `async () => true` | KILLED (hydrators 2) |
| W-4 | outputs reader gate made dead | KILLED (reader 5) |
| W-5 | `createMongoWhatsAppDeps(boundIndexer,` restored | KILLED (gate wiring 1) |
| W-5 | `indexSession` `sessionVisible` guard off | KILLED (gate G4 6) |
| W-6 | non-WhatsApp source needs a link (`false \|\| (link`) | KILLED (gate 1, tree 6) |
| W-7 | adjusted native-message fixture link set to `yes` | KILLED (message-vertical 4/4 red) |
Mutants 1-4 of my first batch were void (my harness decoded the TAP summary with the wrong codec and one pattern was malformed); the whole batch was re-run with the fix and the table above is that second run.

## Own probes (mut copy, all green unless noted)
- Exact-`no` only: `No`, `NO`, ` no`, `no `, null, undefined, true, 0, "", "false", `{$ne:"yes"}` are all excluded. Non-string or operator link stamps (`{$ne:null}`, 5, array, null, "") are excluded.
- Tree store: re-reads the link on each load (no cross-load staleness) for `load` and `loadWithExclusions`; `sessionRefs` given as a string, an object or with a null entry prunes the node; non-string `sessionRef` prunes; empty `sessionRefs` keeps (nothing to gate).
- Outputs reader: a mixed request (public session plus an excluded WhatsApp session) is refused whole for yes, unknown, legacy, missing and foreign; a `no` link serves the approved claim and turn.
- Transcript hydrator: a lone excluded session and an excluded session beside a public one are both refused.
- Session predicate: a session whose source row is missing is excluded; a public source/session stays eligible when the WhatsApp link row is missing.
- OBSERVATION P-A (see issue 2): a link in a terminal state (revoked, unlinked, rejected, suspended, `live:false`) with `studentData:"no"` is still eligible.
- OBSERVATION P-B (see issue 1): a node of a non-`native-` level carrying only `evidence.sourceId` of an ineligible WhatsApp source is NOT pruned by G1.

## Leak judgement (can WhatsApp text from a yes / unknown / missing / legacy / foreign-tenant link reach an external model?)
- Route tree: no. `/route` is wrapped (`production.ts:177`). Independently, `buildRouteIndex` skips `native-source`/`native-passage` nodes and step B only offers sessions that pass `sessionVisible`, which is false for every `whatsapp-batch` source whatever the link says.
- Ask tree: no. `production.ts:212` wraps the store; the answer-policy router, the compete router and the flywheel all take their tree from `deps.ask`, so they share the wrapper (grep: `createMongoTreeStore` is called at exactly two production sites). Per-request prune, fail-closed on read error and non-string ids.
- Hydrators: no. Transcript hydrator refuses any session with rows whose link is not `no` before quoting; native hydrator refuses per admitted node before `listLocators`, requires the dependency by type, and its locators must carry the node's own `sourceId`, so a locator cannot borrow an eligible node's gate. Production `nativeSources(tenantId)` builds one visibility per request and wires the gate (mutant killed).
- Outputs reader: no. Whole request refused with 404 when any requested session is ineligible; selected turns are limited to the requested sessions and a claim cannot mix sessions (`approved()` pins candidate.sessionId to the evidence session), so a requested public session cannot drag in an excluded one.
- Indexer: no. `indexSession` refuses every `whatsapp-batch` session (guard pre-dates the unit, now pinned by tests for every link state), and the latent `boundIndexer` binding is gone. The other model call sites that read turns (speaker suggest, tile suggest, transcript-review refresh, connector workflow) run inside `indexSession` or hold no model call.
- Residual, not a leak today: issues 1-3 below.

## Criteria
W-1 MET (matrix of link states, tenant scoping, fail-closed read error, live resolve per instance, memo; 2 mutants plus probe set). W-2 MET (both consumers wrapped; sessionRef, sessionRefs and `native-` sourceId all pruned; input tree not mutated). W-3 MET (both hydrators refuse with a content-free error before any read; dependency required; factory wired). W-4 MET (`createMongoOutputReader` 404 on any ineligible requested session). W-5 MET (G4 refused for all six link states; production binding removed; wiring pinned). W-6 MET (non-WhatsApp unaffected under every link state; foreign and invalid tenant excluded). W-7 MET with the environmental caveats above (no failing test differs from base; tsc clean apart from three missing-file imports of my partial copy; lint stages as stated; consent code untouched, D-210).

## Open points 1-11 (judged)
1 G5 not built: accepted, out of brief; no per-use approval is needed at default `no`. 2 legacy unstamped sources excluded: this is H-10 as answered, accepted. 3 memo per capability instance: verified that every call site builds one per request (`requestDepsFor`, tree load, reader, `nativeSources`). 4 prune not counted in `excluded`: counts only, accepted. 5 whole-request refusal: accepted, content-free. 6 router not gated: accepted; see issue 1 for the one producer-side hole. 7 compaction: verified by `git diff -w`. 8 pre-existing snapshot/tracker failures: confirmed not from this unit. 9 reader session-level gate: confirmed sufficient (claims cannot span sessions). 10 trailer: no objection. 11 consent: untouched.

## Notes (not findings)
`message-publication-fixture.ts` now stamps `link-w`; flipping that link to `yes` is caught by the hydrator production-wiring test, not by message-vertical's own link (separate fixture), which is fine. Consent code untouched (D-210).

PROPOSED-ISSUE: {"id":"P1","sev":"low","class":"defense-in-depth","title":"G1 gates `evidence.sourceId` only for nodes whose level starts with `native-`; a node of any other level that carries only an ineligible WhatsApp `sourceId` survives the prune, and its title and summary reach select_nodes and the evaluator before the native hydrator refuses the whole request","fix_direction":"in createExternalModelTreeStore.keep, check externalModelEligible for any node with a string evidence.sourceId regardless of level (keep the native- rule for the missing-sourceId case)","evidence":"probe P3 in chkb-probe.test.ts: nodes `topic{sourceId:WA}` and `session{sourceId:WA}` kept under a yes link; apps/api/src/store.ts:70; no producer builds such a node today"}
PROPOSED-ISSUE: {"id":"P2","sev":"low","class":"policy-gap","title":"externalModelEligible resolves studentData only and ignores link state: a revoked, unlinked, rejected or suspended link (live:false) with studentData `no` keeps its WhatsApp source eligible for external models","fix_direction":"Umesh to decide under H-10 whether a terminal link should fail closed; if yes, require link.live === true (or state in LIVE_LINK_STATES) at knowledge.ts:119 and add a gate test","evidence":"probe P2: eligible true for revoked, unlinked, rejected, suspended"}
PROPOSED-ISSUE: {"id":"P3","sev":"low","class":"undeclared-scope","title":"The survey's cache-and-replay hazard (docs/whatsapp/student-data-call-sites.md section 4) is neither built nor listed in the manifest's open points: stored answers, knowledge outputs and the search cache derived while a link was `no` are not invalidated when it flips to yes or unknown. No new model egress (replay, not a send) but the derived text stays served","fix_direction":"declare it as an open point or open a follow-up unit that stamps and invalidates derived stores on a studentData change, as withdrawal does (ISS-420 pattern)","evidence":"survey section 4 'Cache and replay hazards'; manifest Open points 1-11 do not mention it; no code in the diff touches answer-policy stores, knowledge-outputs/repository or search-cache"}

VERDICT: PASS
SCOREBOARD: 7/7 criteria met (W-1..W-7), 12/12 mutants killed (second run), 0 invariant breaks
TIER: L (security: WhatsApp text reaching external models; dual-trigger cited in the manifest)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (server-side egress gate, no screen)
LIVE-BROWSER: not-applicable (no UI surface)
ISSUES-WRITTEN: none (dual coordinator; PROPOSED-ISSUE P1-P3 above, all low, none blocks)
EXECUTOR: claude-sonnet (checker: claude-sonnet-subagent)
EXPLANATION: Independent re-run, an own 9-probe leak hunt and 12 per-criterion mutants found no path by which WhatsApp text from a yes, unknown, missing, legacy or foreign-tenant link reaches an external model through the Route tree, Ask tree, either hydrator, the outputs reader or the indexer, and the full API suite differs from base only by environment-missing files. Three low residuals (a level-keyed prune, link state not consulted, undeclared cache replay) are filed as proposals and do not change the verdict.
Metrics: start=2026-10-30T14:50:00Z(est) end=2026-10-30T15:35:00Z wall_min=45 agent_min=unavailable blocked_min=0 suite_runs=3 repeat_runs=0 mutations=12 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2700 mutants=12 defects_found=0
