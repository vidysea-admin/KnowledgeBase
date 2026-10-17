# Verdict — t048-single-dispatch-20261014

VERDICT: PASS
Cycle checked: 0

Scope: Independently verified default-OFF local recording dispatch/publication slice under `qa/contracts/goal-t048.md` C2–C5 and its actual local QA consumer. This is not a full-parent T-048 PASS. `qa/verdicts/goal-t048.md` remains HOLD for C1 authorized default promotion, C6 paired real TOC/provider comparison and C7 actual isolated ingest/index/citation proof. Central watcher routing, validate-before-seed and trusted durable privacy-interval composition remain separate integration prerequisites. No production, host, live provider, browser, database or human-comparison acceptance is claimed.

## Timing and phase checkpoints

- Matching READY checker launch/scope-read start: 2026-10-14 20:05:08 UTC. Earlier read-only review and contract-authoring sessions are separate; their elapsed time is not counted in this READY check.
- Current packet/manifest and attributed receipt read: command exit 0, 0.333s measured command duration.
- Candidate/dependency and maker receipt hash validation: command exit 0, 1.401s. All 15 candidate/dependency pins matched.
- Independent offline probe prepared and submitted to sole CPU broker by 20:06:29–20:07:11 UTC checkpoints. The first evidence-script preparation had a substring-selection error; it was corrected before submission, with no candidate edits or test execution. Exact request timestamp was not captured.
- Scope/security review complete by 20:07:26 UTC. Union-ledger search found no matching T048/single-call issue reproductions (rg exit 1, no matches, 0.321s).
- Queue checkpoint: 20:09:07 UTC. No local suite, duplicate probe or duplicate vacuous validator run occurred while waiting. Broker explicitly accepted the independent probe for its next small batch and directed reuse of shared frozen-validator evidence. Queue entry/grant message timestamps were not measured; no duration is inferred by subtraction.
- Shared contract receipt and exact script/registry hash readback confirmed by 20:09:53 UTC.
- Independent broker command: 2026-10-14T20:11:23.003Z to 20:11:23.672Z, measured wall 0.662437s, exit 0.
- Final receipt/source/dependency readback started 20:12:04 UTC, exit 0, 0.523s. All 16 pins (15 candidate/dependencies plus independent probe) remained identical. Manifest still ready-for-check, Fix cycle 0.
- Verdict drafting/persistence follows that final readback; completion and measured launch-to-verdict elapsed are recorded below after readback. The check exceeded the 120–180s efficiency target to wait for required serialized broker evidence; unrelated tests were not added.
- Verdict persistence/readback confirmed by 2026-10-14 20:13:28 UTC; measured READY launch-to-confirmed-verdict elapsed 8m20s. Verdict readback/hash command exit 0, 0.386s. This completion checkpoint follows the actual readback; unmeasured phase intervals remain unknown.

## Independent findings and behavioral proof

The initial eligible single strategy calls `transcribeSpanOnce` directly once; it no longer enters the retry/recursive chunk function. Failed, malformed, empty, invalid or incomplete initial output is discarded before fallback merging. Chunk attempt count and tail depth remain bounded; rejected attempts are not counted as selected QA spans. The fixed fallback messages omit provider payloads. Routing still requires the exact opt-in flag and gemini-3.8-flash model, uses the inclusive 5400s cutoff and preserves existing duration routing otherwise.

Reviewed the complete changed dispatch and driver logic, immutable transcript writer, chooser/chunk merge, generation builder and actual consumer. The earlier independent audio-hash finding was corrected: requests read/extract an owned recording snapshot, its duration/hash bind input, and changed source bytes refuse before publication. Final turns preserve source-derived tenant/session and immutable identities. Report shape/count preflight precedes writes; opt-in publication invalidates old validation even when canonical turns are unchanged. Sidecars use atomic temp/rename publication, committed-turn hashes and selected attempt IDs. Mid-publication failure exits unsuccessfully and leaves failed validation; downstream hash/QA checks refuse a mixed generation. No new authenticated API or Mongo boundary is introduced by this local CLI slice.

Independently authored `qa/evidence/t048-independent/probe.mjs` reuses only the maker fixture setup while replacing its adapters with calls through the actual driver `countedTransport` and an offline transport. It exercises two real driver processes over isolated local fixtures:

1. Accepted single output: protocol counts upload=2, poll=1, generate=1; one initial attempt, actual path single, 180 committed turns.
2. Initial provider error followed by two fallback chunks: upload=6, poll=3, generate=3; one initial attempt, actual path chunked, 180 committed turns; no private fixture error string in path evidence.

For both outputs, the actual `evaluateTranscriptQaGeneration` accepted the committed bytes and refused changed same-count text with a generation hash mismatch. These are actual local producer/consumer checks with provider/media calls mocked, not live acceptance.

ISSUES-WRITTEN: none

## Exact commands and attribution

**Reused maker execution, verified against current pins:**

`C:\Program Files\nodejs\node.exe --test --test-concurrency=1 scripts/lib/transcription/recording-dispatch.test.mjs scripts/lib/transcription-wiring.test.mjs`

Receipt `qa/evidence/goal-t051checker-broker-t048.json`: timeout 120000ms; UTC 20:02:14.348Z–20:02:20.540Z; exit 0; 27 tests, 27 pass, 0 fail/skip/cancel; TAP 6.083083s, wall 6.186543s; 15 source/dependency hashes unchanged. Source review establishes these cases cover malformed/gapped/invalid initial fallback, retry/tail selection, prior-file retention, changed-audio refusal, identical-turn suspicious-QA invalidation, QA publication failure and boundary routing. This suite was not independently duplicated.

**Independent probe, executed serially by the sole broker:**

`C:\Program Files\nodejs\node.exe qa/evidence/t048-independent/probe.mjs`

Cwd `C:\Users\product\Desktop\KnowledgeBase`; timeout 60000ms, fixture child timeout 30000ms; exit 0; 2/2 scenarios; 0.662437s wall; no network. Receipt `qa/evidence/goal-t051checker-broker-t048-independent.json`; stdout/stderr use the matching prefix. Probe input SHA256 `13BC59A5189D63EFD52789C52DB715DA07B95BB81F83640DBF7D9D22D2CACF9B`.

**Shared required frozen-contract check, attributed rather than duplicated:**

`C:\Users\product\Desktop\KnowledgeBase\.venv\Scripts\python.exe contracts/verify_contracts.py`

Current shared receipt `qa/goal-2026-10-14/contracts-receipt.json`: exit 0, no timeout, 0.138s, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. This receipt has no UTC timestamps. Pin-bearing `qa/evidence/goal-t051checker-validator.json` separately records the same validator/registry hashes, earlier batch time and exit 0. Independently verified current validator SHA256 `1240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3` and registry `D31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940`; stages remains empty. Vacuity does not establish empirical stage acceptance.

No matching recorded issue corpus required replay; no mutations or broad suites were run. Read/hash operations have command results in the checker tool transcript; the executed behavioral outputs are persisted above.

## Checked final hashes and evidence

All 15 source/dependency hashes are enumerated in both broker receipts and were independently recomputed before review and after independent execution. The submitted manifest/packet owns the five candidate file pins; the remaining ten are dependency pins. Exact owned final SHA256:

| Path | SHA256 |
|---|---|
| scripts/transcribe-long-session.mjs | 8B5F8F7F02D27FB2AA1D3531A6A3D2BD810AB65F43307D1BA26937D46CB11913 |
| scripts/lib/transcription-wiring.test.mjs | A3276884893E0B579F97BE678EEAC0ECFF1FAA8C56BC0540D3E192F614FE8B64 |
| scripts/lib/transcription/recording-dispatch.mjs | F998ACA09E973AC94576F62BC8B1441911727586E27370CA9069C25F7CD9FC8C |
| scripts/lib/transcription/recording-dispatch.test.mjs | BC9F3FB6F526BF33F0DA5381E752C0C05242AA18DA86B404B3F13A363740703A |
| docs/t048-transcription-dispatch.md | D5646747A4A8E0CCFA52FE866E8F4460B28EB41C076860DD69BD0DE045AA1947 |

Contract SHA256: `32E0D2CC0CD6169F818F58292D99875BC68335FDD76945AFD0E2547AE1E97463`.

Verified immutable evidence hashes:

- Maker receipt/stdout/stderr: `587DFD9E917423B8951DD9FCCABDAE29CA28841057DB913905BB81AEF97361F9` / `07BA7D5EBCBB9B4A8132F80139F1DDD2A18C81E606589DCBD9A7945CDD08DF7B` / `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.
- Independent receipt/stdout/stderr: `52377BCD649FE8EC6105F8462DB9F64481EE0832392E692A17FB1149ECFF1E27` / `BCF7101CB7A853C54D75031A166037A0E08F5170B14FF23EB698AF42962E3EEB` / `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.
- Shared contract receipt/pin-bearing receipt: `9E3BE1CC17601231D5D7D25968654A946E7D8644E3F88BD79D254D53B943B86F` / `53EF35F5204AEA32DB0A4701DD60EBEEE10CBBF24AE5AF9287F16EB7EED0D6DB`.

EXPLANATION: PASS is limited to this matching cycle's implemented dispatch/publication/QA-consumer behavior. It authorizes maker close-out of this slice only. It cannot satisfy parent C1/C6/C7, default promotion, central watcher/privacy composition, T-043 indexing or T-051 operational release. Scope hashes that change require resubmission rather than extending this verdict to different bytes.
