# Verdict — t040-grounded-content-consumer

VERDICT: PASS
Cycle checked: 0

Scope: new read-only grounded-content projection/router and actual React panel/client. Independent contract `qa/contracts/t040-grounded-content-consumer.md` C1–C7; applicable tenant-id-validity C1/C3/C4/C5/C9; canonical SessionPages CitedItem/QaEntry and Claims types. Full T-040, production mounts, integrated web typecheck, normal Vitest CI, browser/layout, provider/index/Ask and live Mongo remain separate gates.

## Timing and provenance

Resumed dispatch/first read began before first recorded checkpoint; exact launch timestamp unknown. First recorded review checkpoint: 2026-10-14T09:09:08.0796200Z. Source/contract review complete by 09:11:22.6994782Z. Runtime slot requested at approximately 09:09 (message chronology, exact timestamp unknown); waiting prevented execution until coordinator GO. GO timestamp and exact per-command start/end unknown; three serial commands executed after GO and before final hash checkpoint 09:17:30.6068545Z. Measured wall durations below; no approval wait was required. Draft/persist started after that checkpoint. Launch-to-verdict elapsed cannot be exactly measured; at least 8m22.527s to final hash checkpoint from the first recorded checkpoint. Exceeding 180s resulted primarily from the explicitly observed runtime-slot queue, with its exact duration unknown. No unmeasured interval is attributed to drafting by subtraction.

Persisted verdict reread confirmed2026-10-14T09:18:37.9743187Z; elapsed from first recorded checkpoint9m29.895s. Exact launch-to-verdict total remains unknown because the initial pre-checkpoint interval was not measured.

Maker resubmitted a type-only `reader.test.ts` fix during review, before any verdict: packet updated to AA635…9486; checker reran this exact current test. All seven final candidate hashes match current cycle-0 packet. No maker source modified by checker.

## Independent commands and results

Root cwd. Safe same-process runtime, no Vitest/esbuild subprocess, provider, browser or live Mongo. Test timeouts 30s; coordinator slot bounded 120s; all processes ended normally and slot released.

1. `node --import ./.cache/coordination/safe-test-runtime/register.mjs --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 apps/api/src/grounded-content/reader.test.ts` — exit0, wall1.771785s, TAP duration1326.7979ms; 7 tests/7 pass/0 fail/0 skipped. Resolves literal evidence/time; missing/foreign/fabricated cases unavailable; tenant exclusion; 13 hostile tenants reach zero reads; unanswered stale answer withheld; actual scopedCollection queries tenant-bound; real Express auth/scope/client-tenant-spoof/404 behavior.
2. `node --import ./.cache/coordination/safe-test-runtime/register-react.mjs --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 qa/evidence/t040-grounded-content/ui-smoke.test.mjs` — exit0, wall2.7128854s, TAP duration2206.6489ms; 1/1 pass/0 skipped. Actual component/client: Bearer header, encoded anchors, screen-origin/unverified labels, unavailable evidence without navigation, session/key changes, late completion isolation and visible503.
3. `node --import ./.cache/coordination/safe-test-runtime/register-react.mjs --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 qa/evidence/t040-grounded-content/checker-probe.mjs` — exit0, wall4.521626s, TAP duration4109.8618ms; 1/1 pass/0 skipped. Checker-authored actual `createMongoBrainReadDeps`→projection→actual React consumer, hermetic evaluating driver, both tenants and colliding row IDs; four authenticated-tenant queries, foreign sentinel absent, raw privateToken absent. Real p2 source turn `2026-10-13-zoom-webinar-p2-t-8e870d14ebc1d9edcb771d81eeaa1bbdd2fbb96732ecc8dfe9c44d2338f2e7fc`,280-character literal quote: source times retained; answered question/answer evidence separately rendered; source replacement makes old quote unavailable/null time. Auth-bypassed real router with operator-object tenant rejects before any read (0 queries). Driver methods, fetch and DOM restored in finally; no real connection made.

Aggregate independent behavioral results:9/9 pass,0 fail,0 skip. Existing React Router future-flag warnings only. Exact TAP output was returned in tool results; checker probe prints source id/quote length/filter count/invalid-read count/stale-ref result.

Attributed reused evidence: maker packet's `.venv/Scripts/python.exe contracts/verify_contracts.py`,exit0,wall0.6146096s, `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. This validator result proves no frozen stage acceptance. Maker's integrated API typecheck result is recorded in packet but is not independently reproduced here; no web typecheck claimed. Earlier maker API receipt was superseded by this checker's current test rerun.

## Source and final hashes

Direct review covers all seven new candidate files and real `store.ts` getSessionDetail, BrainReadDeps/SessionDetail, scopedCollection/tenant validator, auth/scope, shared apiFetch and existing SessionDetailPage encoded-hash decoding/turn ids. Real store returns full canonical page, retaining citedItems/qa rather than narrowing to legacy fields. Reader is read-only; copies selected fields; requires tenant/session agreement; marks quote references available only against current matching turns. Schema optional fields remain optional. UI renders source content through React text nodes; navigation encodes session/turn ids and missing refs get no link. No source blocker found.

Final hashes, checked09:17:30Z:

| File | SHA256 |
|---|---|
| apps/api/src/grounded-content/reader.ts | C4870A5BEE2E7C5ABA324C670EEDFD0846276DCF0373141A411C98EF9979F386 |
| apps/api/src/grounded-content/router.ts | 9E1AF29FCBECF4757A52BC151FE6D3278D73C73BEE05FCB07A2487CD444D43DC |
| apps/api/src/grounded-content/reader.test.ts | AA635FE4CBB9AED5FEBEE5B713F566C407D4DE48268771D3E830FD76E9A9A486 |
| apps/web/src/pages/sessions/grounded/client.ts | C9E34AB9BC854B6065A072B4ECA74EAE98E68958683AC05500CC3CD7A76BE605 |
| apps/web/src/pages/sessions/grounded/GroundedContentPanel.tsx | 6D12D70AA99AE82FCF841AC5CBD4BCB1B80EA9CB1AE3EBF8AA94B9271C761E0F |
| apps/web/src/pages/sessions/grounded/GroundedContentPanel.test.tsx | E52F8E8A5BA5D4E42F3B8DC583A1662FDF70ACED767CCA6813D64A9019F60F3C |
| qa/evidence/t040-grounded-content/ui-smoke.test.mjs | F4F333BC376F58DD11FD1F6FA6C2F5FB74D4CFCB5A0DFB30765A8A33EEEAADAE |
| qa/evidence/t040-grounded-content/checker-probe.mjs (checker-owned) | 916BF671F54BF90D01A5C80B64EC11E5CD4BF29C653143FFF2C37C02066DD7E2 |

Manifest remained ready-for-check/Fix cycle0. `git diff --check -- apps/api/src/grounded-content apps/web/src/pages/sessions/grounded` exit0; new untracked candidate content reviewed directly, not inferred from empty tracked diff.

ISSUES-WRITTEN: none

EXPLANATION: scoped PASS. Sample notes/Q&A in the checker probe were constructed from a real transcript quote to exercise consumer boundaries; they are not live extraction output. Standalone Mongo wrapper and real production BrainReadDeps path are both tested using hermetic fakes. Authenticated route/page mounts and whole-product acceptance remain with the integrator. No filed issue was being fixed, no ledger corpus substituted, no mutation runs performed.
