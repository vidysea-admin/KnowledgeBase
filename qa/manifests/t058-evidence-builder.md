# t058-evidence-builder

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 0
Priority tier: 3 — authorized bounded T-058 roadmap foundation; whole task remains open.
Security class: tenancy/read disclosure; pure computation, no runtime data writes.

## Authorized scope

Root GO: additive exclusive `packages/core/src/knowledge-outputs/**` plus this manifest/packet. Implement a literal evidence-linked editable output builder with tenant/source fences. No LLM, schema, router, shared index, governance, staging or commit changes.

`buildEvidenceOutput` returns typed evidence sections, withheld reasons, readiness and editable Markdown for FAQ/report/meeting-preparation drafts. It renders literal source excerpts, never the claim's potentially unsupported interpretation. Verified claim status selects evidence; it does not prove an inferred answer. Tenant is supplied by an authenticated caller, which is not implemented here.

Independent checker authored `qa/contracts/t058-evidence-builder.md`, clauses 1–8, from this authorized brief and existing ground truth. Maker does not create/edit `qa/contracts/`. Relevant existing rules: ARCHITECTURE H3 attribution and tenant scoping; generated Claims/Turns schemas; supported web session/turn anchors. Prior PASSes on this new seam: zero. No filed issue-fix corpus.

## Changed paths

- `packages/core/src/knowledge-outputs/evidence-builder.ts` — pure builder and local input/output types.
- `packages/core/src/knowledge-outputs/evidence-builder.test.ts` — focused behavior/security tests plus actual TOC sample read-only consumption.
- `qa/manifests/t058-evidence-builder.md` — this handshake.
- `qa/packets/t058-evidence-builder.md` — frozen checker packet, prepared after verification.

Source files are new/untracked; no base existed. Repository base: `4f449b27`.

## Remaining gates

Independent checker PASS cycle0 persisted at `qa/verdicts/t058-evidence-builder.md`; implementation/test SHA pins rechecked unchanged before close-out. Independent17/17 entries include 16 source tests plus an independently derived harness,11 refusal cases, actual TOC3/3 withheld and exact existing session hash-decoder/DOM-id consumer seams. No issues written.

No API/UI integration, AI FAQ/summary synthesis, persistence, real user acceptance, export workflow or T-056 completion is claimed. T-058 and T-059 remain open. Session links target the existing `/sessions/:id#turn-<turnId>` web consumer; no browser verification occurs here.

## Evidence and frozen pins

Packet: `qa/packets/t058-evidence-builder.md`, cycle 0.

- `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/core/src/knowledge-outputs/evidence-builder.test.ts` — exit0,16/16 PASS,1.2705117s. Includes actual TOC sample and immediate structured/Markdown/anchor consumption assertions. Initial run15/16 exposed only a mistaken assertion expecting escaped static parentheses; assertion corrected, then all16 passed.
- `node node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --target es2023 --module nodenext --moduleResolution nodenext --esModuleInterop --skipLibCheck --types node packages/core/src/knowledge-outputs/evidence-builder.test.ts` — exit0,no output,1.7111071s. Implementation bytes identical to final; test subsequently changed only the parentheses string assertion.
- `python contracts/verify_contracts.py` — exit0,0.8430999s, `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`.

SHA256 implementation: `A2E344390C8DA421076FD9869F69CC9B440BACC265C50DA3611465DD46ECA291`.
SHA256 tests: `FA002FF46E5D055FD88A06EF63FDBE8556CDA99837DD2339919E4CFDC02A8123`.
