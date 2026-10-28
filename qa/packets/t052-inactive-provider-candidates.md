# Checker packet — t052-inactive-provider-candidates

**Cycle:** 1; building/in-progress. **Independent checker:** /root/docker_dependency_review/checker_t052.

## Exact changed paths and scope

- packages/meeting-bot/src/calendar/registration-link-resolver.ts (new): inactive by default, requires trusted approval hash binding before any DNS/GET. Real Node HTTPS adapter pins a vetted public DNS address, validates TLS/peer, has no cookie/header credential injection, does not follow redirects itself, and enforces request byte/time budgets. The resolver validates every URL/hop, all DNS answers and final exact Zoom registration path. Returned proof/body is private.
- packages/meeting-bot/src/calendar/zoom-registration-proof.ts (new): inactive by default; binds independently verified native registration event/interval/metadata hashes to source/policy/recipient/attempt. Confirmation verifies canonical receiving-provider assessSender, delivered recipient, native Join Webinar field and conflicting IDs, receipt/baseline/consume chronology, exact native calendar/event data, current source/policy/vetoes and unique provider occurrence attempt. Output is a private candidate, not a durable confirmed state or scheduling grant.
- packages/meeting-bot/src/calendar/registration-provider-candidates.test.ts (new): eleven focused fixture tests, no real DNS/HTTPS/provider/browser. Mock approvals are labeled synthetic-fixture-only, not actual Umesh decisions. Positive mapping uses explicit verified fixture metadata; no inference from opaque WN codes.

No active consumer/factory references these modules. The existing D-079 rule stays active. Actual source metadata adapter, durable single-consume/provider-occurrence dedup wiring and real activation approval remain prerequisites before integration. A callback that fabricates verified metadata or approval is not live authority; production must supply trusted independently verified adapters.

## Privacy and evidence

The original opaque Brevo URL is still transmitted on a future approved resolution, potentially identifying the recipient and recording a click. No extra profile values/cookies are supplied. Full token URLs and body/recipient evidence stay private; public logs/errors have finite reasons and hashes/redacted paths. No real resolver request was executed. Retained actual mail metadata proves the source gap, not an already verified mapping or automatic attempt.

## Checks and remaining gates

Broker queue: node --test --import tsx packages/meeting-bot/src/calendar/registration-provider-candidates.test.ts, direct bot compiler and focused independent adversarial probes. No test yet; final hashes/output/durations must precede ready-for-check. Core quoted-property auth repair is a separately contracted security unit and must independently pass before using the actual quoted Zoom grammar.

Review all exact host/port/credentials/fragment/redirect/DNS-address/peer/deadline/byte branches, approval source/hash and event/recipient/native-field/receipt/replay/current-veto boundaries. Scope hashes additionally bind the exact redirect/final-host lists and confirmation-host list; raw redirect/control text refuses before URL normalization. Comments, data-type look-alikes, duplicate button types and raw join controls cannot supply a native confirmation field. Preserve the inactive zero-I/O floor. Fixture success cannot close full parent C1–C14; actual mapping/provider, approved identity/target, durable restart, native/custom JS execution, Windows/Ubuntu and downstream cited Ask remain independent acceptance gates.

Independent static feedback addressed before runtime tests: native anchor parsing now tokenizes full quoted attribute lists with exact names and rejects duplicate attributes, so data-href/aria-href cannot become href. IPv6 documentation 3fff::/20 is refused at compressed/expanded lower/upper boundaries. These are source repairs, not independently reproduced runtime results.

Current source SHA256 pins (still BUILDING; no runtime validation): resolver `6D316EB3862A1611D27EDD3180A61E628E43BFC1A678198D6DF99D6C44798F81`; proof `9A99787FE54D67553D1CFB82228C9FF1E16A8DAE1283A1C4A292FBE809773110`; tests `1700D9C7D6E78C9FCCA23D300F6871B71907FCDED55476302AB38E6F624DA8B7`. Rebind final bytes and dependent consumers before ready-for-check/verdict.
