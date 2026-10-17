# Maker manifest — T-052 inactive provider candidates

**Goal task:** T-052
**Tier:** 3 — approved roadmap engineering; activation/PIVOT retained for Umesh.
**Fix cycle:** 1
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Contract:** qa/contracts/goal-t052.md C1/C2/C5/C7/C8/C12–C14; candidate-specific independent criteria pending checker.
**Packet:** qa/packets/t052-inactive-provider-candidates.md

ROOT authorized new uniquely owned modules/tests to make the exact HUMAN_GATE proposal concrete before requesting activation. Both constants/default options are inactive; current D-079 matcher, source factory and frozen contracts are unchanged. No provider/browser/submission has run.

registration-link-resolver.ts provides a real pinned-DNS/TLS HTTPS GET adapter with exact approved chain, manual redirects, five-hop/fifteen-second/one-MiB-total caps, all-answer public-address/connected-peer checks and private source/link/body hashes. No extra operator fields, cookies or credentials are sent. The original opaque tracking URL itself still reaches the approved host, may identify its recipient and may record a click; this effect is explicitly disclosed in the gate.

zoom-registration-proof.ts constructs hash-bound source/policy/event/interval/recipient attempts from an independently verified registration mapping, then accepts only a reviewable private candidate from fresh receiving-authenticated Zoom native confirmation fields and independently verified event/calendar metadata. Wrong/replayed/ambiguous/changed/vetoed evidence refuses. No title match, opaque WN code or vendor address alone creates authority. Trusted approval and native-metadata adapters are mandatory; they are not implemented as fabricated flags or client data. Source code is not a full live proof.

Eleven deterministic fixture tests cover inactive zero-I/O defaults, exact chain/hashes, authorization binding, DNS/peer/SSRF ranges, redirect/cap failures, cross-thread candidate, source/policy/recipient hash changes, expiry/replay/ambiguity, receiver authentication/native-field conflicts and current vetoes. All DNS/GET/provider metadata adapters are synthetic in these tests. They do not execute the real HTTPS transport or prove actual provider metadata. Broker tests and independent static/source checks remain pending.

Actual retained mail evidence and the concrete activation/PIVOT request remain qa/evidence/t052-real-mail-provenance.json and qa/gates/t052-zoom-confirmation-and-brevo-resolution.md. Opaque destination/event ID is still unresolved, no approved profile exists, and real registration/restart/downstream/OS gates remain HOLD. No task closure or authority change is claimed.

## Close-out cycle 1 (lane w16-t052reg, base a9fac545; candidate = the commit carrying this manifest)
No source change in this cycle; the checkpointed bytes were run for the first time. Final sha256: resolver 133e67be2083991df2d50ed4705960cc852269d56835b3e0e736c2daf333d952; proof 4aba9ae49ddf9f15cdf1bc388b4d8d80ddac8f4e4d7f887b0417d0a0a7c07249; tests 1499191e4764b1c3c0d212bb850514a8bd88db7f7b8a6fafa919c4398e847261 (the older pins in the packet are superseded).
Evidence: `node --test --import tsx src/calendar/registration-provider-candidates.test.ts` (cwd packages/meeting-bot) -> `ℹ tests 11 / pass 11 / fail 0`, duration 18.2 s. Fixtures only; no real DNS/HTTPS/provider/browser run. No filed issue is fixed here (no ISS corpus). Inactive; no consumer references; gate qa/gates/t052-zoom-confirmation-and-brevo-resolution.md untouched and undecided.
Checker must run: the test above, direct bot tsc (workspace-wide tsc currently shows 2 unrelated errors in src/capture/native/windows-capture-clock.ts and src/capture/tiles/native-measurement.test.ts, none in these files), and the independent adversarial probes listed in the packet.
