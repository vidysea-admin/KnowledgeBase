# Capture operational acceptance tooling — maker packet

Status: checked-PASS (scoped offline tooling only), cycle 2; parent tasks remain in_progress and actual operational acceptance remains HOLD.
Handshake status: checked-PASS
Unit: capture-operations-acceptance, fix cycle 2. Priority tier: 3 (T-034/035/051 acceptance support).
Root: C:/Users/product/Desktop/KnowledgeBase
Base and current candidate commit: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; candidate additionally includes the three new untracked scripts below. All three paths were absent before this unit; no base files existed.

## Candidate pins (SHA256)

- scripts/qa/capture-operations-acceptance.mjs: 574b2dad2838c2a115398888bdac041fa8ed6f3776527b5f819c8e68b0d29f18
- scripts/qa/capture-operations-evidence.mjs: b4adbfb08254b9fd2e45be0c4831f2ea5699dbaa84f81ad4aab4e49e863c38b1
- scripts/qa/capture-operations-acceptance.test.mjs: 28b86f190f0a3473eb7f5bd189015b6b35edcfce77daf17abf5b18d26599699d

## Scope and behavior

New standalone read-only Node CLI and pure functions. No existing producer, consumer, scheduler, native browser, service or pipeline path changed. This tool does not activate anything or write task status. CLI emits JSON and exits 2 for HOLD, 0 only when every required gate is VERIFIED. No bundled evidence or trust defaults exist.

Required gates: sustained >=3600-second decoded audio/video, <=720 height and <400,000,000 bytes/hour; two concurrently overlapping isolated capture sessions with distinct profile/artifact identities; >=604800 seconds continuous unattended observation with no recorded coverage gaps and independently reviewed alert receipt; actual Windows and separate Ubuntu host/controller restart plus playable recovery and owned cleanup. Measurements, exact candidate/environment/tenant/host/platform/session identity and artifact SHA256/byte lengths are jointly signed.

Each gate requires Ed25519 native producer and independent reviewer receipts. Receipt body fields: keyId, kind (native-observation or independent-review), payloadHash, binding. Signature is base64 Ed25519 over UTF-8 canonical(body), recursively sorting object keys. payloadHash is SHA256(canonical({id,binding,measurement,artifacts})). Trust is separately provided by the operator, never read from the evidence bundle: version 1, keys[] with id, role, algorithm=ed25519, publicKeyPem, SHA256 of exact PEM bytes, distinct principal identities; producer hostId/platform, reviewer allowedHosts[]. Distinct key ids, PEM hashes and principals are mandatory.

Upstream prerequisite: an actual native collector must inspect real media, capture/cleanup identities and runtime observation/restart logs, then issue producer receipts under its independently configured host key. A different authorized reviewer must inspect the actual evidence and sign the same bound payload. This unit does not install those issuers or invent their receipts. Merely setting synthetic:false or independent:true cannot satisfy the tool. External trust-policy authorization and issuer honesty are the authenticity boundary: offline signatures establish provenance under supplied trust, not empirical truth. Operator must provide independently approved trust; attacker-controlled policy plus matching private keys is not independent evidence.

CLI: node scripts/qa/capture-operations-acceptance.mjs --bundle <bundle.json> --trust <independently-approved-policy.json> --evidence-root <directory>
JSON files <=1 MiB; <=16 gate records and <=16 artifacts/gate; artifacts confined to explicit physical root, regular single-link files, <=512 MiB each and <=1 GiB aggregate. No provider/network/database/browser/process/service mutations. Artifact hashing reads file content; do not point at active recordings.

## Required verification

Focused command (verification broker only): node --test scripts/qa/capture-operations-acceptance.test.mjs
No tests executed by maker. Tests assert default HOLD, all five mandatory gates, no parent status mutation and cryptographic role/payload/identity/unknown-key refusal. Cycle 2 adds a complete correctly signed local-policy fixture and executable future/outside-gate/reversed nested-tab interval regressions. These are explicitly fixture evidence, never native operational evidence. Existing production consumers are unaffected; no immediate production downstream exists. The standalone CLI's missing-input refusal is the downstream interface.

## Historical receipts and cycle 2 regression

Cycle 1 broker actual 3/3 tests passed: qa/goal-vectorless-2026-10-15/verification-capture-operations-fixtures-20261015T1200.json and adjacent stdout. Earlier expected8 metadata was stale, not an actual count. Cycle 1 independent static review FAIL: qa/verdicts/capture-operations-acceptance.md. Found: two signed tab intervals may overlap in 2099 while the gate ends in 2026; nested intervals were not contained by the gate interval and only gate end was compared with now. Checker probe operations-review/probe.mjs was UNEXECUTED and must never be counted as RED evidence.

Root authorized cycle 2: write executable signed regressions, obtain actual broker RED before repair, then fix containment/nonfuture/ordering and obtain attributable GREEN. Expanded test SHA remains 28b86f190f0a3473eb7f5bd189015b6b35edcfce77daf17abf5b18d26599699d. Attributable broker RED: qa/goal-vectorless-2026-10-15/verification-capture-operations-temporal-red.json, adjacent stdout/stderr; exit1, 8tests/5PASS/3FAIL, 356.706ms, no pin drift. Source acceptance hash at RED was unchanged28e44a4af803a66237187f08951d1933334d1f379a679c46e693673c9cd1574f. Future2099/before-gate/after-gate refusals failed as expected; positive baseline and reversed-order refusal passed.

Only after actual RED, repaired gateBehavior: every gate end must be nonfuture; each nested tab has canonical strictly positive event order and must start at/after gate start, end at/before gate end and end at/before now. Mutual overlap and distinct identities remain required. No cryptographic, trust-policy or issuer behavior changed. Attributable GREEN: qa/goal-vectorless-2026-10-15/verification-capture-operations-temporal-green.json and adjacent stdout/stderr; exit0, same exact eight-test corpus 8/8 PASS, 574.774ms, no pin drift. No source changes or additional run after GREEN. No new checker dispatched by maker.

Prior checker debit must be carried forward: committed150s/5200tokens review +30s/800tokens finalization =180s/6000tokens BOOTSTRAP_REVIEW. Actual tokens/cost/active-time unknown; ratio unverified. A fresh finite assess and root admission are required before any next checker; maker does not dispatch one.

Root authorized additional120s/3000tokens repair re-review, cumulative300s/9000tokens including prior180s/6000tokens. Admission helper /root/capture_delivery_coordinator/products_ocr_gaps received GREEN receipt and exact source pins for fresh finite assess and fingerprint checks. This is a budget authorization, not measured usage or a checker verdict.

## Maker close-out — cycle 2

Read back and independently parsed qa/verdicts/capture-operations-acceptance.md: Verdict PASS, Cycle checked 2, reviewed scoped candidate2ce9b1298e30460f1fcf05701a8e91254b096b29a1faf925180daff307d3a6af. Compared candidate identity with operations-review/cycle2-admission-input.json and freshly SHA256-hashed all three current scripts against its exact source_pins; all3 match. This candidate identity is an ordered scoped file-pin digest, not a Git commit. No source/test changes or test reruns during close-out.

Independent PASS applies only to three-script offline evidence tooling and temporal repair. Actual signed regression RED5/8 then GREEN8/8 preserved above. Historical cycle1 FAIL remains operations-review/cycle1-verdict-preserved.md; historical checker probe remains UNEXECUTED. Final accounting remains cumulative committed300s/9000tokens, allocation charges only; actual maker/checker time/tokens/cost unknown and ratio unverified. Actual native capture/seven-day/alerts/Windows/Ubuntu acceptance remains HOLD; T-034/T-035/T-051 not closed. No operational activation or release claim.

Applicable instructions: AGENTS.md definition-of-done evidence requirements; maker/SKILL.md forbids converting scoped evidence into whole-parent acceptance; TASKS.md T-034/035/051 and docs/webinar-release.md retain genuine media, observation and actual-host gates. No qa/contracts edits. No operational proof has been supplied or verified.

Maker actual usage: token/cost and active seconds unknown; do not infer ratios from wall-clock waiting. Checker must load C:/Users/product/.agents/skills/checker/SKILL.md and use bounded bootstrap review if dispatched after broker success. No reviewer dispatched by maker.
