# Checker packet: t058-evidence-builder

Candidate cycle: 0. State: READY; implementation/test hashes frozen below.
Root: `C:\Users\product\Desktop\KnowledgeBase`.
Maker skill: `skills/maker/SKILL.md`; checker skill: `skills/checker/SKILL.md`.
Manifest: `qa/manifests/t058-evidence-builder.md`; checker verdict: `qa/verdicts/t058-evidence-builder.md`.

## Scope and boundaries

T-058 bounded evidence-output foundation, authorized by root GO; priority tier 3. Full T-058 remains dependent on T-056, AI synthesis, user-facing integration and independent product acceptance. T-059 untouched.

Pure `buildEvidenceOutput` consumes auth-derived tenant, explicit authorized session IDs, selected claim IDs and supplied Claims/Turns. It produces literal cited excerpts and editable Markdown for FAQ/report/meeting-preparation. It does not emit interpreted claim text as established facts, infer identities, make model/network calls or persist data.

Security: tenancy/read disclosure, full independent ceremony. Mixed-tenant supplied rows refuse the whole request with fixed error text. Every selected evidence item must resolve the authorized session and turn; quoted substrings must occur literally; all evidence must resolve before emitting any part of a claim. Duplicate claim/turn IDs are excluded wholesale. Unverified/conflicting/missing/unusable claims produce structured withheld reasons and explicit unavailable/partial coverage.

Checker-owned `qa/contracts/t058-evidence-builder.md` clauses 1–8 define this bounded seam, derived from the authorized brief and existing ground truth. Maker read it and changed no `qa/contracts/`. Applicable ground truth: ARCHITECTURE H3 and tenancy; generated Claims and Turns; existing session anchor behavior. No filed-issue reproduction corpus or previous seam PASS exists. Clause map: pure/no mutation (1), whole-input tenant refusal (2), status/duplicate refusal (3), source/quote integrity (4), attribution/ranges/units (5), truthful draft/coverage (6), escaped real anchors (7), focused/real-sample/validator evidence (8).

## Exact change and consumer map

All four candidate files are newly created/untracked; no prior base existed. Base main commit `4f449b27`.

- `packages/core/src/knowledge-outputs/evidence-builder.ts`: local request/result types, `validId` rejects unusable identities; `unique` refuses all duplicate-ID rows; `excerpt` enforces source identity/session/quote/timing; `buildEvidenceOutput` validates scope and composes literal escaped Markdown with genuine session/turn anchors.
- `packages/core/src/knowledge-outputs/evidence-builder.test.ts`: 16 scoped behavioral/security tests, including real TOC rows. Test fixtures deliberately label verified claims but contain an unsupported claim interpretation, asserting that interpretation never becomes output.
- This packet and matching manifest only; no shared root export, route, schema or provider files changed.

Read-only dependencies: `packages/core/src/generated/claims.ts` and `turns.ts`. Source consumers: `apps/web/src/App.tsx:40` mounts `/sessions/:id`; `SessionDetailPage.tsx:93-94` decodes `#turn-` IDs; lines109-114 scroll/seek the actual cited turn. Our URL uses encoded actual session/turn IDs. Document/URL offsets are labelled characters, matching that consumer's conventions. Audio source ranges remain seconds. No new standalone caller/UI wiring is claimed.

Complete changed logic resides in the two short source files; the independent checker may directly load them without a repository-wide survey.

## Verification commands and prerequisites

Existing Node24 and TypeScript; no pnpm/network/install/service/browser/credentials needed. The coordinator's same-process TypeScript loader avoids restricted Node/esbuild child-process creation observed in other lanes. No failed child-process launch occurred in this lane. Commands use default sandbox and are explicitly serialized by `/root/runtime_inventory` grants. Checker's probes must request their own slot.

1. `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/core/src/knowledge-outputs/evidence-builder.test.ts` — exit0,16/16 PASS,1.2705117s, affected builder and immediate structured/Markdown/anchor consumer assertions. First run15/16 exposed test-only expectation that static parentheses would be escaped; corrected its string expectation, rerun16/16.
2. `node node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --target es2023 --module nodenext --moduleResolution nodenext --esModuleInterop --skipLibCheck --types node packages/core/src/knowledge-outputs/evidence-builder.test.ts` — exit0, no output, 1.7111071s. Same final implementation; test subsequently changed only one string assertion.
3. `python contracts/verify_contracts.py` — exit0,0.8430999s; exact output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Registry has no frozen stages; success is vacuous regarding this behavior.

Actual sample: `data/toc-migrated/2026-08-27-in-focus-4/claims.json` and `turns.json` are read only. All three claims are needs-review; expected output unavailable with 3 withheld, no factual invention; bytes checked unchanged. Synthetic verified fixtures exercise successful literal output and all refusal boundaries.

No mutation tests performed by maker. If checker uses mutation, honor mandatory timeout, byte backup, unconditional restoration and byte comparison; do not mutate unrelated active lanes.

## Candidate source SHA-256 pins

- evidence-builder.ts: `A2E344390C8DA421076FD9869F69CC9B440BACC265C50DA3611465DD46ECA291`
- evidence-builder.test.ts: `FA002FF46E5D055FD88A06EF63FDBE8556CDA99837DD2339919E4CFDC02A8123`

Recheck pins and current cycle before verdict. Both manifest fields say ready-for-check and receipts are filled. Checker owns verdict/contract/probe only; maker owns implementation/tests/manifest/packet. No git operations, global ledger or trackers.
