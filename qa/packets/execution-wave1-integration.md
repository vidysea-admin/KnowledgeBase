# Execution wave 1 integration packet — cycle 0

Repository: C:/Users/product/Desktop/KnowledgeBase. Maker skill: skills/maker/SKILL.md. Checker skill: skills/checker/SKILL.md. Manifest: qa/manifests/execution-wave1-integration.md. Verdict: qa/verdicts/execution-wave1-integration.md.

The exact 16 maker-owned files and final SHA256 hashes are in execution-wave1-integration.hashes.json. `existedAtBase: false` records the two new files absent at base 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd; all other deltas are inspectable with `git diff -- <path>`. No base is inferred for new files.

## Change and consumer map

- T-040 shared callers added on root GO before any ready handshake: server mounts createGroundedContentRouter(createGroundedContentDeps(deps.brain)) downstream of auth; SessionDetailPage mounts GroundedContentPanel with current apiKey/session id beneath existing overview. Existing server.test.ts now proves actual mounted route consumes BrainReadDeps under authenticated tenant and refuses unauthenticated reads before any store call. SessionDetailPage.test.tsx now exercises the real panel client/endpoint without changing the existing summary. Producer's seven final files remain separately checker-owned accepted scope. No DB writes or feature flag changes. These additions invalidate prior API/web typechecks and bundle as final for this expanded scope; unchanged bot and prior independent behavior evidence may be reused.

- App.tsx imports KnowledgeDirectoryPage and AnswerPolicySimulator, mounts `/knowledge` and `/answer-policy` inside existing AuthProvider/LoginGate/AppShell. NavSidebar adds matching links. Consumers: knowledge/KnowledgeDirectoryIntegration.test.tsx; App.routes.test.tsx; answer-policy component tests.
- SearchPage imports SemanticResults and passes current authenticated apiKey and normalized submitted `urlQuery`, never the unsubmitted draft. Existing key rotation clears URL; SemanticResults resets on key/query and requires an explicit button before any provider request. Consumers: SearchPage.test.tsx, SearchPage.url.test.tsx and semantic component/integration tests.
- server.ts imports createAnswerPolicyRouter and mounts it immediately after existing Ask router, downstream of existing auth/rate-limit. Same `deps.ask` is injected. Consumer: answer-policy/routes.test.ts includes actual createServer mounted authenticated endpoint.
- schedule-tick.ts forwards `now: () => Date.parse(now)`, `readOnly: dryRun`, `onDegraded: aj?.rulesDegraded`, `onHealthy: aj?.rulesHealthy` to enforceJoinRules. tick-wiring.ts defines optional callbacks and binds trusted alertDeps to raiseRulesDegraded/clearRulesDegraded. Consumers: new schedule-tick-rules-integration.test.ts proves actual tick dryrun suppression, injected-clock fallback, successful snapshot-save recovery and failed-save nonrecovery. Existing schedule-tick.test.ts and helper suites preserve legacy behavior.
- API bot-events router accepts `rules-degraded` through its existing fixed bounded URL-stripping projection; BotActivity renders a named operational alert. Added API projection and UI rendering tests preserve secret stripping and alert visibility.
- Generator wrote only generated/whatsapp_candidates.ts and core/index.ts. Consumers: WhatsApp quarantine/store tests and generated-type drift check. No schema hand-edit by this maker.

## Ground truth and boundaries

Existing applicable contracts: qa/contracts/t037-last-valid.md clauses 6–7 and remaining scheduler integration gate; qa/contracts/t055-evidence-directory.md; qa/contracts/web-app-shell-brain-calendar.md; schema-v2.md and knowledge-base-schema.md for generated types. Answer policy and semantic maker packets define their deliberately scoped additive capability; do not infer complete T-056 or whole semantic-search acceptance.

Security flags: auth/tenant route and snapshot enforcement wiring; snapshot and alert-state data writes during real ticks. Dryrun must not write/send. Actual registration, capture, providers, Google sends, production Mongo and migrations are out of scope. Maker never edits qa/contracts or verdicts. Parent root owns central task/decision changes.

## Reproducible focused commands

From repository root, after resource coordinator permission:

`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/meeting-bot/src/calendar/schedule-tick-rules-integration.test.ts packages/meeting-bot/src/calendar/schedule-tick.test.ts apps/api/src/bot-events/router.test.ts apps/api/src/answer-policy/routes.test.ts`

From apps/web, invoke the available local Vitest executable with one worker for App.routes.test.tsx; KnowledgeDirectoryIntegration.test.tsx; SearchPage.test.tsx; SearchPage.url.test.tsx; semantic tests; BotActivity.test.tsx; answer-policy tests. Runtime inventory supplies the exact permitted executable/runner.

`node scripts/gen-types.mjs --check`

`./.venv/Scripts/python.exe contracts/verify_contracts.py --repo-root C:/Users/product/Desktop/KnowledgeBase`

Actual BotActivity rendering: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=10000 --import ./.cache/coordination/safe-test-runtime/register-react.mjs .cache/coordination/integration-bot-ui.test.tsx`.

## Current evidence

FINAL expanded evidence: independent API/web typechecks exit 0, actual production Vite bundle 1/1 PASS with five integration consumers including grounded panel; 16 pins stable before/after types and after bundle. Receipts qa/evidence/execution-wave1-integration-expanded-{api,web}-typecheck.receipt.json and execution-wave1-integration-expanded-web-build.receipt.json. Independent actual schedule tick→real sink→tenant feed→API projection→recovery 1/1 PASS. Child directory App/Nav and semantic Search evidence is attributed in the independent checker review; semantic actual SearchPage consumer 3/3 and current hash match. Canonical handshake now ready-for-check at cycle 0 after all scoped required evidence. Whole structural/release gates remain explicitly red, not part of a claimed full product PASS.

Expanded T-040 caller scope focused checks passed: safe-runtime actual apps/api/src/server.test.ts 9/9, and approved standing Vitest actual SessionDetailPage.test.tsx 8/8. Receipts/output at qa/evidence/execution-wave1-integration-grounded-{server,session}.{receipt.json,stdout.txt}. Candidate 16 source pins unchanged. Final affected API/web typecheck and actual production Vite bundle are being independently repeated after this expansion; prior unchanged meeting-bot evidence remains valid. New panel adds a grounded-content read on loaded session pages, so actual source-navigation child fixtures may need their matching endpoint response; name any remaining downstream check rather than inferring it from standalone panel checks.

qa/evidence/execution-wave1-integration-{backend,generated,validator,bot-ui}.{receipt.json,stdout.txt} preserve exact commands, exits and durations. Backend 27/27 PASS; generation 30 types plus index match; frozen validator explicitly vacuous PASS; actual BotActivity JSX 1/1 PASS. Initial backend 24/27 retained as backend-initial: three test fixtures lacked real authoritative primary required by the updated producer's save revalidation. Corrected only tests to persist real primary, then remove primary for fallback; updated final hashes before ready submission. Actual App/Nav/Search child consumer receipts and affected typechecks remain required. API typecheck initially failed on discovery-owned GWS fields, not integration-owned paths; independent checker tracks that gate. No standing Vitest or full browser acceptance claimed.

Existing environment Node24.21.0, Python3.12.10; node_modules/.venv present. pnpm absent PATH; corepack manager probe hit EPERM at cache mkdir. Other agents demonstrated esbuild subprocess EPERM. Runtime inventory established the safe in-process TypeScript loader above with 2/2 smoke tests; that is toolchain evidence, not this unit's acceptance evidence. Established ReactDOM/jsdom harness supplied the actual BotActivity probe receipt; Vitest remains unexecuted. Avoid repeating known failing capability attempts. No additional dependencies installed. Two lightweight local test slots owned by /root/runtime_inventory; no full suites/browser/provider tests. Current acceptance evidence and remaining gates are listed above. Persist HOLD for missing necessary evidence.
