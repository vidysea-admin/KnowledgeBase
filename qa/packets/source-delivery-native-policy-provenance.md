# Packet — source-delivery-native-policy-provenance

Status: building
Fix cycle: 0
Manifest: qa/manifests/source-delivery-native-policy-provenance.md
Root: C:/Users/product/Desktop/KnowledgeBase
Base: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a. Candidate is uncommitted; both changed files existed at base. No untracked application files belong to this repair.

## Exact identity

| Path | Before/base pin | Candidate SHA256 |
| --- | --- | --- |
| packages/ask/src/answer-policy.ts | Base Git blob a735faf23e9abb3887df3ffd1991193b5abf537e; actual original DOC4 receipt before SHA256107a3450c34f3e67b85a4304d376c7dbfaedb12d4b97c688a2518efcce435dd4 | 48526DC7BB0367BE5FAC6E9C2AB979AFD4411A6CF4764B442097D1AADCDE64D2 |
| packages/ask/src/answer-policy.test.ts | Base Git blob c215d70fe6b2fb4f1dc6e94ca9db6a127ffb273b; pre-edit working-tree SHA256 unknown (direct test absent from DOC4 dependency inventory) | 666B0963887A32B7B2AFAE1A661EE3DE002702F2139A9A6E75C598B8B70F2DF6 |

Git blob pins identify exact base bytes; they are not represented as SHA256 working-tree receipts. No absent before-hash was fabricated.

## Contract, failure and change

Loaded skills/maker/SKILL.md. Ground truth: ARCHITECTURE H3/tenancy; qa/contracts/goal-t008.md C1/C4/C5/C8 and vectorless amendment; existing answer-policy contracts and actual verifier freshness. No contract/enforcement/schema/default-policy changes.

Original unchanged receipt qa/goal-vectorless-2026-10-15/verification-native-doc-four-current.json SHA256F2AE70BB0A86CD4AB7E8FC293DB5ED6F672A1867FCC2DFCAFB6F8C229B683613, plus sibling stdout/stderr: 2026-10-15T11:08:10.968Z–11:08:16.894Z, exit1,5922.6741ms,3PASS1FAIL,396 pins unchanged. Original command from apps/api: bundled node --import tsx --test --test-concurrency=1 --test-timeout=30000 src/native-evidence/vertical.test.ts; outer45000ms. Only policy test failed at line281: expected allowed, actual review. Earlier three native journeys passed. PDF standardFontDataUrl warnings remain disclosed.

Independent static cause: simulateAnswerPolicy previously required evidence.sessionRef for every internal source, returning review/missing-provenance for native evidence. answer-workflow published() uses stale for failed current verification. The fixture already uses the actual current native resolver; fake sessionRef, weakened policy, forged consent and automatic approval are not repairs.

The private internalProvenance helper now evaluates each source independently. It reuses validNativeSourceLocator and verifies exact native quote envelope, literal UTF8 digest/UTF16 length, origin/kind and node/source/revision bindings, unique IDs and no native sessionRef/audio hybrid. Ordinary transcript sessionRef behavior remains. One answer can combine separate native document/message/transcript sources. Existing web, coverage and tenant decisions are untouched. This is shape/provenance compatibility; actual API createMongoEvidenceVerifier still revalidates canonical tenant/head/visibility via the shared resolver before current/cached release.

Four new direct tests cover document/message provenance,16 malformed/within-source hybrid attacks, three distinct source types together, and unchanged coverage/web/tenant gates;9 standing tests retained,13 total. Immediate consumers: apps/api/src/answer-policy/evaluate.ts → answer-workflow.ts execute/published/history/get; actual verifier is answer-evidence.ts with frozen native helper. No changes to those files or vertical fixture in this repair.

## Broker-only checks and boundaries

No local tests/build/provider/DB/browser launched. After interpreter/import containment and writable-temp preflight, sole broker runs:

1. Root cwd; outer30000ms: bundled node --import tsx --test --test-concurrency=1 --test-timeout=10000 packages/ask/src/answer-policy.test.ts apps/api/src/answer-policy/native-answer-evidence.test.ts — expected20 cases (policy13 + immediate actual verifier7).
2. apps/api cwd; outer45000ms: bundled node --import tsx --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern "^native policy vertical:" src/native-evidence/vertical.test.ts — execute only originally failed policy case; other three are unselected, not newly credited passes. Preserve original failure receipt.

Fresh same-byte API/Ask/core compilation and applicable frozen/schema/structure/integration checks remain coordinator-owned. Focused runtime proof, independent checker verdict and parent real Mongo/provider/browser/human gates remain open. Maker active time/tokens/cost and precise phase metrics unknown; no measured efficiency claim. This is building, not ready-for-check or PASS.
