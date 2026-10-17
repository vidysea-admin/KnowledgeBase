# Existing T041 repair — execution receipt reconciliation

2026-10-15. This is maker verification evidence, not an independent checker verdict or parent closeout. No new source edit, test execution, reviewer, or unit was opened during this reconciliation.

Priority: continue the existing explicitly selected tier-3 T041 roadmap repair. qa/QUEUE.md still contains historical held/gated governance work; this instruction authorizes only existing-unit verification, not a new pull. Relevant union-of-root-issue-ledgers scan found ISS-W041-001 low/open (historical optional alignment overwrite), no T041 high/security finding; no global ledger clearance is claimed. One persisted verdict names this exact slide-knowledge.mjs seam (t041-searchable-time-aligned-ocr); this is not opening another non-security seam round or changing a verdict. Exact source2 and slide-knowledge.test.mjs extension grants remain in lease-registry.json / lease-grants-20261015-current.md. Current central integration freeze file explicitly says historical pins superseded and is not a whole-repository freeze; no broad tests are authorized by this note.

## Genuine broker execution

- Receipt: qa/goal-vectorless-2026-10-15/verification-capture-ocr-watcher-focused.json; SHA256 88A81D110B7F0A1E0C4B06827D35C1116299AD3122CBE924DEFAE90CE0F22179.
- Stdout/stderr: same prefix .stdout.txt / .stderr.txt. Actual combined OCR + watcher run exit 0, 36 tests / 36 pass / 0 fail / 0 skipped, 2300.9339 ms elapsed; 2026-10-15T11:45:31.342Z–11:45:33.645Z. This is the batch exit/count, not an invented independent OCR-file exit.
- Command: C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test --test-concurrency=1 --test-timeout=30000 --import tsx scripts/webinar/slides/slide-knowledge.test.mjs scripts/watch/lib/ingest-chain.test.mjs
- Actual receipt outer timeoutMs is 60000, Node per-test timeout is 30000. The earlier request was 30 seconds outer; execution evidence must retain this distinction.
- Runtime v24.19.0 executable SHA256 3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237; environment hash 1f6b045ea8ea78388b899ea4c9e324c4cb6e81929b685d030acc40df41e48bac; lock 2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd. Receipt reports 460 stable before/after pins; candidate identity faeadfeb1c8ceaecf687663a964cd2af997785c1a6986e19f8cc431d247cabd8 is an ordered-pin SHA256, not a Git commit. Base is 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a.

## Exact affected and downstream cases

Actual passed case names in stdout:

- explicit failed-observation boundaries exclude gap speech and bound trailing gaps
- exhausted frame is omitted with typed counted gaps; reuse retries it instead of hiding data loss
- A then exhausted B then A resumes original OCR after the failed interval
- actual wired stage preserves A/B/blank/A, persisted OCR spans and original speech; reader and chunker consume it
- production speaker mapper preserves OCR against a screen alias, then actual scoped hydrator returns screen/time citations
- shared ingestion refuses digest-resealed missing, foreign, duplicate and misassigned speech attachments

The actual producer persists shortened tEnd; actual loadWebinarSession attachment validation and buildScreenEvidenceTurns consume it. All media commands/providers/database reads in these cases are fakes/public synthetic fixtures. Contracts goal-T041 S2–S5 and S8 have scoped executed evidence; S9 requires retaining current applicability limitations below. Standing ISS-304/305/306/314 reproduction cases passed in the other watcher test file within the same batch; they are not T041-specific issue closures.

## Current applicability, checked without rerunning

All three frozen owned pins match the receipt and packet now:

- scripts/webinar/process-video.mjs: 64042EF0A4496487B5972A1FD13F074921C42269E588AFA144C230F6E71CB7AC
- scripts/webinar/slides/slide-knowledge.mjs: C1FA5C657FD0DDC8A93296B1EDE257A76797DBE313BBEED4ED85F8E203F3F5A2
- scripts/webinar/slides/slide-knowledge.test.mjs: 0157B42BEDFAE7A030422E6E73A7564704A0F07263A330669473FE5E185690FB

Rehashing all 460 receipt source/import pins found 459 matches and one changed immediate hydrator consumer: apps/api/src/ask/source-context.ts. Receipt pin 0ee19b5d02cb894d838c16a3723f554f464fefc6a879613ad9476a7c539bf565; current A64D64AAA1C9A07AEFD9F3A0CCAA9E8CF1BB2EABD64426E545AFDD70CA139566. Therefore the historical 36/36 execution is genuine, and unchanged producer/helper/loader cases retain their matching source identities, but the full current imported environment is not identical. Current hydrator applicability remains HOLD pending central dependency reconciliation or a separately authorized legitimate current receipt. No rerun was requested here. Current executable/environment values were not independently re-measured; the listed runtime/environment identity belongs to the receipt.

No independent verdict or contracts validator receipt is fabricated/reissued. Parent T041 remains HOLD for L1 real recording/provider OCR, L2 independent visual OCR/timing comparison, L3 authorized tenant runtime ingestion/index/search and cross-tenant refusal. No source changes, FFmpeg/media, browser, provider, network, native database, or production writes were performed during this reconciliation.

## Source-context changed dispatcher: scoped nonexecution

ROOT/coordinator identifies the intervening source-context semantic delta as mixed-source snapshot composition and public always-vectorless request dispatch. Static current callgraph confirms the OCR file imports only createSourceHydrator (slide-knowledge.test.mjs:11) and directly invokes it with `{ db }` (lines 206 and 215). It never imports or calls createSourceRequestDepsFor. Mixed transcript/native snapshot composition and public always-vectorless request creation live inside createSourceRequestDepsFor (source-context.ts:252 onward), so those dispatcher branches are imported but not executed by these OCR cases. Direct createSourceHydrator calls supply neither graphScope nor embed; they use ordinary transcript lexical spans, not graph-scoped spans, embeddings, mixed native hydration, or request dispatch. Producer → loader gap cases do not call the hydrator at all.

This supports scoped nonexecution of the centrally identified dispatcher delta, and continued applicability of the unchanged failed-boundary producer/helper/loader checks. The old-pin 36/36 receipt remains the actual run; there is still no claim that all 460 current imported bytes equal the receipt, that the changed dispatcher was tested by OCR tests, or that the whole current source epoch is green. The exact historical source-context body was not reconstructed from its hash. A current dispatcher integration verdict belongs to its central owner. No blind 36-case rerun, selected-case execution, new source edit, or reviewer is requested by this note.
