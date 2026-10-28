# Independent check packet — T-022 human-review intake, cycle 0

Root: C:/Users/product/Desktop/KnowledgeBase. Read skills/checker/SKILL.md.
Manifest: qa/manifests/t022-calibration-human-review.md.
Verdict: qa/verdicts/t022-calibration-human-review.md; checker writes independently.

## Scope / ground truth

Existing qa/contracts/evaluator-calibration.md Scope and Non-goals distinguish derived
proxy scores from final human calibration and forbid premature production tuning.
qa/contracts/parallel-golden-human-review.md C2/C4/C5 provide source-binding and
unreviewed-packet precedents; its six-miss count and corpus are NOT this unit's criteria.
Exact scoped contract: qa/contracts/t022-calibration-human-review.md C1–C5,
established by the independent checker. Maker never writes qa/contracts.
PASS must cover intake only, not human ratings or T-022.

## Change map and boundaries

- prepareCalibrationReview reads current golden questions, recorded matching rival rows,
  fifteen evenly spaced questions, same-tenant sessions/pages; returns deterministic
  thirty-item neutral order, three batches ten, null approvals and SHA256 source bindings.
- Production caller evidence: packages/index/src/tree/build.ts default session input
  is session.title/page.summary; apps/api/src/score.ts createLlmScorer sends only query,
  document title, document summary. New review nodes use session IDs explicitly.
- exportCalibrationReferences regenerates the entire packet and compares all immutable
  fields; requires each finite score in [0,1], Umesh approval assertion, rationale and
  date. It returns separate pairs consumable by packages/ask/src/eval/calibration.ts
  computeMAE. It does not write gold or invoke scoring.
- CLI accepts strict prepare/export options and creates only a new output file (`wx`);
  existing reviewed files cannot be overwritten. Export validates before any output write.
- Test downstream uses real computeMAE on a wholly synthetic approved fixture. No fixture
  approval is written into the real review artifact.

Security flags: no auth/credentials/network/database reads or writes. Same-tenant source
checks prevent accidental cross-tenant packets. Explicit user-selected local artifact writes
exist; full maker/checker ceremony applies. Approval assertions are not identity authentication.
No filed issue fix; no original ledger corpus claimed. No source-mutation testing performed.

## Commands / execution facts

- Affected real sample command:
  `node scripts/eval/calibration-review.mjs prepare --out data/eval/calibration-human-review.json`
  already ran successfully. Regeneration must use a NEW tmp file, since output is exclusive-create.
- Focused and immediate consumer command:
  `node --test --test-isolation=none --test-timeout=30000 scripts/eval/calibration-review.test.mjs`
  needs no environment keys and no tsx transformer; Node 24 native type stripping handles computeMAE.
- `python contracts/verify_contracts.py` remains required, but empty frozen registry
  cannot establish correctness; checker must inspect intake boundaries independently.

CPU constraints: coordinate one lightweight slot with /root/runtime_inventory;
no browser, paid-provider, media/model or broad test runs. Default Node test isolation
is known to fail subprocess creation in sandbox (`spawn EPERM`); use single-process
isolation flag. No escalated execution is pending.

## Final hashes / evidence

Final hashes, cycle 0 (all new, no tracked base; base commit in manifest):
- scripts/eval/calibration-review.mjs: B40D93A9DAEAC44FFB467A9889B26663DC1603C8903828FE7585A6468CE9A057
- scripts/eval/calibration-review.test.mjs: 7A8E3FE620FBE0CC09E62FC8CAD81D259A2FE745DB6490BDC728B53B1FC27D74
- data/eval/calibration-human-review.json: 99AB6556BC46D84F25AA30319FB7E1D27AFB67571389106049939FEBE1D43B61

Maker evidence: focused command above exit 0, 9/9 PASS, shell stopwatch 1.9310297 s
(Node duration 1778.1007 ms). Includes real sample parity and real computeMAE consumer
on synthetic approved fractional references (30 pairs, MAE=0). Frozen validator command
exit 0, 0.2186865 s, explicitly vacuous empty-registry PASS. Real prepare command exit 0,
tool command wall time 0.5506569 s, 30 pending items. Syntax check `node --check
scripts/eval/calibration-review.mjs` exit 0, tool command wall time 0.6142627 s.
Human Umesh reviews, real approved-reference live judge run and independent final
calibration remain material whole-task gates; no task tracker edit authorized here.
