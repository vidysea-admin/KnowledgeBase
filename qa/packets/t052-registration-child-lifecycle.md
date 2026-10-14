# Checker packet — t052-registration-child-lifecycle, cycle 1

Repository: C:/Users/product/Desktop/KnowledgeBase. Skill: skills/checker/SKILL.md. Manifest: qa/manifests/t052-registration-child-lifecycle.md. Verdict ownership: independent registration_checker, qa/verdicts/t052-registration-child-lifecycle.md only. Ground truth: qa/contracts/gmail-meeting-candidates-approval.md Amendment5 CL1–CL4/CLI1. No whole T-052 acceptance inferred.

## Provenance / paths

Base HEAD `4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd`. Two tracked files changed, no new application files:

| Path | Original Git blob | Final SHA256 |
|---|---|---|
| packages/meeting-bot/src/joiners/browser-joiner.ts | e20159f0326cb246c9894b4417dab9c0a89a3d2b | 9DA7B3B23C30D3F8CF1CCE400C448517014F2DF2C3BECB34963AE71D3DB19F8D |
| packages/meeting-bot/src/joiners/joiners.test.ts | 761acf437055f52cebc569288fc46630e5cd9322 | 9B0DFA6FD29B8C0539A1F4D68DE25503437BD949604EAA4D3C7FAE25A26362C7 |

Exact patch: `git diff -- packages/meeting-bot/src/joiners/browser-joiner.ts packages/meeting-bot/src/joiners/joiners.test.ts`. No prior base existed for this manifest/packet. Checker-owned Amendment5 contract SHA2566ED2B9F05CB5FE41BCF0C49E68AB0E240C0A01D43A43BE72BA86150EBA480909.

## Change and consumer map

- registerInBrowser child.close accepts `(code,signal)`, requires code0/no signal, and scans all complete output rather than reverse-selecting a stale result. Fatal events dominate; malformed and duplicate registration events invalidate the protocol. Missing/invalid/failed terminal routes invoke existing abort cleanup. `if (aborting || finished) return` preserves single settlement.
- Existing abort path first waits up to5s for child close, then invokes configured Python/script with exactly about:blank/profile/title/stop-file/cleanup-only, timeout20s/maxBuffer65536. Cleanup refusal or absent observed child close yields owned_cleanup_failed. No process enumeration or unrelated-profile termination added.
- Python producer unchanged, packages/meeting-bot/py/sb_join.py: registration-result emitted inside recorder_link/SB contexts; exceptions after emission can emit fatal+exit1. Read just relevant main registration branch and __main__ exception handler.
- Immediate consumer packages/meeting-bot/src/calendar/auto-record-policy.ts runWebinarRegistrations persists submitting before register; maps submitted→awaiting-confirmation, action_required→action_required, all uncertain failures→uncertain; existing sourceId guard prevents retries. Caller scripts/webinar/run-pipeline.mjs supplies createBrowserRegistrationExecutor and durable update.
- Downstream tests scripts/webinar/run-pipeline.test.mjs first two registration tests: persistence rejection and four result branches/restart no-resubmit. Unchanged consumer SHA256B7CAD72276E4D10FB2813A9FA9537C41163B2539A8DBA37C25905E5FE1BABEB3; downstream-test SHA2562B2D0549E6FD1E6AEBD2175DC3EC1EFCEEE840E142F32089FC1EF5852C58F300 at maker checks.

Security flags: external-data-write lifecycle/owned-process cleanup YES; auth/tenancy/credentials are existing boundaries, unchanged. URL/operator remain JSON stdin only; stderr diagnostics discarded; results include sanitized fixed protocol reason only. No real organizer/operator information used by fixtures.

## Checks / execution facts

Exact original-red, repaired-green and downstream commands/counts/durations are in manifest. Controlled fixtures write temporary Node .mjs children, using process.execPath as injected interpreter; no Python browser module starts. Cases are clean, nonzero, signal, fatal, duplicate, malformed, missing and cleanup-fails. The original unsafe7-case floor is unchanged. Node aggregate includes one parent test, hence nine total results.

Canonical HIGH issue ISS-379 records those exact seven unsafe cases in qa/issues.jsonl; replay the ledger's recorded command/corpus and report ISS-3797/7. Six previously returned submitted; missing returned uncertain but skipped cleanup. Raw original-red stdout is preserved only in tool transcript, not falsely attributed to a disk artifact.

Known default-sandbox Node runner spawn EPERM: request required escalation directly for those exact commands; saved approvals exist for the two maker commands. Tests have --test-timeout15000, concurrency1; use coordinator runtime_inventory light slot and outer120s bound for any independent command. Approval waits release slots. Do NOT select existing 'registration actual child timeout' test, which invokes SeleniumBase and is outside this no-browser scope.

Verifier receipt reused from integration: command+exit0+0.133968s and vacuous stdout preserved in qa/evidence/execution-wave1-integration-validator.{receipt.json,stdout.txt}. Frozen verifier SHA2561240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3; contracts.json SHA256D31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940. This does not establish browser or frozen-contract semantic acceptance.

Independent supplied probe: data/registration-checker-probe.mjs, checker-owned, accepts root argument. Maker has neither edited nor run it. Expected checker proves positive unique clean submitted/uncertain/action_required/progress, failed terminal/protocol/timeout/output/cleanup boundaries and durable consumer. Recheck pins before verdict. No git commit, protected decision writes, tracker task closure, provider/browser/database execution or broad test suite authorized here.
