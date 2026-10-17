# Checker packet — goal-t040-acceptance, cycle 0

Repository: `C:\Users\product\Desktop\KnowledgeBase`. Portable checker workflow: `skills/checker/SKILL.md`.
Manifest: `qa/manifests/goal-t040-acceptance.md`. Ground truth: `qa/contracts/goal-T040.md`, particularly 2/3/5/9, while all live/semantic/persistence gates remain unverified.
Scope: a read-only inspector for actual authenticated grounded-content responses and authentic source/reference files; its scoped tooling verdict does not close T-040.

Inspect both complete new source files named and pinned in the manifest. There is no tracked base. CLI imports Node builtins and the existing pure `quote-token-rule.ts` policy directly (Node 24 native type stripping); no full runtime hook or bundled dependency required. It does not connect to Mongo or invoke providers. `auditGroundedContent` emits a credential/content-free JSON receipt; explicit `reference` entries distinguish missing categories from merely nonempty output. Empty output fails. It checks question/answer refs separately, leaves unanswered answers empty, rejects changed facts/amounts and source attribution, and marks additional full-task gates HOLD even on scoped success.

Checker static pre-READY feedback was addressed: prefix-only screen attribution now requires screen identity, valid relative frame metadata/hash/time and marker; speech carrying a textual marker remains speech. Decimal, grouped number and unit fragment refusals reuse the production boundary allow-list. Standing tests cover these cases. No filed issue was substituted or closed.

Preserved human-reviewed (`verified`/`conflicting`) paraphrases are not treated as machine corruption: inspect their real evidence, emit a semantic-check-unverified warning, and retain full HOLD. Machine `needs-review` paraphrases are refused. The tool proves provenance and extractiveness where applicable, not correctness of an inherited human review.

Transport and JSON parse failures are sanitized, including a focused refused secret-echo probe. Current standing file has twelve focused tests.

Focused affected-stage/downstream command (plain Node only):
```
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/qa/t040-acceptance.test.mjs
```
The HTTP mock in this focused test verifies the exported CLI transport seam, encoded endpoint, Bearer use, redirect refusal and receipt secret absence. It is intentionally not authentic network/provider/persistence evidence. A real operator run requires authentic turns, source-reviewed reference JSON, a mounted API base URL, and `LKB_ACCEPTANCE_API_KEY` in the environment; do not fabricate those prerequisites or treat a static fixture as full acceptance.

Example operator command (requires real configured service; not yet run):
```
node scripts/qa/t040-acceptance.mjs --tenant TENANT --session SESSION --turns data/toc-migrated/SESSION/knowledge-turns.json --reference REVIEWED_REFERENCE.json --base-url http://localhost:3000/api
```
Reference schema: array of `{kind: insight|decision|action|question|answer|claim, turnId, quote}`. Its source review is a semantic human/checker responsibility; an empty list cannot establish all-category recall. Default-off grounded generation remains unchanged.

Maker execution: root-granted CPU slot, exact focused command above, exit 0, 12/12 pass, zero failures/skips, tool wall 0.7289585s and TAP duration 250.8109ms. Immediate receipt serialization/authenticated-transport seam is included in the same standing file. All network is injected/fake; no live provider, DB, API or browser evidence inferred. Slot released before packet updates. Post-test file hashes match manifest at UTC checkpoint `2026-10-14 18:56:12`. Candidate status ready-for-check, cycle 0. Inspect current candidate hashes before judging. Checker-owned verdict/evidence permitted by root; no maker edits to contracts or verdicts.

CPU slot authority is `/root/docker_checker`; request focused execution there directly. Root explicitly centralizes broad types/build and one shared frozen-contract validator receipt per coherent code batch; do not run duplicate per-lane vacuous validators. Whole-task actual model/work-DB proof is separately being prepared centrally.

Resume: source/test/dependency fresh hashes match manifest; source remains unchanged at cycle 0. Standing 12/12 maker results are historical unchanged-candidate evidence. Final independent standing/probe tests are requeued after central dependency installation and T-051 under a new broker grant; all older grants expired. Current execution restrictions prohibit providers, live browser, real DB, full suites, deployment and publication. Full model/persistence/UI proofs therefore remain future acceptance gates, not current execution permission.
