# goal-t040-acceptance

**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 0
**Tier:** 3 — user-requested remaining roadmap task T-040.

## Authorized behavior

D-170 and root exclusive path lease authorize a new read-only authentic-transcript / grounded-content acceptance inspector and focused tests. It checks only inspected API content and explicit reviewed source-reference coverage. It never certifies provider generation, persisted work-database output, semantic correctness, long-window processing, retry preservation or real UI navigation. Full T-040 remains HOLD under checker-owned `qa/contracts/goal-T040.md` criteria 1–9.

## Candidate paths

New, no tracked base exists:
- `scripts/qa/t040-acceptance.mjs` — SHA256 `626619B2BFC7CE834116DCB5600618C549A2575F32A730891ED6739267C454D7`.
- `scripts/qa/t040-acceptance.test.mjs` — SHA256 `7C8CD020128D4D2515776E93C689CC67D9C78001C73A29EE272B84481970C505`.
- Existing direct runtime dependency `packages/index/src/pipeline/quote/quote-token-rule.ts` — SHA256 `7A0C4A523EB078D48B639197E30311350CA6886CBEA51D4149766A886C58EA49`.
- This manifest and `qa/packets/goal-t040-acceptance.md` are maker-owned QA only.

## Behavior and consumer

`auditGroundedContent` checks source tenant/session/turn uniqueness and times, extractive note/claim/Q&A text, API quote/time/speaker resolution, screen origins, unanswered state and explicit category-reference coverage. `runAcceptance` fetches the real mounted `/sessions/:id/grounded-content` using an environment-provided Bearer credential, refuses redirects and credential-bearing base URLs, and emits hashes/counts/errors without credentials or transcript text. Its result always says fullTaskStatus HOLD and lists the remaining full-task gates. Bare fixture tests do not count as live evidence.

Canonical reviewed claims may legitimately be paraphrases preserved by grounded reruns. For `verified`/`conflicting` nonextractive claims, the inspector validates citation attribution and emits `reviewed-paraphrase-semantic-check-unverified` warning rather than reporting canonical corruption. It does not certify their semantic correctness. Machine `needs-review` claims remain extractive or fail. Standing tests cover both paths.

Transport, response JSON and source/reference parse errors are sanitized so reflected bearer credentials or private response/source text cannot enter CLI diagnostics. Twelve focused tests pass as recorded below.

The direct consumer is the JSON receipt/exit code of this CLI. Existing producer/read consumer context: `apps/api/src/indexing/session.ts`, `apps/api/src/grounded-content/{reader,router}.ts`, `apps/web/src/pages/sessions/grounded/{client,GroundedContentPanel}.tsx`, and `SessionDetailPage.tsx`. No existing producer, mount, schema, database, secret or original transcript is modified.

Security flags: auth = uses an existing API credential only at explicitly selected URL; tenant = verifies supplied source scope, while the actual route derives tenant from auth; no independent authenticated key-tenant identity proof claimed by inspector. Data writes = none. Credential handling = env `LKB_ACCEPTANCE_API_KEY`; never put value in packet/receipt. Network = only operator CLI, not fixture tests. Quote boundaries reuse `packages/index/src/pipeline/quote/quote-token-rule.ts` directly with native Node 24 type stripping; the full quote/span verifier and judge remain separate production gates. Screen origin additionally checks identity/frame provenance, matching `grounded.ts runtimeOrigin` rather than trusting a marker in speech text.

## Evidence

Root-granted single-process CPU slot, released immediately after completion. Root cwd command:

```
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/qa/t040-acceptance.test.mjs
```

Exit 0; tool wall 0.7289585 seconds; Node test duration 250.8109 milliseconds. Exact summary:

```
tests 12
suites 0
pass 12
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 250.8109
```

Affected-stage auditor and immediate authenticated-transport/JSON-receipt consumption are covered by these focused tests. The transport is injected; no live network, provider, database or browser calls ran. Post-test SHA256 reread exit 0 confirmed both candidate hashes above unchanged; recorded checkpoint `2026-10-14 18:56:12 UTC`. No mutation runs performed. This unit fixes no filed ledger issue and substitutes no ledger corpus.

Required focused command: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/qa/t040-acceptance.test.mjs`.
Required frozen validator is run once by central integration for the coherent code batch: `.venv/Scripts/python.exe contracts/verify_contracts.py` (registry currently empty; vacuity must be disclosed). Reuse its attributed exact receipt; do not queue another per-lane run.

Scoped source candidate is ready for independent checking; broad shared validator receipt remains centrally pending and full T-040 remains HOLD. Independent checker: `/root/goal_attachment_reader/checker_t040`, verdict path `qa/verdicts/goal-t040-acceptance.md`.

## Resume receipt

After roadmap delivery, root reauthorized scoped source integration and verification. Read-only fresh hashes of both candidate files and the pure quote-boundary dependency match the preserved candidate above. Source code did not change; cycle remains 0. The prior 12/12 maker test receipt remains attributed historical evidence, not a reused CPU grant. Independent checker has freshly pinned its owned probe and requeued final standing/probe verification with sole CPU broker `/root/docker_checker`, after the central dependency installation and T-051 check. No resumed tests, provider calls, live browser, real database access, deployment or publication executed by this maker.

## Scoped close-out

Matching independent verdict `qa/verdicts/goal-t040-acceptance.md`: `VERDICT: PASS`, `Cycle checked: 0`, SHA256 `10A2803E1CDB79B4C6891BCD18E51E3600FF0BB08EB84A84BD91313F6E10B30E`. Maker reread that verdict and all three source/dependency hashes unchanged before closing this handshake. Central execution receipts establish standing 12/12 plus checker-owned corrected 10/10, exit 0; initial failed probe and its reversed authentic timestamp diagnosis remain preserved. Frozen validator exit 0 is explicitly attributed PASS by vacuity, not stage proof. Details and exact commands/times are in the verdict and referenced immutable receipts.

This close-out applies only to the read-only inspector. Full T-040 remains HOLD. The separate actual-product composition unit is BUILDING and has no PASS or fresh nine-case execution evidence yet. No source, original transcript or inspector READY packet bytes changed during close-out.
