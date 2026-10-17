# Manifest — t052-registration-child-lifecycle

**Goal task:** T-052
**Issue:** ISS-379 (HIGH data-write; original seven unsafe cases retained in canonical ledger)
**Tier:** 2 — newly reproduced registration lifecycle safety finding; external-write/owned-process boundary, uncapped.
**Fix cycle:** 1
**Handshake status:** checked-PASS
**Status:** checked-PASS
**Contract:** qa/contracts/gmail-meeting-candidates-approval.md Amendment 5, CL1–CL4 and CLI1.
**Packet:** qa/packets/t052-registration-child-lifecycle.md
**Authorization:** Root GO MAIN exclusive browser-joiner.ts and joiners.test.ts; user approved remaining-work implementation. No Python/capture/record changes, git commit, task closure or external execution.

## Behavior and reproduction

The Python main emits registration-result before browser context teardown. Previously the Node close handler ignored exit code/signal/fatal/duplicate result events and accepted earlier submitted stdout. Controlled child reproductions prove seven unsafe cases against the original code, with a clean positive control.

Only clean successful child termination, exactly one valid result and no fatal event now settles literally. Failed or invalid protocol enters existing bounded exact-profile cleanup and resolves sanitized uncertain; cleanup failure overrides with owned_cleanup_failed. Clean unique uncertain/action_required remain supported. No registration confirmation or scheduling permission is added.

## Evidence

- Original focused command initially refused before tests: default-sandbox spawn EPERM, exit1, 15.9897ms. Same command required approved escalation.
- Approved original focused command: `node --test --import tsx --test-concurrency=1 --test-timeout=15000 --test-name-pattern='registration child lifecycle' packages/meeting-bot/src/joiners/joiners.test.ts` exit1, duration1914.9644ms, tests9/pass1/fail8/skip0. Clean subcase passed; nonzero/signal/fatal/duplicate/malformed/missing/cleanup-fails subcases failed; parent test accounts for eighth failure.
- Same approved focused command after repair: exit0, duration2012.4187ms, tests9/pass9/fail0/skip0. ISS-379: original unsafe7/7 now handled, clean1/1 retained. The canonical issue writer subsequently filed this exact corpus as ISS-379; original raw stdout remains in tool transcript only. This is not a substituted ISS-373/374 corpus.
- Approved downstream command: `node --test --import tsx --test-concurrency=1 --test-timeout=15000 --test-name-pattern='registration saves submitting|registration persistence rejection' scripts/webinar/run-pipeline.test.mjs` exit0, duration3115.2039ms, tests2/pass2/fail0/skip0. Four result branches plus interrupted restart preserve no-resubmit; rejected persistence prevents execution.
- Attributed integration verifier: `./.venv/Scripts/python.exe contracts/verify_contracts.py --repo-root C:/Users/product/Desktop/KnowledgeBase` exit0,0.133968s. Receipt/stdout: qa/evidence/execution-wave1-integration-validator.{receipt.json,stdout.txt}; explicitly PASS by vacuity/no frozen contracts.
- Owned nonblank counts: browser-joiner156/300; joiners.test152/400. No broad structure or whole-task health claim. The integration bot typecheck receipt predates this source patch; final-source typechecking remains for integrated verification, not claimed here.

## Frozen candidate

- browser-joiner.ts SHA256 `9DA7B3B23C30D3F8CF1CCE400C448517014F2DF2C3BECB34963AE71D3DB19F8D`
- joiners.test.ts SHA256 `9B0DFA6FD29B8C0539A1F4D68DE25503437BD949604EAA4D3C7FAE25A26362C7`
- Contract SHA256 `6ED2B9F05CB5FE41BCF0C49E68AB0E240C0A01D43A43BE72BA86150EBA480909`

## Remaining gates

Independent cycle1 PASS: qa/verdicts/t052-registration-child-lifecycle.md, checked final source/test pins unchanged. Checker independently replayed ISS-3797/7 unsafe cases plus clean1/1 (Node9/9) and a separate16/16 controlled-child corpus. Actual verdict SHA256C9B026BFE73902EFEBE72221B916ACE991C242946057B7DB2CEFC924AED39646; READY-to-verdict743.808s, including resource queue/framework setup corrections. Full T-052 remains in progress: organizer configuration/live registration and mail confirmation, actual persistent database/capture/index/Ask, custom-JS form coverage, deployed restart and Ubuntu proof remain separate. No browser, provider, database or production action performed by this unit.
