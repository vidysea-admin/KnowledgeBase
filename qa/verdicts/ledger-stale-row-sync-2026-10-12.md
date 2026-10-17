# Ledger stale-row sync - 2026-10-12

VERDICT: PASS (3 rows flipped to `verified`; 19 left `open` as claimed-not-verified; 107 genuinely open)
Checked on: lane/ledgersync2 from a25154f. Checker re-read each verdict and manifest itself; no source, contract, manifest, decision or hook file touched; no tests, builds or browsers run (rows flipped on existing PASS verdicts only). Follows qa/verdicts/ledger-stale-row-sync-2026-10-11.md.

Rule applied to each flip: (1) latest cycle of the verdict is PASS and states the id fixed / verified / closed / satisfied with the row's full reproduction count; (2) manifest `checked-PASS`; (3) fix commit is an ancestor of HEAD (`git merge-base --is-ancestor`, all true); (4) nothing later reopens it (`git log --all --grep`, grep of qa/verdicts and qa/issues*.jsonl). Ids were searched case-insensitively, including slug-named verdicts and manifests, and by key file or function name for fixes that landed under another slug.

## Counts (open rows by severity)

| bucket | critical | high | medium | total |
|---|---|---|---|---|
| EXCLUDED (other lanes; reported only, not judged) | 2 | 8 | 18 | 28 |
| STALE-FIXED (flipped) | 0 | 0 | 3 | 3 |
| CLAIMED-NOT-VERIFIED | 0 | 8 | 11 | 19 |
| GENUINELY-OPEN | 2 | 32 | 73 | 107 |
| audited (non-excluded) | 2 | 40 | 87 | 129 |

Open rows before: critical 4, high 48, medium 105, low 91. On this branch: critical 4, high 48, medium 102, low 91 (low rows not audited).

## Flipped to verified

| id | sev | evidence read (qa/verdicts/...) | fix commit |
|---|---|---|---|
| ISS-T034EXT-002 | medium | t034-capture-failure-not-success.md:41-42 (cycle 0 PASS "Verified ... -002"; not retracted by cycle 1 FAIL / cycle 2 PASS; manifest checked-PASS cycle 2) | 709038c |
| ISS-T034EXT-006 | medium | same :41-42 "-006" | 709038c |
| ISS-STATUSSCOPE-001 | medium | iss-statusscope-001-web-status-uses-tenant-counts.md:11,15-16 (PASS cycle 0: no /health request in apps/web/src, 5/5 mutations killed; names the row by slug, jsdom only); manifest checked-PASS | c98b4fc (merge b97b3c3) |

Each row now carries `status: verified`, `verified_date: 2026-10-12`, `fixed_date` (fix commit date, where it was null) and a `verified_evidence` string citing verdict path:line and the commit, as the 2026-10-11 sync did. The ISS-T034EXT and ISS-STATUSSCOPE rows keep the logic-with-fakes / jsdom-only scope caveats their verdicts state. Also stale but out of scope (low severity, not flipped): ISS-T034EXT-001, -003, -007 (same cycle-0 PASS line, fixed by 709038c).

## CLAIMED-NOT-VERIFIED (left open; missing piece)

| id | sev | missing piece |
|---|---|---|
| ISS-229 | high | delivery-gate-stamp-adoption c2 PASS says "ISS-229 satisfied" (a judgement, not a stated fix with full reproductions); the 2026-10-11 sync deliberately left it open because the fix lives in the unreadable D:/ai_os hook |
| ISS-274 | high | unit iss-274-wire-web-fallback PASS (Mode D re-dispatch) wired the seam per D-041, but no verdict states ISS-274 closed; no recorded reproductions; a real fallback needs TAVILY_API_KEY in production |
| ISS-ALERTID-001 | high | r1-alert-id-resolver cycle 1 PASS: 11/11 alerts resolve, W9 "MET for a single-tenant operator machine", not validated against the real poller; wiring unit must re-verify; ISS-ALERTFIX-001 stays open |
| ISS-346 | high | iss-346-round-cap-mechanical-check cycle 1 PASS, 3/3 reproductions, but the H1+H2 diff is a packaged patch not yet applied to the D:/ai_os hook (live sha unchanged); checker left it open |
| ISS-205 | high | 3/3 reproductions pass in delivery-gate-stamp-adoption c2 and machine-wide-fix, but D:/ai_os hook edits are uncommitted; machine-wide-fix :286 says leave open until ISS-190 resolves |
| ISS-227 | high | delivery-gate-stamp-adoption c2 "confirmed closed at live sha" but the fix lives only in the out-of-repo D:/ai_os hook (unreadable here); 2026-10-11 sync left it open for the same reason |
| ISS-228 | high | same as ISS-227 (closed at live sha in D:/ai_os; cannot be re-confirmed from this repo) |
| ISS-230 | medium | verdict :72 "stays open until the Approver answers and the diff actually lands"; packaged diff unlanded |
| ISS-298 | medium | iss-298-ledger-id-allocator 5/5 reproduction but checker "would not close": allocator unwired, triage-only C3, contract unratified; 2026-10-11 sync left it open |
| ISS-366 | high | repair claimed (095585d, parity lint 6/6) but no verdict replays its 3 reproductions; nothing re-establishes hard-link parity automatically |
| ISS-135 | medium | medium-fix-batch-2 verdict only says "closable" (grep EDITED SINCE = 0); structural half (catalogue-score warnings) unfixed per the row checker_note; no fix verified |
| ISS-LOCKTAKE-009 | medium | merge condition of t037-join-rules-stale-lock-takeover cycle 1 PASS; relocation 4dfc56e/9e9aa02 landed AFTER the PASS and no checker re-ran lint-dirsize on it |
| ISS-310 | medium | qa/gates/plan-approved.md now exists (precondition resolved) but the sweep deliberately left the row open; no PASS verdict covers it |
| ISS-312 | medium | row note says resolved concurrently (delegation-ledger bootstrapped, 222010f); no verdict states it closed |
| ISS-261 | medium | row says "treat as closed-at-6"; no artefact to change and no PASS verdict naming it; closable by checker judgement only |
| ISS-231 | medium | delivery-gate-stamp-adoption c2 calls it "partial": one aggregate line, not itemised per manifest; accepted as a disclosed shortcut, not N of N |
| ISS-214 | medium | one of two gates answered (mc-hooks-manifest-blindness APPROVED 2026-09-26); ledger-shard-union-hook half last seen unanswered 2026-09-27; no verdict |
| ISS-248 | medium | premise expired (AGENTS.md now tracked) per the row note, but lint-root still red; no verdict closes it |
| ISS-204 | medium | iss-367-structure-stages-green-c2 PASS reports the snapshot stage green, but no verdict ties that to ISS-204; medium-fix-batch-2 classed it COLLIDES |

## GENUINELY-OPEN: product code (41)

- ISS-104CC-3 (M): Place-vs-person signal false-positive cost
- ISS-ALERTFIX-001 (M): Alert id resolver misses some alerts
- ISS-ALERTID-002 (H): Unsalted SHA-256 alert id guessable
- ISS-ALERTID-007 (M): Calendar/gmail alert resolution unproven vs poller
- ISS-ALERTID-008 (M): Alert-who printed-field allowlist untested
- ISS-AUTHTENANT-002 (M): treeIndexRootFilter tenant filter unguarded (12/13 closed)
- ISS-110 (M): Speaking discriminator allowlist, not noun test
- ISS-122 (M): recordVectorGap swallows gap-write failures silently
- ISS-232 (M): Golden-set diagnostics omit 92-set lineage
- ISS-258 (M): Golden-set pool holds undisclosed 24th session
- ISS-273 (M): Speaker/eval seam duplication erosion signals
- ISS-281 (M): Web client.ts auth rewrite churn
- ISS-283 (H): Phase-3 stability claim unsupported by runs
- ISS-284 (M): Phase-3 evidence dir has undisclosed files
- ISS-289 (H): Phase-3 scorer citation test circular
- ISS-290 (M): Phase-3 harness lacks full corpus pin
- ISS-356 (M): Watch alert reason uses narrower scan
- ISS-357 (M): run-watch alert call-site wiring untested
- ISS-360-OBSFLAKE (M): obs-windows bring-up test load-flaky
- ISS-368 (H): Silent-watcher detector swallows unreadable heartbeats
- ISS-LIVE-RECORD-REPAIR-001 (M): Detached record script inherits caller pipes
- ISS-LOCKTAKE-005 (M): Join-rules lock takeover across PID namespaces
- ISS-R1ALERTS-010 (M): Alert redaction misses misspelled secret keywords
- ISS-T034FIX-001 (M): Track-end failure unverified in real browser
- ISS-T034FIX-005 (M): Failed capture raises no operator alert
- ISS-T046PAGE-001 (M): Live-now section lacks staleness bound
- ISS-T050FLOW-001 (M): Pipeline planner cycle-guard test missing
- ISS-U0-2 (H): Zoom webinar needs sign-in (human gate)
- ISS-U0-3 (M): Live-probe screenshots identical but mislabeled
- ISS-U0-8 (M): Zoom frame visibility test ignores clip-path
- ISS-U1-3 (M): TOC catch-up data-quality disclosure inaccurate
- ISS-U1-4 (M): India test series query reachability fragile
- ISS-U2FIX-1 (M): run-watch reingest orchestration lacks mocked test
- ISS-U4BHB-003 (H): Silent-watcher alert lacks Approver-gated sink
- ISS-UNOPT-003 (M): Un-opt tag separation and no-op untested
- ISS-WEBHINTS-001 (M): Join-rules page cannot send meetingUrl hints
- ISS-WEBHINTS-002 (M): Retry-After cap and timer cleanup untested
- ISS-WEBINARRELEASE-001 (H): Webinar Q&A and decisions not produced
- ISS-WEBINARRELEASE-002 (H): Webinar marked ready despite degraded extraction
- ISS-WEBINARRELEASE-013 (H): Calendar cancellation discarded, stale invite launches
- ISS-WEBINARRELEASE-014 (M): Recurring series ignores parent cancellation

## GENUINELY-OPEN: governance / hooks / process (66)

- ISS-104CC-2 (M): Worktree file reversion anomaly during check
- ISS-A035913-001 (H): Maker predicate blind to canonical Handshake field
- ISS-A035913-002 (M): Maker predicate misreads fenced PASS verdicts
- ISS-A035913-003 (H): Round cap evaded by prose-named seams
- ISS-A035913-004 (M): Census script claims verbatim parser copy
- ISS-A035913-005 (M): Shared AIOS log entry stale
- ISS-A035913-008 (C): Machine-wide Stop hook uncommitted in D:/ai_os
- ISS-A035913-011 (H): C7 audit omits sibling hooks, precommit blind
- ISS-A0CDAEE-001 (M): manifestCycle backtick false-positive class
- ISS-ALLOC-005 (M): Ledger lock spurious EPERM on contention
- ISS-C-UNRUN-WRITERS-005 (H): Precommit mutation ledger resolves wrong worktree
- ISS-054 (H): qa/.last-tick stale, maker liveness gap
- ISS-130 (H): D-019 shard adoption missing in two lanes
- ISS-134 (M): D-015 claimed more than executed
- ISS-143 (M): Lane-namespaced ids allocated in canonical ledger
- ISS-150 (M): G4 ambiguous-ref gate inverse-selective
- ISS-168 (M): D-023 result false, no superseding entry
- ISS-174 (M): Contract C3 no longer describes artifact
- ISS-178 (H): Handshake cannot tell dead from undispatched checker
- ISS-180 (H): DECISIONS deny wall bypassed by extended-length path
- ISS-184 (H): Cycle-checked regex fragile across markdown forms
- ISS-185 (M): ISS-176 fixtures authored from fix, not corpus
- ISS-189 (H): Delivery-gate hook change lacked authorizing decision
- ISS-190 (H): Enforcement hooks uncommitted in D:/ai_os tree
- ISS-191 (M): Uncommitted widening reopens contract C2
- ISS-199 (M): verdictCycle overcounts residual quoting shapes
- ISS-200 (H): Gate section describes code no longer on disk
- ISS-201 (H): Edit-in-place guard weakens qa/ drift protection
- ISS-203 (M): No contract owns vacuous-check criterion
- ISS-206 (M): C4 heading-form regression shipped deliberately
- ISS-207 (M): Third vacuous fixture in three cycles
- ISS-215 (H): Feedback-inbox maker-checker entry unfolded, gates pending
- ISS-216 (M): Four unregistered enforcement hooks, stale skill
- ISS-219 (H): Write-guard allowDirSignals weakens governed surfaces
- ISS-220 (H): Two stalls lack single root cause
- ISS-221 (H): Shared ledger counter collides across concurrent processes
- ISS-250 (H): T-007 gate only in overwrite-on-tick stamp
- ISS-257 (M): TASKS.md mojibake persists after BOM rewrite
- ISS-263 (M): AGENTS.md landed without manifest/decision coverage
- ISS-267 (H): Session-start predicate ignores FAIL verdict at cycle
- ISS-276 (M): goal.json diverges from TASKS.md semantic leg
- ISS-311 (M): 210 ledger rows lack regression_check
- ISS-308 (M): Lane node_modules junctions mix module instances
- ISS-327 (M): No owner for fixed-to-verified transition
- ISS-328 (M): u5 scheduler merged without contract file
- ISS-329 (M): u3 notify-channels merged without contract
- ISS-334 (M): CONFIG pass-2 counts DECISIONS naming a hook
- ISS-341 (M): live-record-repair lacks cited contract
- ISS-347 (M): D-020 trap restore refused by sandbox
- ISS-348 (M): Gate files lack canonical status field
- ISS-349 (M): goal.json understates shipped roadmap items
- ISS-350 (H): Handshake status written three incompatible ways
- ISS-362 (H): append_decision id allocation TOCTOU race
- ISS-363 (M): Update-Authorization names paths by pattern
- ISS-364 (M): ISS-307 hook diff split across commits
- ISS-365 (H): D-014 round cap breached a second time
- ISS-367 (H): lint:structure still red in four stages
- ISS-369 (M): Reset unit left canonical handshake stamp STALLED
- ISS-370 (M): Handshake disagreement detector collapses six values
- ISS-371 (M): loc.testPatterns lacks .test.mjs (unit BLOCKED)
- ISS-372 (C): Delivery-gate PASS certified vanished byte-state
- ISS-STAMPADOPT-001 (M): Leading-paren stamp adoption still prose-fooled
- ISS-T-033-1 (M): Mutation restore used git checkout, not D-020
- ISS-U1-2 (M): Builder edited main tree outside bound worktree
- ISS-U2-1 (M): append_decision corrupts non-ASCII characters
- ISS-U4BHB-002 (M): Duplicate ISS-360 ids, no ledger guard

## Notes

- Excluded ids (not judged): ISS-104, ISS-282, ISS-373, ISS-374, ISS-376, ISS-ALERTID-006, ISS-T036CAL-011, ISS-T037UI-001, ISS-UNOPTLOCK-002, ISS-T057SCREEN-001, plus every open row in the jobqstall, jobqlost, jobqueue, runrev, runlock, runstore, reingestsafe, t037*, jrlock, t039*, wirepre and tenantsig shards.
- A case-sensitive id grep misses slug-named verdicts (ISS-STATUSSCOPE-001 was found only on a case-insensitive pass) and shorthand references ("-002, -006" is how the ISS-T034EXT flips were found). Future audits should search both forms.
