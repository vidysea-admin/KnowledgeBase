# Contract — recorder-host-id (unit B3, plan Lane B, D-233 item 6, D-243 item 2)

> Status: adopted by /checker 2026-11-25. SOURCE: MAKER-DERIVED from the owner-approved plan (D-227, section 7 Lane B, state table row "Slot identity", unit B3), D-233 item 6 and D-243 item 2; the
> criteria are not Umesh's words. The one owner instruction behind the whole recorder move is "nhi apne aap heal ho jayee asap and alert bhi aa jaaye" (inbox 2026-11-25, D-242 item 4): a restarted recorder
> must come back by itself, and its signed-in browser state must still count. Plan check for the unit: "in B9" (the second half of live check row 7). D-233 item 6 reads: "A new environment variable
> `LKB_CAPTURE_HOST_ID` overrides the host id, because `captureSlotHostId()` hashes hostname and platform and Cloud Run changes the hostname per instance."
> What the code does today (read by the checker 2026-11-25, nothing run): `captureSlotHostId()` at `packages/meeting-bot/src/capture/workspace/capture-slot-readiness.ts:13-15` returns
> `sha256(JSON.stringify([hostname(), process.platform]))` as 64 hex. The id is written into every readiness receipt (`capture-slot-readiness.ts:79`; `capture-slot-acceptance.ts:89` for revoke) and compared at
> `capture-slot-readiness.ts:58` (validate) and `:68` (list, which silently FILTERS a mismatching receipt out, so a slot just stops being ready), `capture-slot-acceptance.ts:68` (publishing a person's
> acceptance: "Readiness evidence is stale, foreign or synthetic") and `:109` (the acceptor the scheduler uses), and `scripts/native-capture/server.ts:39`. It is also part of the acceptance key
> (`capture-slot-acceptance.ts:30`, `keyFor`), so a changed id orphans the SIGNED acceptance record as well as the receipt. A receipt whose `hostId` is not 64 lowercase hex is rejected (`capture-slot-readiness.ts:37`).
> The profile tree that carries the receipts, the acceptance registry and the issuer key (`data/bot-profile`, `capture-slot-acceptance.ts:15`) is the tar B4 restores at start (D-233 item 1), so after a Cloud Run restart
> on a new hostname every restored receipt and acceptance is refused and the slot needs a person again.
> No code names `LKB_CAPTURE_HOST_ID` yet (searched `packages/meeting-bot/src`, `scripts/webinar`, `scripts/native-capture`, `apps/api/src`).
> Files: `packages/meeting-bot/src/capture/workspace/capture-slot-readiness.ts` and its test; at most one start-time call per process that computes the id (see B3-C6). Nothing in `docker/meeting-bot/`
> (the entrypoint and Dockerfile are unit B4 and P1; forwarding the variable into the container is theirs), nothing in `capture-slot-acceptance.ts` except an import if the builder proves it needs one (B3-I2).
> Runner and seam: `vitest` on `capture-slot-readiness.test.ts` (and the existing acceptance test file for B3-C2 c); hostname and platform are varied by stubbing `node:os` `hostname` and `process.platform`
> inside the test, never by an extra production parameter that only tests use [ASSUMPTION: an optional `env` parameter on `captureSlotHostId(env = process.env)` is fine, since it is the production default]. Golden ids in
> tests are computed in the test with `node:crypto` from the stated preimage, never read back from the function under test. A test that stubs `captureSlotHostId` itself proves nothing about this unit.

## Tier and check
Tier L. Trigger (policy, `tick.mjs --route` recomputes it at check time and the checker may only raise): security. The comparison at `capture-slot-acceptance.ts:68` and `:109` is the provenance gate of the person-signed
slot acceptance, and the unit changes what that comparison trusts. `Dual check: required`, with `dual-trigger: security packages/meeting-bot/src/capture/workspace/capture-slot-acceptance.ts:68` in the manifest. The .10-7
small-change waiver does NOT apply: the unit changes the security behaviour of the binding. Unit checks run no full suite; the pre-push check is the behaviour-scoped set plus collection (.13-1).
Verify the facts below in the tree at check time; they were read at checker head `e6fa7d87` and are identical on `wave/b4-recorder-state`, `wave/b10-failure-alert-mail`, `release/kb-golive` and `docs/cloud-run-golive`.

## Criteria
- **[B3-C1]** Stable id under the setting. With `LKB_CAPTURE_HOST_ID` set to a valid value V, `captureSlotHostId()` returns the same 64-hex string for any two hostnames (at least three distinct stubbed values), repeatedly,
  and the string equals `sha256(JSON.stringify(["lkb-capture-host-id", V, process.platform]))` computed independently in the test [ASSUMPTION: this preimage; the point is that it is a domain-separated hash of V and the
  platform, never V itself, so the receipt keeps its 64-hex shape (`capture-slot-readiness.ts:37`) and never contains the raw setting]. Platform stays part of the id: the same V under two stubbed `process.platform`
  values gives two ids (it keeps today's property that a record from another OS is not accepted).
- **[B3-C2]** A record survives a restart. (a) A real receipt written through `createCaptureSlotReadinessObserver` (browser evidence kind, the existing test fixture style) with hostname A and setting V is accepted by
  `validateCaptureSlotReadiness` and listed by `listCaptureSlotReadiness` when read back under hostname B and the same V (new `hostname()` value, new process state). (b) The same read under hostname B and NO setting
  is refused. (c) Through the existing acceptance test harness, a signed acceptance published under hostname A and V is honoured by `createCaptureSlotEvidenceAcceptor` under hostname B and V, and refused under B without the
  setting. The builder shows (c) with the real acceptor and the real registry files; if the existing harness cannot run it in the checker's shell the result is NOT-MEASURED, never PASS.
- **[B3-C3]** Without the setting, exactly as today. With the variable absent (the property not present in the environment object), `captureSlotHostId()` returns `sha256(JSON.stringify([hostname(), process.platform]))`
  byte-for-byte for at least three hostname/platform pairs, with golden values computed in the test; a receipt written before this change (a fixture built with the old formula) is accepted by validate, list and
  the acceptor under the same hostname; every existing assertion in `capture-slot-readiness.test.ts` and the acceptance and workspace tests passes unchanged (no edited or deleted assertion).
- **[B3-C4]** No fallback, no second id. Two different valid values give two different ids; V gives an id different from the no-setting id on the same host. A receipt or acceptance written under V1 is refused under V2,
  refused with no setting, and a receipt written with no setting is refused under V. The unit never accepts "either the override id or the hostname id": the check compares to exactly one id per process. Consequence recorded,
  not a defect: switching a deployment onto the setting orphans the receipts and acceptances written under the hostname id, so the slot is re-accepted once (fail closed). The unit adds no migration.
- **[B3-C5]** A bad value is refused loudly at start, never replaced. Bad means: empty string; only whitespace; any leading or trailing whitespace; longer than 64 characters; any character outside
  `[A-Za-z0-9._-]`; first character not a letter or digit [ASSUMPTION: this pattern, `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`, chosen to match the house `sessionId` shape at `capture-slot-readiness.ts:36`; the value is hashed
  and the hash is the only thing that reaches a file name (`capture-slot-acceptance.ts:30,79`) or a receipt, but a value that could read as a path must still never be accepted]. The test table covers at least: `""`, `" "`,
  `"\t"`, `" prod"`, `"prod "`, a 65-character string (and a 64-character string that IS accepted), `"a/b"`, `"a\\b"`, `"."`, `".."`, `"../x"`, `"a\u0000b"`, `"a\nb"`, `"prod:1"`, `"prod 1"`, and a non-ASCII string.
  For each: `captureSlotHostId()` throws (never returns the hostname id), the start-time check of B3-C6 makes the process exit non-zero before it reads or writes any readiness, acceptance or profile file, and the message names
  the variable `LKB_CAPTURE_HOST_ID` and the reason class (empty, blank, whitespace, too long, bad character) but does NOT echo the raw value. No trimming, lower-casing or truncation anywhere: `Prod-1` and `prod-1` give two ids,
  `" prod"` is refused, not trimmed to `prod`.
- **[B3-C6]** Start-time refusal in every process that computes the id. The processes that call it today: the scheduler runtime (through the acceptor and `listCaptureSlotReadiness`, `scripts/webinar/scheduler/deps-runtime.mjs:12-13,64,80`),
  the capture path (`packages/meeting-bot/src/capture/workspace/tab-session-workspace.ts:95`), the native-capture host (`scripts/native-capture/server.ts:39`) and the API host that publishes a person's acceptance
  (`capture-slot-acceptance.ts:68`). The unit exports ONE validator the start code of each calls (name [ASSUMPTION]: `assertCaptureHostIdSetting(env)`), and the check reads where each call site is. A process that
  computes the id without having called the validator is a finding. Where the start code lives in a file another unit owns (`deps-runtime.mjs`, `docker/meeting-bot/entrypoint.sh`), the unit does not edit it: it files
  `CORE-REQUEST: <file> <what>` in the manifest (policy .9-13) and the validator also runs lazily inside `captureSlotHostId()` so a missed call site fails on first use, never silently.
- **[B3-C7]** What the binding protects stays protected; the override does not widen acceptance. (a) The refusals of B3-C4. (b) Same V, but a different issuer key or a registry the signing never saw: the acceptor returns
  false (HMAC, `capture-slot-acceptance.ts:119-120`), so a receipt copied from another deployment that happens to share V is still not accepted. (c) Every other binding still refuses what it refused: another `tenantId`,
  `slot`, `profileDir`, `recordDir`, `platform`, a `fixture` evidence kind, a missing or mismatching durable media origin, a newer failure marker (`capture-slot-acceptance.ts:32-44,109,121-123`): at least one
  test each, with V set. (d) A receipt whose `hostId` is the raw V, or any non-64-hex string, is still rejected (`capture-slot-readiness.ts:37`).
- **[B3-C8]** Logging. The value is not a secret. It may appear in a log line, once per process start (the setting name, the value, the resulting id), and the 64-hex id may appear anywhere a receipt field may. A refused
  value never appears in any log or error text (log injection and path-looking text): only its length and the reason class. No other secret, key id or issuer key material is added to that line. The test captures
  console and the thrown message for the B3-C5 table and asserts the raw value is absent.
- **[B3-L1] [LIVE-ONLY, not a unit criterion]** After a real Cloud Run restart that changes the hostname, the restored slot is still ready and counted by the scheduler with no person step. This is the second half of live
  check row 7 and is proven by unit B9 and the P1 container work; this unit supplies the mechanism only. Recorded here so the contract does not claim it.

## Invariants
- **[B3-I1]** Receipt shape unchanged: still `version: 1`, exactly 15 keys, `hostId` 64 lowercase hex (`capture-slot-readiness.ts:34-37`); no new field, no schema or migration, no new file in a profile or record directory.
- **[B3-I2]** The acceptance gate is unchanged. D-243 does not authorize any change to the slot acceptance gate (the open question P2). `capture-slot-acceptance.ts` has zero changed logic lines in this unit's diff; the
  acceptor and `publishCaptureSlotAcceptance` pick the new id up only through `captureSlotHostId()`. A needed edit there is a STOP and a question, not an edit.
- **[B3-I3]** No new file or duplicate function: the override is added inside `captureSlotHostId()` in place (edit-in-place rule); the validator lives in the same file. Files touched are the ones named above and their tests.
- **[B3-I4]** The `hostId` of `packages/meeting-bot/src/capture/tiles/` (a sampler-clock identity, `registry.ts:80`, `native-measurement.ts:13`) is a different concept and is not touched or reused.
- **[B3-I5]** Consent code is untouched (D-210).

## Out of scope / ignore
Forwarding `LKB_CAPTURE_HOST_ID` into the container (entrypoint, Dockerfile: units B4, P1); the Cloud Run variable itself, Secret Manager and compose (unit B5, needs a dry run and Umesh's yes); the two-slot scheduler (B9, P1);
how a slot becomes ready with no person (P2, a question for the Approver, D-243 item 3); any change to `capture-slot-acceptance.ts` logic; the bot's `LKB_CALENDAR_WORKER_HOST_ID` (a different setting with its own use at
`scripts/webinar/calendar-attendance-source.mjs:102,142`); the real restart (B3-L1).

## Needs the Approver
1. **Is the override allowed to be operator-asserted?** Today the id is derived from the machine, so a readiness record can only be valid on the machine that observed it. With the setting, the id is whatever the
   operator types, so a profile tar copied to another deployment that uses the same value would pass the host comparison. The checker could not tell from the code or from D-233 why the binding exists beyond the error text
   "stale, foreign or synthetic" (`capture-slot-acceptance.ts:68`); no entry in `docs/DECISIONS.md` states the threat it answers. What still blocks a copied profile is the HMAC issuer key inside the profile
   registry (B3-C7 b), which a person who has the tar also has. Recommended default (taken by the contract until he objects): accept it, use a deployment-unique value (never the same value for staging, production and a
   laptop), and treat the binding as protection against accidental carry-over, not against a determined holder of the profile. Reply words: "B3: override accepted" or "B3: keep machine-derived, find another way".
2. **Which process publishes the slot acceptance in the hosted layout?** `publishCaptureSlotAcceptance` reads the receipt from the slot's profile directory and compares the host id in the process that runs it
   (`capture-slot-acceptance.ts:66-68`). If the API host that runs the "roles:manage" step is not the recorder's container, it neither shares that directory nor, today, the recorder's hostname. The contract only requires
   that every process that computes the id sees the same setting; whether the hosted layout lets that step work at all is a P2 / B9 design question and is not decided here.
3. The production value of `LKB_CAPTURE_HOST_ID` is chosen at B5 with the other settings; it needs no decision from him unless he wants to name it.
Enabling the setting on a deployment that already has accepted slots makes them need one fresh acceptance (B3-C4). That is the safe direction and is noted so nobody is surprised.

## Stop rule
One acceptance check per unit, fixed before the work (dual: two blind coordinators). A finding outside B3-C1 to C8 and B3-I1 to I5 is filed in the ledger, not built. A security-class finding (B3-C4, C5, C7) opens a unit at any
round count. Two failed checks go to Umesh as a decision.

## Amendment log
- 2026-11-25 · routine · created by the checker from D-233 item 6 and D-243 item 2 (instruction: write the B3 contract). Design-read facts verified against the code: the formula and line range, the 64-hex rule and the callers
  were confirmed; the claim "Cloud Run changes the hostname per instance" is a platform fact that cannot be read from the repo and is taken from D-233 (not verified here). Two things the read left out are now criteria:
  the id is also part of the signed acceptance key and the acceptor's comparison (so B3-C2 c and C7), and the API-host and native-capture callers must see the same setting (B3-C6). [ASSUMPTION] tags kept: the preimage, the
  accepted character set and 64-character limit, the validator name, an optional `env` parameter, one start-time log line.
