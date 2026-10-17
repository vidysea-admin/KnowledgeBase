# source-connectors-vectorless

**Handshake status:** HOLD
Status: HOLD
Fix cycle: 0
Tier: 2, high security/resource-bound finding ISS-SOURCEREADER-001; uncapped.
Parent tasks: T-045, T-053. Authority D-170/D-173/D-174 and root's explicit exclusive path lease.

Latest independent resume1: exact two-case boundary probe exit0,1216.612ms, receipt `verification-source-reader-independent-resume1.json`; canonical verdict remains HOLD after final full245-pin check found core barrel drift expected a2713a4d68dc9c8419a081e952ae2b17a456b9409618ada299c25176ffb581cf versus559ab33648fd5c145ea6e8f179c67210f893a78f557f4f679673bf6806b0ea07. Probe eightpins unchanged. Cumulative conservative debit360s10800 committed; actuals null. Do not dispatch/retest without coherent runtime identity and explicit admission. No source-reader edits occurred.

Independent cycle0 verdict consumed: qa/verdicts/source-connectors-vectorless.md authoritative HOLD / Cycle checked0 / Reviewed SHA6710b9aa265a472c7b6e172e2d632424b4e9beb0d5435dddcd3486d30751bb6c read back. Checker authenticated245 pins and existing12/12, no product violation. Missing independent UTF8 byte-cap/late-response cancellation probe; sole broker required exact script, and current finite cumulative300s9000 allocation consumed. Further review needs explicit finite admission; code unchanged, no PASS close-out.

Current admission repair (supersedes historical HOLD below): successful current-runtime source-only receipt `qa/goal-vectorless-2026-10-15/verification-source-reader-twelve-current-runtime-20261015T1133.json`,12/12 exit0,5979.3584ms,245 stable transitive pins; maker independently hashed current245 files, zero mismatches. Candidate6710b9aa265a472c7b6e172e2d632424b4e9beb0d5435dddcd3486d30751bb6c is scoped-pin digest, not commit. Root froze shared core/DB epoch through verdict. Current-runtime assess input/result preserve historical debit and protect30s800 finalization inside120s3000. Old receipt/HOLD remain historical; no independent PASS claimed.

Current admission HOLD (2026-10-15): changed-source hashes remain equal to successful broker evidence, but runtime `@lkb/db` barrel imported by source-intake/store.ts changed after that receipt: old 6340dec275001d1887558da2ca067e0b90ae3f734b39a350f650a9e86e2b2189 -> current 7745b14f3323f6b587312bfca2e76b107c31c47d4b05f5b6f42fd52ceebe767b. Core barrel also drifted; its direct store import is type-only, so no runtime claim is inferred. Exact transitive runtime epoch proof/current scoped receipt is missing; do not dispatch reviewer or reuse broad receipt candidate as this candidate. Budget assessment separately succeeds with protected reserve, not evidence readiness.

## Scoped behavior

Bound default Jina text acquisition to 10,000ms and 1,000,000 decoded response bytes, including streaming/stalled transports, preserve existing URL/DNS guard, and prevent source/provider secrets from escaping errors. This is one independently checkable source intake behavior, not complete connector/live source acceptance.

Excluded: production.ts/shared composition/schema/exports; live source/provider/DB/browser actions; watched durable snapshot implementation; data migrations; contract/verdict edits; full parent completion. No embeddings or model calls added.

## Candidate and impact map

- `apps/api/src/source-intake/adapters.ts`: replace unbounded `jinaReaderFetch` with `createSourceReader({apiKey: env.JINA_API_KEY})` inside existing `guardUrlFetcher`. Base git blob at start: a9f79f0fefe5955fef3a01ce79046e3b1b4889ac; HEAD 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a. Preserve all preexisting unrelated bytes.
- `apps/api/src/source-intake/source-reader.ts`: new; hard ceilings validated, abort + cancellation + independent deadline race, bounded streaming UTF-8 decoder, safe errors. SHA256 9CABEFDD4747FB7C868E44FEEC18006BF05BF9E7090392F8F16201A60C955293.
- `apps/api/src/source-intake/source-reader.test.ts`: new; three exact ledger cases plus declared cap/secret/redirect handling, guarded downstream multilingual text, resource option validation. SHA256 C01501C1B1660F22EAB14DF84132902226D90F1E2388884F13DDA932ED32920D.
- `qa/issues.SOURCEREADER.jsonl`: new permanent lane ledger, 001. SHA256 EF0DEE0DDF579EB7DE72DB814DB1FB81DB6BC6D7DA1E79FE412341C6318F787B.
- Final adapters SHA256: 960012C588BB06960AFC79142D34A0234A3370AD901DD24797324472C29CE8CF.

Immediate callers/consumers: source-intake/wiring.ts -> buildSourceIntakeAdapters -> packages/ingest/src/sources/url.ts -> intake/store indexing. Existing source-intake-hardening.test.ts exercises real adapter registry and URL guard; new test exercises bounded transport then guard with exact Hindi text.

Security flags: credentials yes (trusted configuration key forwarded only to fixed Jina origin, never error detail); tenant boundary unchanged (existing planner); data writes unchanged; resource-exhaustion fix. Jina's upstream target redirects remain not locally observable and are not represented as independently verified.

## Contract mapping and verification

Applicable checker-owned contracts: qa/contracts/goal-t045.md C6-C8; qa/contracts/goal-t053.md C3/C5/C7. No contract altered or thresholds invented. 10s/1MB matches existing watched source transport and root approved explicit limits.

Requested sole-broker command from repo root:

`node --test --import tsx apps/api/src/source-intake/source-reader.test.ts apps/api/src/source-intake/source-intake-hardening.test.ts`

Required verifier: `python contracts/verify_contracts.py` (root/broker shared evidence; registry currently vacuous). No secret/environment value, external provider, network, DB or browser needed. Tests use response streams and deterministic fake transports; no heavy build/suite requested. Node/tsx availability is broker-owned. No mutation testing requested or performed.

Broker evidence authenticated 2026-10-15: `qa/goal-vectorless-2026-10-15/verification-source-usage-20261015T0839.json` exit 0, 1522.8963ms, 16/16 tests (12 source-reader/hardening plus four unrelated usage tests). ISS-SOURCEREADER-001 literal corpus 3/3; existing ISS-W045-001 6/6 refused; source sink rollback boundaries 2/2. Scoped source files, exact immediate consumers and lock hash currently match receipt after-pins; no rerun. Source hashes above unchanged. Frozen verifier shared receipt `verification-frozen-contracts-20261015T0914.json` exit 0, 162.8908ms, explicitly PASS by vacuity. Compact checker entry packet: `qa/packets/source-connectors-vectorless.md`. Independent verdict remains outstanding; no parent completion claimed.

## Remaining parent gates

T045 requires five actual sources (OnAir, YouTube, Meet, Teams, Zoom), authorized host/profile, acquired media probe, real STT, durable readback and cited Ask, concurrency/idempotency and independent security review. T053 requires authorized connector inventory/media receipts, live watched cadence/change/retry, durable Mongo isolation/restart, production composition proof. None of these live gates were executed here; parent tasks stay open.
