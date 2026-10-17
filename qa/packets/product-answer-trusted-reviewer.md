# Maker packet — product-answer-trusted-reviewer

Root: C:/Users/product/Desktop/KnowledgeBase
Unit: product-answer-trusted-reviewer; fix cycle 0; priority tier 3, T-056.
Base SHA observed: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a.
Candidate: shared uncommitted working tree; no candidate commit exists. Freeze source hashes below; central integration must supply exact candidate SHA before checker dispatch if required. No checker readiness claim yet.

## Scope and identity

Exact lease paths, both tracked:

- apps/api/src/answer-policy/answer-router.ts — base Git blob 98bee2591d9f5b04c751cbe4e6b34ec8b0c6f2a8; candidate SHA256 FD11C33E891ED2AE6CC01548A6FDCFDC9587FBE960B95C0E47095DCE04C5EFF7.
- apps/api/src/answer-policy/answer-router.test.ts — base Git blob e8316b69b6aa273f8dc94efc5f8a8409105dcdd0; candidate SHA256 DA244C5DA70AB85286D10DCD6BEE985701F74FA7E7607B121231644F141BE12D.

Untracked maker artifacts: this packet, matching qa/manifests/product-answer-trusted-reviewer.md, product-delivery/reviews-budget-dispatch.json and its assessment result. No base existed for those artifacts. Complete shared-tree untracked inventory belongs to central integrator; unrelated changes are excluded from this unit.

## Contract and behavior

Read qa/contracts/goal-t056.md C1 (authenticated identity/honest missing configuration), C3 (durable feedback), C7 (attributed evidence preference), C8 (authorized review), C10 (agents cannot replace human labels), C11 (focused security checks), C12 (actual interactive proof remains gated). Root explicitly required fail-closed human authority absent a trusted human reviewer. This slice implements the authority boundary only; it does not claim whole-parent criteria.

createAnswerHistoryRouter gains optional AnswerReviewAuthority. Its asynchronous verifyHuman(req, action) is server-owned identity/authorization verification for each action; implementations must establish human identity from a trusted session/identity provider and authorize it independently of API-key scope or client claims. The router does not install any real human provider.

- Existing one-argument production caller remains valid and defaults to 503 human_review_unavailable for answer approval/rejection, source preference and usefulness labels. API-key tenant/scopes remain necessary, insufficient proof of human authority.
- Verifier errors return generic 503. Null, nonhuman kind, foreign tenant, blank/trimmed-mismatch/control-character/overlong subject return 403 human_review_required. API-key scope middleware still runs first.
- Trusted verified result persists actor human:<subject>, with request actor/reviewer labels unused. Action discriminants are answer-review, source-preference and usefulness.
- History, suggestions, queue reads and conflict reporting retain existing behavior. Workflow/CAS/evidence freshness guards are untouched.

Immediate consumers: apps/api/src/answer-policy/answer-workflow.ts feedback/review/resolveConflict (Actor argument); apps/api/src/composition/integrations/routes.ts:55 production mount uses one argument and therefore default refuses; apps/web/src/pages/answer-policy/AnswerReviewPage.tsx and client.ts continue displaying API refusal messages. No changes to workflow, source guards, schemas/generated files, composition, UI or dependencies. Security flags: auth/tenant attribution and persisted decision writes; no credential or external sender behavior.

## Required focused evidence (broker only)

From repository root: node --test --import tsx apps/api/src/answer-policy/answer-router.test.ts.
Four test names cover: human-authorized HTTP scope/foreign/CAS/duplicate/released-answer/feedback boundary; key-only and forged-human default denial on all three actions without writes; six verifier refusal/error modes on all three actions without writes; real fixture conflict report/resolution + persisted human attribution and exact action dispatch, preserving conflict approval409. Synthetic injected human identities are fixtures, never actual human acceptance.

### Runnable HTTP baseline and minimal boundary probe

Harness: apps/api/src/answer-policy/answer-router.test.ts `start(authority?)` creates an ephemeral127.0.0.1 Express HTTP server behind actual requireAuth(fakeKeyStore), actual router/workflow and in-memory policy/answer stores; exposes call/close/store/candidateDigest/evidenceDigest. Its two-source saved review candidate is tenant-a/run-1. Every fixture closes its server in finally. Runtime uses existing root node/tsx dependencies; no live DB/provider/browser or real human identity is needed. Broker must establish the current full four-test baseline before independent dispatch; no current broker receipt is available yet.

Exact root commands and expected executed case count:

```text
node --test --import tsx --test-name-pattern "API-key scopes|human verification" apps/api/src/answer-policy/answer-router.test.ts
```

Expected2 executed cases (remaining2 filtered): `API-key scopes and claimed human labels cannot approve, prefer sources or label usefulness without trusted authority`; `human verification fails closed on absent, foreign, nonhuman, malformed and unavailable authority`. Covers503 default refusal despite full key scopes and forged actor/reviewer claims on all three mutators; then403 null/foreign/nonhuman/blank/control-subject and503 verifier error with no state/feedback effects.

```text
node --test --import tsx --test-name-pattern "^human-authorized|^trusted human authority" apps/api/src/answer-policy/answer-router.test.ts
```

Expected2 executed cases (remaining2 filtered): `human-authorized history/answer-review endpoints preserve scope, tenant, revision and duplicate boundaries`; `trusted human authority receives each action and persists source preference attribution`. Covers trusted human actor persistence for review/feedback/conflict;403 missing scopes;404 foreign target;409 forged digest/duplicate/conflicted approval; exact action verifier dispatch.

Independent minimal failure-probe specification, derived from C1/C8/C10 and root's human-only constraint: reuse/copy the actual start/call/store harness into a checker-owned temporary fixture (do not edit maker sources). Configure full reviewer API-key scopes but verifier returns null or wrong-tenant human; send a correct candidate/evidence digest plus forged human actor/tenant/kind/reviewer body claims to review resolve and/or usefulness feedback. Assert403 before workflow persistence, original state remains review, no review/feedback record, and history still hides candidate. A separate default-no-verifier variant expects503. Checker independently chooses/authors the smallest useful variant from this specification and confirms it exercises actual HTTP/router rather than a fake response; never treat fixture humans as acceptance labels. This is an additional independent behavior/failure probe, not a reason to rescan unrelated modules or waive mandatory receipts/checks. Any mutation remains subject to timeout/byte-backup/restore/cmp rules; this probe needs no source mutation.

Mandatory: contracts/verify_contracts.py using existing compatible Python; report vacuous frozen contracts if applicable. Immediate consumer compile: existing API typecheck command if broker grants; central integration owns combined release checks. Runtime/subprocess execution and fingerprints/receipts are broker-owned; maker ran no tests/builds and no live HTTP/DB/provider/browser or production writes.

pnpm-lock.yaml SHA256 observed: 2AF3AADA247F31436A28F46F4803DC8B4294956C21825F7421CA37FAF07D83DD. Broker must record runtime path/version and actual command/exit/duration/output, environment fingerprint and unchanged-source hash readback. No secret values required.

No filed issue is claimed fixed; no ledger reproduction corpus substituted. No mutation run performed. Definition-of-done and live native persistence/browser/human gates remain open; broker execution receipt is currently missing.

## Review budget and readiness

Canonical checker skill explicitly loaded: C:/Users/product/.agents/skills/checker/SKILL.md. Unknown maker active time/tokens/cost stay null; no measured efficiency claim. This unit has no prior checker dispatch/charges known; the named not-dispatched placeholder has zero actual usage, not an unknown prior reviewer. Root finite BOOTSTRAP_REVIEW allocation: total120s/3000 allocated tokens, review90s/2200 with protected finalization30s/800. Input: qa/coordination/knowledge-brain-20261015/product-delivery/reviews-budget-dispatch.json. Python assess exit0: matching reviews-budget-dispatch-result.json reports BOOTSTRAP_REVIEW, protected reserve, ratio_verified=false. Earlier rejected empty-reviewer input/result retained in reviews-budget-dispatch-invalid*.json; no checker ran during that setup error. Independent checker dispatched by coordinator only after broker receipt; fresh context and exact freeze required. Checker alone writes verdict. Further necessary phases require assessment and retained actual/debit accounting.
