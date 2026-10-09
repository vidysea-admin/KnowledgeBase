# Bounded Ask context packing

Status: checked-PASS
Fix cycle: 1
Checker verdict: qa/verdicts/bounded-ask-context-packing.md (Cycle checked: 1; scoped PASS)
Checker verdict SHA256: f8f3e6ae168975d5c12a3b2fc28857c149347be46f228879624e44af9ccc358d
Scope: source-only lossless runtime context packing; two source files and three tests.
Tier: 3, phase-one Ask implementation under the current user's build request.
Authorization: root agent authorized exact V3 five-path adoption on 2026-10-09 after independent checker approval; this records agent coordination, not a human canonical-schema or semantic-threshold approval.

## Behavior and bounds

A validated source dictionary records each original sourceId, origin and speaker/session/turn/time tuple once. Every ordered strip retains its original id and literal text, with a zero-based integer sourceIndex that resolves back to the exact original source. Unpacking refuses null/malformed tuples, noninteger/dangling indices, duplicate IDs, conflicting identities, unknown keys and unused source entries. Answer context uses a structured object instead of JSON embedded inside JSON. Model answer sourceIds remain the original IDs.

Grounding retains explicit original stripIds and sourceIds per answer sentence. Its shared dictionary cannot allow a sentence to borrow another sentence's evidence. Every ambiguous refine strip still receives exactly one keep/drop judgment; correct verdict still skips refine/web. Public response, citations, source tuples and original corpus are unchanged.

Existing limits remain: 3500 serialized quote bytes per session; 48 KiB admitted hydration; 64 KiB per complete serialized CompletionJob; 256 KiB aggregate job input; 12 completion dispatches and at most 24 visible two-chain adapter attempts; four-minute START deadline only. In-flight transport timeout is separate. Refine remains at most three batches, each packed context at most 16 KiB. No strips or judgments are silently removed to meet those limits.

## Exact adoption

The reviewed five-target patch is work/ask-passage-packing-draft/packing-only-v3.patch SHA256 43ca0cb32ca66007ba6eedda1a40641ae4e98c632a3e802fa8df2d4f524a69e8; freeze inventory c9a7908c8060223654bd0115247e5dcddf4967a0ece08b1c482c4f8ee1c9846e. All five Desktop baselines and draft bytes were checked before byte-preserving adoption, then adopted hashes checked again. API test compatibility changes are only an unpackContext import, two fake decoder replacements and two non-null annotations. Both original Unicode fixture byte sequences and original line endings are preserved. V2 consumer evidence with corrupted Unicode is superseded, not credited.

- packages/ask/src/answer.ts: 482132ff75520f58ebce7e99ed3d15e56089da3f28a999faf46e8e675d2fabb4
- packages/ask/src/bounded-refine.ts: 8957fa3cc8a4514db13020683a6d7516031bc4c29938a4dff2fa1b8570524189
- packages/ask/src/bounded-ask.test.ts: e565bcbfd28e8ea35b96fb7dee2e382d7ffc32c60246ac91a4f03d88b1c45d45
- packages/ask/src/source-context.test.ts: 731a933b2a8909f046e490040240938f40ee0fac7b02f58a7f7f6c706f6a9ab9
- apps/api/src/ask/source-context.test.ts: d59daec3ac6f9e6fc45defba8cfab79f00873d280ed576db56cc459a0502d35f

## Executed evidence

Installed Node24, no model/network/real database actions or runtime restart.

Affected Desktop command: Node --test --test-concurrency=1 --import tsx packages/ask/src/source-context.test.ts packages/ask/src/bounded-ask.test.ts apps/api/src/ask/source-context.test.ts.
Result: exit 0, 42/42 PASS, zero failures/skips/cancellations, 3506.7407 ms. This includes actual baseline request factory/scorer, source provenance/outage guard, 29-source availability, dense packing, every refine judgment and source/citation consumer behavior.

Node node_modules/typescript/bin/tsc --noEmit -p packages/ask/tsconfig.json: exit 0, PASS, no diagnostics.
Node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json: exit 0, PASS, no diagnostics. Current foreign integration is preserved; typecheck is not that integration's independent acceptance.

Representative six-session/384-strip complete jobs: answer 44,449 bytes, grounding 60,024 bytes. All 384 strips refine in three complete jobs of 18,486 / 18,398 / 9,165 bytes. After seven previous evaluator dispatches, answer plus grounding uses nine dispatches. An indivisible Unicode job of 90,798 bytes refuses before provider invocation (zero calls). This is a representative serialization adversary, not an exact replay of natural case25, whose rejected job bytes were not retained.

Independent pre-adoption packing: 26/26 checks PASS, proof SHA256 67710c19c30f7ca2cc1162339006f504956ba1a16372e42ded695da6f98cc954; complete realistic answer 44,374 bytes / grounding 59,949 bytes, nine dispatches and 132,757 aggregate bytes after seven previous calls. Independent accepted-baseline overlay/downstream: 24/24 PASS, proof SHA256 292c79af8e153449d05e5c82784614a6dfd43b11cfc94a6482a4b530f0b22607. Repaired original-Unicode baseline API consumer: 17/17 PASS, zero skips, proof SHA256 61dcfe340a77b9003d077053348dcfceafcb6cd9c0f7a085a80175a5c8e44ac6. Final V3 five-path gate independently approved exact baseline/draft hashes and intended compatibility diff.

## Explicit exclusions and open gates

The separate hydration-selector draft is NOT adopted. Its query-only lexical fixture diagnostic remains HOLD: cases10/16/17/21 miss the target passage, cases19/29 retain literal targets, and case25 loses the grade-eight qualifier despite quoting its turn. No exact prior hybrid replay or semantic improvement is claimed. Case06's old diagnostic false negative is documented without rewriting frozen evidence.

Main Ask, natural retrieval/answer acceptance, Tavily web fallback, human gold/quality thresholds, canonical rollout, release readiness and global acceptance remain HOLD. No roadmap task counts changed. Existing main Ask manifest, original corpus, historical freezes, shared ledgers/HANDOFF, runtime helpers/pins, production.ts and unrelated integration/worker files remain untouched. API15352 was not restarted; runtime owner must reconcile current integration/source pins before later model use.

Maker requests a matching dedicated-slug Cycle1 checker verdict on adopted bytes before checked-PASS closeout. This manifest credits scoped test evidence only and does not self-issue a checker verdict.
