# Checker packet: t040-grounded-content-consumer

Root: `C:\Users\product\Desktop\KnowledgeBase`. Maker skill `skills/maker/SKILL.md`; independent checker `skills/checker/SKILL.md`. Manifest `qa/manifests/t040-grounded-content-consumer.md`, Fix cycle 0. Verdict path `qa/verdicts/t040-grounded-content-consumer.md`, Cycle checked 0. No maker-written contract or verdict.

Authorization/scope/security/contracts are recorded in manifest. Unit proves a read-only grounded-content projection and UI consumer, not full T-040/live extraction. New files had no base; initial HEAD `4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd`. No shared mounts, producer, schema or DB writes are part of the candidate.

## Change map and consumers

- `reader.ts` first validates tenant before `read.getSessionDetail`, refuses foreign session identity, filters turns to matching tenant/session, resolves only exact nonempty substrings. Timestamps/speaker are null unless resolved. CitedItem/QaEntry/core claim types come from existing generated schema types. Projection exposes selected fields rather than arbitrary raw extras; Q&A unanswered forces null answer and empty answerEvidence.
- Mongo wrapper uses existing `scopedCollection`, tenant-scoping all four reads. Session must exist before dependent reads. Existing integration option: `createGroundedContentDeps(deps.brain)`, whose existing production `getSessionDetail` in store.ts performs tenant-bound reads. No new production DB dependency required.
- `router.ts` consumes `GroundedContentDeps`; requires existing sessions scope and authenticating tenant. Client query/header tenant never changes resolution. Parent must mount after requireAuth.
- `client.ts` uses existing `apiFetch` and encodes sessionId. `GroundedContentPanel.tsx` consumes its DTO, labels speech/screen/visual origins, unverified notes/Q&A and claim review states, and uses existing `/sessions/:id#turn-:turnId` navigation. Unresolved references get explicit unavailable text with no link. Responses cannot replace state after key/session changes.
- New Vitest component suite is a standing CI suite. Same-process probe exercises actual production component/client under shared safe local runtime; it is not Vitest execution. No browser screenshots or live-provider data.

## Candidate SHA256

| File | SHA256 |
|---|---|
| apps/api/src/grounded-content/reader.ts | C4870A5BEE2E7C5ABA324C670EEDFD0846276DCF0373141A411C98EF9979F386 |
| apps/api/src/grounded-content/router.ts | 9E1AF29FCBECF4757A52BC151FE6D3278D73C73BEE05FCB07A2487CD444D43DC |
| apps/api/src/grounded-content/reader.test.ts | AA635FE4CBB9AED5FEBEE5B713F566C407D4DE48268771D3E830FD76E9A9A486 |
| apps/web/src/pages/sessions/grounded/client.ts | C9E34AB9BC854B6065A072B4ECA74EAE98E68958683AC05500CC3CD7A76BE605 |
| apps/web/src/pages/sessions/grounded/GroundedContentPanel.tsx | 6D12D70AA99AE82FCF841AC5CBD4BCB1B80EA9CB1AE3EBF8AA94B9271C761E0F |
| apps/web/src/pages/sessions/grounded/GroundedContentPanel.test.tsx | E52F8E8A5BA5D4E42F3B8DC583A1662FDF70ACED767CCA6813D64A9019F60F3C |
| qa/evidence/t040-grounded-content/ui-smoke.test.mjs | F4F333BC376F58DD11FD1F6FA6C2F5FB74D4CFCB5A0DFB30765A8A33EEEAADAE |

## Commands and actual results

All commands root cwd, serial, no mutation tests, no browser, providers or live Mongo. No escalated execution requested. Node executable available at `C:\Program Files\nodejs\node.exe`. Root safe runtime prerequisite files `.cache/coordination/safe-test-runtime/{register.mjs,register-react.mjs,react-harness.mjs}` exist; Vitest subprocess EPERM is known in this environment. Coordinate reruns with runtime_inventory.

```text
node --import ./.cache/coordination/safe-test-runtime/register.mjs --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 apps/api/src/grounded-content/reader.test.ts
exit 0; duration_ms 1270.9325
✔ projection resolves exact quotes/times and preserves review states, with no raw extras
✔ missing and fabricated evidence is visibly unresolved, never borrowed from other session or tenant
✔ foreign session is refused and foreign pages/claims are excluded
✔ invalid tenant cannot reach even an injected read dependency
✔ legacy page has empty grounded collections; unanswered cannot leak stale answer
✔ Mongo reads all include authenticated tenant, and unknown session avoids dependent reads
✔ HTTP route requires auth and sessions scope, ignores client tenant, and returns real 404
tests 7; pass 7; fail 0; cancelled 0; skipped 0; todo 0

node --import ./.cache/coordination/safe-test-runtime/register-react.mjs --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 qa/evidence/t040-grounded-content/ui-smoke.test.mjs
exit 0; duration_ms 1716.3307
✔ real grounded component and client: literal evidence, uncertainty, tenant-session changes and failure
tests 1; pass 1; fail 0; cancelled 0; skipped 0; todo 0
React Router emitted its existing v7 future-flag warnings, no test failure.

.venv/Scripts/python.exe contracts/verify_contracts.py
exit 0; wall 0.6146096s
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity

node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json
exit 0; no output; wall 6.7967113s (integrated main tree, after type-only HTTP-test correction)
```

Open acceptance: independent checker verdict; web typecheck/server/page glue; normal CI Vitest when supported; D-024 live browser evidence; actual grounded provider+work-DB indexing+Ask proof. Parent task stays open. No issue repair corpus substituted; no mutation runs performed.

Post-run type-only correction: integrated API typecheck identified `Response.json()` inferred unknown in the new HTTP test. Added a `GroundedContent` type assertion and nonnull indexed reads, with no production/behavior change. API receipt above was executed at prior test hash `B136D57A45869EAC2BE9DA9CE8487AE2D39A159D80C95CCB85480E1E3ACC5BE1`; the current test hash is listed above. Checker should rerun current test; subsequent global API typecheck passed. Production/UI files remain unchanged.
