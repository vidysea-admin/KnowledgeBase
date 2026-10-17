# Speaker knowledge vectorless projection

**Handshake status:** building
Status: building
Fix cycle: 1
Base SHA: a9fac545
Updated hashes (supersede table below): speaker-knowledge.ts a1f6259ea6f75fd2c75243784bda187f0b2c0d0a2c9bdedf937440bfc0c91fdf; speaker-knowledge.test.ts cc8da455c5455a1e97b1ae9330e85da394cc20b75065f8f5f5083039146f5f21. Both tracked at base; no source edit in this lane.
Tier: 3 — approved vectorless Knowledge Brain roadmap U2.4 / T-055 / T-056.

## Scope and authority

Umesh explicitly approved vectorless retrieval with evidence-backed individual speaker knowledge views. This unit adds a pure read projection and bounded lexical passage selector; it does not close any parent task. Maker workflow: skills/maker/SKILL.md. Checker-owned acceptance: qa/contracts/speaker-knowledge-vectorless.md clauses 1–5 and historical qa/contracts/goal-U24.md clauses 2/3/6/8. No changes to checker contracts, schema, data, providers, secrets, identity writers or shared composition.

## Candidate

Both source paths are new/untracked; no base existed:

- packages/index/src/graph/speaker-knowledge.ts — SHA256 0A275D04C2807FBFE707FF0D9DAE430C5A4E3566E9AAFD94D79A8E6415AEA33D
- packages/index/src/graph/speaker-knowledge.test.ts — SHA256 532A543D82ADB99A9E51F9107F679B59DF190D7CA40ED2FAB967A2A8BBA02AEE

No existing graph/profile source was changed. Existing privacy implementation remains packages/index/src/pipeline/speaker-profiles/profile.ts (matching prior cycle3 privacy contract).

## Change and consumer map

buildSpeakerKnowledgeView takes existing SpeakerProfileInput plus mandatory visibleSessionIds from the caller's current metadata-visibility snapshot. It filters sessions, turns, claims and suggestions before delegating identity/block/ownership decisions to buildSpeakerProfile. Returned nodes are canonical person/session/topic/statement IDs; stated/supported_by/about/spoke_in edges retain actual ProfileCitation evidence. It preserves human-confirmed/deterministic/unresolved identityStatus and ambiguity rather than upgrading it.

Exact evidence quotes are literal source substrings. Explicit curated agrees_with/contradicts/supersedes relationships require accepted tenant-owned rows, two existing attributed verified statements, own evidence locators, exact quoted text and current transcript hashes. Similarity and co-occurrence never produce these relationships. No persistence producer is added. Source/claim removal or changed attribution re-derives the graph and revision digest. Duplicate claim identities refuse; repeated relationships deduplicate.

routeSpeakerKnowledge receives the authorized view and query/session/topic bounds; it ranks only surviving exact evidence using Unicode lexical terms, deduplicates turns and returns whole passages. Defaults: 8 passages/6000 quote characters; hard caps 20/12000. Oversized source snapshots refuse rather than truncate identity windows; canonical node collisions and serialized graph views above 512KiB UTF8 refuse as well. There are zero embedding, provider, DB or file operations in these functions.

Security flags: tenancy/source visibility/attribution reads YES; writes/auth enforcement/credentials NO. The pure projection requires an upstream visibility capability and cannot authorize sessions itself. Product consumer owner knowledge_profiles_maker will invoke inside apps/api/src/speaker-profiles/store.ts existing final read snapshot, using currentSessions and sanitized projectedSpeaker/effective/visibleClaims/visibleTopics. Route/API mounting and UI ownership remain that maker's separate lease. Shared exports owned by integration_control.

## Evidence and commands

NOT RUN: all local test execution is assigned to root's sole CPU broker. Required focused command from repository root:

```
node --test --test-timeout=60000 --test-concurrency=1 --import tsx packages/index/src/graph/speaker-knowledge.test.ts
```

Nine focused tests cover canonical provenance, suggestions, cross-tenant exclusion, visibility withdrawal/deletion, stale transcript/forged quote/foreign source, explicit relationships, Unicode/Hinglish bounds and revoked/duplicate statements. No providers, DB, browser or live side effects. Node/tsx dependencies exist; normal in-process node:test execution. Root broker also owns targeted typecheck, immediate downstream consumer tests and contracts/verify_contracts.py. No evidence inferred before actual command receipts.

## Remaining gates

Current status building, not ready-for-check: broker execution, independently checked current hashes, product store/route consumption and verifier receipt remain pending. Full corpus speaker precision, human identity confirmation, live staging, graph persistence producer, cross-speaker relation review and browser acceptance remain parent gates. No production calls, migrations or private source reads occurred.


## Lane evidence (w16-u24spk, 2026-10-16)

Candidate code unchanged from base; this lane only ran the checks the earlier manifest left NOT RUN. Test file now has 11 tests, not 9.

- `node --test --test-timeout=60000 --test-concurrency=1 --import tsx packages/index/src/graph/speaker-knowledge.test.ts` -> tests 11, pass 11, fail 0 (duration 112 s under load).
- `tsc --noEmit -p packages/index/tsconfig.json` -> 3 errors, all pre-existing in src/eval/decisions-acquisition.test.ts and src/eval/topic-run-evidence.ts; none in graph/ or speakers.
- Not run: apps/api consumer tests (store.ts/router.ts/relations service), contracts/verify_contracts.py, mutation checks.
