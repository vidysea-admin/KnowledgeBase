# T036 candidate provenance refresh

Status: in_progress
Fix cycle: 1
Task: T-036 / T-052 dependency
Maker: /root/candidate_provenance_maker
Checker: pending independent root dispatch
Packet: qa/packets/t036-candidate-provenance-refresh.md
Priority: security/data writes, no round cap

## Current cycle 1 — refreshed refusal consumption

D-173 and the user's implementation plan reauthorize the precise cycle-0 HOLD repair. The source now preserves meetingLinkIssue/youtubeWatchIssue through normalization and refuses any present issue (including malformed JSON values) with the existing needs-review outcome. In everyWebinar mode the refusal joins the existing canonical-identity barriers, so a healthy-looking Calendar copy cannot bypass refused Gmail evidence. Rejection, registration and cancellation outcomes keep their precedence, unrelated meetings remain eligible, and no decisions or registration lineage are rewritten.

Exclusive changed source: packages/meeting-bot/src/calendar/auto-join.ts (base SHA256 AFAE8BFA9C7501EE6C86517122D87C3C72142C5DBF546454BF7DD2F1611D9C89; final A9B6D5C4CD4FEB13E3E428778E7E0143AA687AF09ECCBCCACE8203B230AC3023) and adjacent auto-join.test.ts (base 9E9D911E7E9533D888C4AD6FB92BBB4C01CC14689C5A9862B6D5F809E5368B14; final 2675C7055841E694316845254E8945495AFFB067531B58D1D9083E01DC1FA716). Source/test were tracked and clean at lease entry. This manifest and matching packet were already untracked; their cycle-0 history is retained below. No accessor, loader, contract, verdict, schema, dependency or shared composition edit belongs to this cycle.

Execution status: frozen source/test submitted to the root CPU broker; no maker execution or fabricated result. Required affected-stage and immediate-consumer command: node --test --test-concurrency=1 --test-timeout=30000 --import tsx packages/meeting-bot/src/calendar/auto-join.test.ts qa/evidence/t036-provenance-refresh-independent-20261015.mjs, repository cwd, KB_U24_PRIVATE_TOC_TESTS=0, outer timeout 120000 ms. The checker-owned original three-case probe and historical spec remain unmodified. Broker/checker must produce current dependency pins and a genuine receipt. No ready-for-check or PASS claim until required receipts exist; full T-036 and real Mongo/live-host gates remain HOLD.

## Historical cycle 0 — preserved evidence and HOLD

Independent result: qa/verdicts/t036-candidate-provenance-refresh.md, VERDICT HOLD, Cycle checked 0. The 12-case accessor/model receipt is credited; actual independent immediate-consumer evidence is absent. Static review finds schedule loader issue fields dropped by auto-join normalization, so a retained approved join may not be vetoed by newly acquired ambiguity. No runtime RED or scoped/full PASS is claimed. Source/test work and queued new launches are held for the human's requested list/roadmap; resume needs the missing consumer floor and authorized repair, not duplicate accessor/guard suites.

ROOT/runtime granted only packages/db/src/collections/meeting-candidates.ts and the new adjacent test. Existing candidate rows previously returned before retaining newly acquired provider receipt/auth/watch/issue metadata. The sanctioned writer now refreshes only those five provenance fields after exact source/owner matching, with compare-and-set guards on the existing identity, decisions, occurrence and provenance. Missing fields do not erase prior evidence; prior denial/ambiguity stays conservative. Creation/auto-approval counters and all human statuses remain unchanged.

Twelve public synthetic tests passed in the actual sole-broker run, exit 0, 6509 ms wall / 6386.1004 ms runner; fail/skip/cancel 0, no timeout. All ten before/after/current source/dependency/contract pins match. They exercise the actual scoped accessor and writer above an explicitly modeled Mongo collection; no live or private database is involved. Original rejected rows, all status values, decision/identity/occurrence/provenance races, tenant/source mismatch, physical missing-vs-null guards, malformed/conflicting receipt/watch input, retained refusals and healthy new-row insertion form the floor. Historical absent-thread rows refresh provenance while thread remains physically absent; strict registration remains barred. The model explicitly reproduces Mongo query array-element equality, while whole-field aggregation equality guards six scalar-to-array races. Real Mongo server CAS/durability is not inferred from a model.

The exact frozen source is 8E2B87123B24B46DD03EDCAFD7021FBEA15459D1B9075B48537133DBAE4A1E3E; test 5149CAC7DAFE33A82157B538E0F973EFC85194302D62CE9E31CE852F57A0F793. Checker-owned contract qa/contracts/t036-candidate-provenance-refresh.md SHA256 7EC8F6DC93320403F8BAFE875652802B1B6CE11D5B7F36A582E54940A3BB2EB0. Original static absent-thread compatibility and scalar-to-array CAS gaps are repaired and their standing floors passed in the actual 12-case run. Immutable receipt qa/evidence/goal-t036-candidate-provenance-current-20261015T012914Z.receipt.json SHA256 CF74629CD71879ABEB3B0C0FAF7DD05B099ADC34D95A6554903533CAC568949F; stdout EDC96017F6553CEEF218A3771D0BF283279381902C48A70C62C6A08DCCBCAE48; stderr empty E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855. Matching independent verdict and scoped closeout remain pending. Public discovery production mounting and full T036/T052 acceptance remain HOLD.
