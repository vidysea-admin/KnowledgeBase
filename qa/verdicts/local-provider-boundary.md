# Local provider boundary — independent checker

VERDICT: PASS (scoped native transport and provider boundary)
Cycle checked: 0
ISSUES-WRITTEN: none

Reviewed all six affected source/test files, actual adapter/transport callers, AGENTS definition of done and ai-provider-seam C2/C7/C9/I1-I4. Source remains runtime-only: routing, schemas/generated types, frozen architecture/contracts and enforcement are unchanged. Concurrent calendar changes remain excluded.

Independent final boundary command: Node24 --test --import tsx packages/ai/src/providers/claude-code-boundary.test.ts packages/ai/src/providers/ollama-boundary.test.ts apps/api/src/ai-transport.test.ts. Exit0;22/22 PASS; zero failures/skips/cancellations;7330.0229ms. Independently verified native Unicode/literal stdin, byte limits before spawn, stdout/stderr overflow, deadline and descendant cleanup, safe error responses, child credential/retry-watchdog exclusion, isolation argv and finite/equal-width nontruncating one-thread embeddings.

Two additional owned native-process probes: combined stdout60+stderr60 exceeded the100-byte cap even though each stream fit (PASS,3668ms); exited parent with descendant/inherited pipes resolvedexit0 in454ms with owned descendant absent before the800ms deadline. The latter did not reproduce an orphan on this Windows machine; it is not a portability guarantee for every native CLI/platform. Checker cleaned only its owned fixtures. Initial non-escalated probe failed spawnEPERM and is not behavioral evidence.

Fresh Python312 contracts/verify_contracts.py exit0,1.7037sec, explicitly PASS by vacuity (no frozen contracts). Affected source diff check exit0. Reused attributed final maker stage46/46, existing adapter consumer24 within46 and AI/API typechecks exit0 on unchanged hashes. No repeated network inference was needed.

Reviewed attributed real proof artifacts: one authorized existing-OAuth public 'KB_OK' prompt,9925ms,input2/output7,reported cost metric0.006942USD; actual isolated local document/query embeddings each2 finite/nonzero768-dimensional vectors, thread1 and truncatefalse, with official manifest/blob verification. These prove availability, not corpus retrieval, Ask grounding, human semantic gold, whole-feature/full-repository acceptance or new paid-batch authorization. Known managed policy locations were absent in maker's presence-only preflight; future policies still apply and are not bypassed.

Closeout allowed for this bounded unit. API reload, missing-Gemini-credential guard, real corpus import/indexing, bounded source-hydrating Ask, vector retrieval and full R1/R2/R3 remain separate. Exact final hashes/results are in qa/evidence/local-provider-boundary-checker-2026-10-09.json.

Timing: completion measured2026-10-09T10:16:15Z. Launch timestamp was not recorded before preliminary source/plan scrutiny; total launch-to-verdict is unknown. This is not claimed as a2–3minute check.
