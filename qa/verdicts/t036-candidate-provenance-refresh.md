# t036-candidate-provenance-refresh — independent cycle-0 verdict

VERDICT: HOLD
Cycle checked: 0
Contract: `qa/contracts/t036-candidate-provenance-refresh.md`, unchanged SHA256 `7EC8F6DC93320403F8BAFE875652802B1B6CE11D5B7F36A582E54940A3BB2EB0`.
Scope: finite existing-row provenance refresh through the real tenant-scoped accessor and immediate consumer; full `goal-t036`, public discovery mounting, T-052 and live-host acceptance remain HOLD.
ISSUES-WRITTEN: none

## Why PASS is withheld

The genuine twelve accessor/model tests pass and establish useful source-stage behavior. Necessary independent immediate-consumer evidence has not been received. The already queued three-case probe has no broker launch/result receipt at this verdict checkpoint; slot availability is unresolved rather than asserted impossible. Under the current roadmap hold, this check finishes with explicit missing evidence instead of launching another batch or inventing an executed RED.

There is also a concrete source-level consumer gap under C3/C5: `schedule-loaders.ts` preserves `meetingLinkIssue` and `youtubeWatchIssue`, but `auto-join.ts:normalizeCandidate` drops both; selection does not check them. Existing-row refresh intentionally preserves a prior approved row's meetingUrl and status while adding `meetingLinkIssue: "ambiguous"`. The actual selector therefore has no field through which that new refusal can veto its retained join. This is a static observation, not a claimed executed reproduction. The independent probe specifically pairs this boundary with rejected-row and healthy-approved controls and must establish actual behavior before a runtime FAIL claim.

No PASS is inferred from 12/12, authored tests, earlier global checks or the separate closed guard PASS. Missing immediate-consumer proof prevents C3/C5/C6 completion. No checker ground truth was diluted, maker source/test edited, private database opened, provider/browser called, or local CPU test run.

## Established independent review

- Ready manifest and packet agree on slug/Fix cycle 0. Final source `8E2B87123B24B46DD03EDCAFD7021FBEA15459D1B9075B48537133DBAE4A1E3E` and test `5149CAC7DAFE33A82157B538E0F973EFC85194302D62CE9E31CE852F57A0F793` match actual execution pins.
- Actual caller is production composition → server-mounted Gmail route → server-owned `createMeetingCandidatesDeps` → `createIfNew`. No HTTP caller supplies a database or metadata override. Store's explicit acquired-field allowlist retains the five provenance fields; route/schema/generated row/loader preserve them. Nine supplemental caller pins are static, not falsely attributed to the twelve DB model tests.
- Existing sender/owner/message/subject and established thread identity are checked. Original pre-thread rows can refresh provenance without adding a thread or weakening registration lineage. The initial static checkpoint's absent-thread blocker was repaired before this ready cycle.
- Exactly five acquired provenance fields can change. Existing identities, decisions/status/times/occurrences/links and creation/auto-approval counters are retained. Missing fresh fields do not erase stored evidence; receipts/watch targets and typed issues validate before any write.
- Physical-absence query guards plus literal whole-field aggregation equality supplement query equality, protecting scalar-to-array races missed by the initial model. Updated model explicitly distinguishes array-element query equality and whole-field expression equality. Six array-race cases and normal decision/occurrence/provenance races pass in the attributed run.
- The model exercises the actual scoped accessor/writer above an explicit public synthetic collection. It does **not** establish real Mongo server expression/operator compatibility, actual storage durability, deployed restart or live source proof. Those limits remain explicit.

## Actual reused evidence

**Maker/broker command:** `C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test --test-concurrency=1 --test-timeout=30000 --import tsx packages/db/src/collections/meeting-candidates.test.ts`, cwd `C:/Users/product/Desktop/KnowledgeBase`, outer cap 120000 ms, `KB_U24_PRIVATE_TOC_TESTS=0`.

Receipt `qa/evidence/goal-t036-candidate-provenance-current-20261015T012914Z.receipt.json` SHA256 `CF74629CD71879ABEB3B0C0FAF7DD05B099ADC34D95A6554903533CAC568949F`. Actual fields: `exit=0`, `tests=12`, `pass=12`, `fail=0`, `skipped=0`, `timedOut=false`, `pinCount=10`, `drift=0`. Recorded start `2026-10-15T01:29:14.2493162Z`, end `01:29:20.8070688Z`, reported process elapsed **6509 ms**; timestamp span is **6557.7526 ms**, not substituted for the separately reported process clock. Runner duration **6386.1004 ms**. All ten before/after pins match the final source/test/accessor/client/schema/generated/package/lock/contract bytes.

Sibling stdout `.stdout.txt` SHA256 `EDC96017F6553CEEF218A3771D0BF283279381902C48A70C62C6A08DCCBCAE48` records all twelve tests PASS, including original absent-thread compatibility, healthy-new-row control, six scalar-to-array races, missing-vs-null, exact ownership, malformed/conflicting evidence and retained refusals. Empty stderr SHA256 `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.

**Shared frozen verifier reused:** `qa/evidence/goal-t051checker-validator.json`, command `python contracts/verify_contracts.py`, actual batch `2026-10-14T18:39:31.7184876Z..18:39:33.1459082Z`, exit 0; individual duration unknown, combined batch 1.4327147 s. Output: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Current verifier `1240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3` and registry `D31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940` match. It was not rerun; its vacuity proves no behavior.

Supplemental caller-pin document `qa/evidence/t036-candidate-provenance-refresh-caller-pins.json` SHA256 `356D0B6CF8D265BA0D48BCDC9886D293AB2A443E0C367536B68B75EDCD8B3CDB` covers the actual store/route/producer/composition/server/auth/core/domain/loader. Its nine pins plus the ten actual execution pins all independently matched at `2026-10-15T01:38:34.8796715Z`. Actual selector source separately matches `AFAE8BFA9C7501EE6C86517122D87C3C72142C5DBF546454BF7DD2F1611D9C89`. The complete original hashes remain in their linked immutable documents; no earlier source checkpoint is presented as executed final bytes.

## Independent probe awaiting actual execution

Checker-owned `qa/evidence/t036-provenance-refresh-independent-20261015.mjs`, SHA256 `6DE80FBBD074BC348019F9F0B442F95A326FE3662E054442C4774AC3550133A4`; matching `.spec.json`, SHA256 `C3934FB14E266A776F908DFFC77E442A0DA4D380C98DCB80D1C81B51A2ED87D5`.

The already queued sole-governance-broker spec uses the actual factory → scoped writer → reconstructed public model → actual mocked HTTP loader → pure selector, with 22 pins, three cases, concurrency 1 and outer cap 60000 ms. Cases: refreshed rejected row retains decisions/counts/restart barrier; healthy approved control stays eligible; newly ambiguous approved legacy link must be blocked after reconstructed refresh. It uses no real HTTP/DNS/Mongo/provider or disk persistence. **No command result, passed/failed counts, runtime RED or server durability is claimed until a genuine receipt exists.** Keep the original cases and expected assertions intact.

## Timing and remaining gates

Recorded checker launch: **2026-10-15T01:32:01Z**. Ready packet/actual receipt/hash review began immediately. Probe artifact write confirmed **01:33:58.3882476Z**. Exact broker request/approval timestamps were not independently clocked; no broker execution timestamp/result is available. Bounded mailbox waits completed without a delivered result. Final ready/caller hash verification confirmed **01:38:34.8796715Z**, **393.8796715 s after recorded launch**, before HOLD persistence. Draft/persist confirmation follows in the tool receipt. Individual review/wait/draft intervals are unmeasured and are not attributed by subtraction; no 2–3-minute completion is asserted.

EXPLANATION: Required consumer evidence remained unavailable during the authorized active-check exception, and static source shows why accessor-only PASS cannot establish the conservative scheduling barrier. Preserve matching-cycle HOLD pending the original independent result and any specifically authorized consumer repair. Full public factory mounting, actual Gmail/Calendar/alias/public acquisition, registration, alert, deployed restart, real Mongo and host operational acceptance remain separate outstanding requirements.

HOLD persistence confirmed at `2026-10-15T01:39:37.6170198Z`, 456.6170198 seconds after recorded launch. Confirming timestamp/hash command took 0.3003983 seconds, exit 0. This timing annotation follows that initial persisted verdict.
