# Verdict: iss390-packet-crlf-drift (Mode A, cycle 0)

Date: 2026-10-26. Bound to D:/KnowledgeBase. Base 0573214e, head f17cfda6 (code commit c89d7268), branch docs/devops-golive-2026-10-26.
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Contract/source: ledger row ISS-390 (qa/issues.jsonl), recorded reproduction used as the floor (D-015). Dual check: no (tier L config, no security trigger).

## Check plan
Tier L (config: .gitattributes; plus 2 appended tests). One checker, no dual. Instruments: (1) run the real `loadBundle` pin chain in the bound tree and in throwaway sparse clones; (2) clones at head and at base under core.autocrlf=true and false; (3) one falsification per criterion in copies; (4) 4c diff-scope read; (5) confirm the two builder-reported reds. No full suite. Clones live under the scratchpad (c390/), outside the repo. The clones lack the pnpm workspace, so the harness runs a byte-identical copy of `extraction-review.mjs` with only the `loadManifest` import stubbed (the pin checks in `loadBundle` are untouched).

## Evidence (all produced in this check)
- 4c diff scope: `git diff 0573214e..f17cfda6 --stat` = .gitattributes (+59), scripts/eval/extraction-review.test.mjs (+23/-1: two imports, two tests), the manifest. `scripts/eval/extraction-review.mjs` and everything under data/eval are not in the diff (`git diff --stat` on them empty): the pin at extraction-review.mjs:25 (`requireThat(sha(packetBytes) === index.sourcePacket.sha256, 'packet-drift')`) and every pin value (index.json, batch-NN.json, packet) are unchanged. Nothing removed or renamed. No file outside "What changed".
- C1 loadBundle on this checkout (bound tree, autocrlf=true): harness `loadBundle OK entries 72`. `git ls-files --eol`: packet `i/lf w/lf attr/text eol=lf`; batches and 46 toc-migrated claims/turns `w/crlf attr/text eol=crlf`; `git diff --stat -- data` empty (EOL-only, no content change). Bound tree `node --test --import tsx --test-name-pattern=ISS-390 scripts/eval/extraction-review.test.mjs`: tests 2, pass 2, fail 0.
- C2 both settings (fresh sparse clones, own checkout): head f17cfda6 autocrlf=true -> OK 72; autocrlf=false -> OK 72. Base 0573214e autocrlf=true -> `packet-drift` (the ISS-390 failure); autocrlf=false -> `batch-drift` (so no single setting worked before). Every pinned file read by `loadBundle` (packet, 8 batches, 46 toc-migrated files) matches under both settings.
- C3 pin not loosened: in a copy of head, packet converted to CRLF -> `packet-drift` (green before the edit, red after). The unit's own test 2 does the same through the real function.
- Falsification, one copy per rule class, each green before / red after (evidence: scratchpad c390/s-*): remove the batch-01 `eol=crlf` rule, autocrlf=false, re-materialise -> `batch-drift`; remove the packet `eol=lf` rule, autocrlf=true -> `packet-drift`; remove the in-focus-4 turns rule, autocrlf=false -> `source-drift`. Each assertion that fired is the pin check for that file kind, not a parse or import failure.
- D-015: ISS-390 recorded reproductions: (a) extraction-review.test.mjs fails with `packet-drift` at import on base, now loads (12 of 13 pass, both ISS-390 tests pass); (b) extraction-stage-receipts.test.mjs test 1 no longer throws `packet-drift` (it now fails on an inventory count, below). 2/2 recorded packet-drift reproductions cleared.
- Builder-reported reds, run here at head: extraction-review.test.mjs "real immediate extraction consumer..." fails at line 77:58 (`stageGaps` has no unavailable raw stage; the test starts at line 71, builder cited 75); extraction-stage-receipts.test.mjs "real bound source inventory..." has actual `undeclaredDirectories: 0`, expected 2. Both are assertions on stage availability and on-disk directory counts, not on byte pins, and both now get past `loadBundle`. The unit changes no file those tests read except line-ending attributes. On base they are red at the packet-drift throw (harness base-true reproduced it), so they are not this unit's FAIL. Not re-run on a base copy with repaired EOL (not needed: the failing assertions do not read pinned bytes). Filed as ISS-400 (low).

## Finding that does not fail the unit
Under core.autocrlf=false the bundle still does not fully load: `bridge()` (and extraction-stage-receipts) throws `corpus-drift` because `data/eval/extraction-corpus.json` is pinned as its CRLF form (17709 bytes) and has no eol rule (nor does index.json). Repro: fresh head clone, autocrlf=false, `loadBundle` OK then `bridge(bundle, pendingExport(bundle))` -> `corpus-drift`; autocrlf=true passes the corpus check. Not a regression (base was already red under both settings), and the recorded ISS-390 reproduction and the manifest's C1 (loadBundle) are met, so this is a new medium row, ISS-399, not a fix cycle. The manifest sentence "every pinned file now gets the pinned EOL regardless of core.autocrlf" holds for the 55 files listed, not for the corpus; the maker should not tell anyone the bundle is platform-independent until ISS-399 closes.

VERDICT: PASS
SCOREBOARD: 1/1 criteria met (C1), 0/0 invariants
TIER: L (config: .gitattributes; no security/auth/tenancy/prod-write trigger, so one checker)
FAILURES: none
CAPABILITY-COVERAGE: 1/1 rows reproduced (falsification red-before/green-after under both autocrlf settings; test 2 is the guard)
LIVE-BROWSER: not-applicable (.gitattributes + test only)
ISSUES-WRITTEN: ISS-399 (medium), ISS-400 (low); ISS-390 open -> fixed
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: loadBundle accepts the pinned bundle in this checkout and in fresh clones under both core.autocrlf settings, the pin line and every pin value are unchanged, and a CRLF packet is still refused as packet-drift. The two builder-reported reds are unrelated data-count assertions. The corpus pin is not covered by the new rules (ISS-399).
Metrics: start=2026-10-26T18:02:00Z end=2026-10-26T18:42:00Z wall_min=40 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2400 mutants=0 defects_unit=0 defects_6c=0
