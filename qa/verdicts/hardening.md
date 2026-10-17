# Verdict: hardening (lane/w17-hardening)

VERDICT: FAIL
Cycle checked: 1
Reviewed SHA: 648b06669fb80ecd970a7b5d1ba20bb87d19eae4
Base SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Checker: independent checker (Opus 5.5), fresh context, 2026-10-17
ISSUES-WRITTEN: none

The lane FAILs on one narrow, mechanical defect in commit 9d05aaec: the whole files are converted from LF to CRLF. Its logic is correct. Fixes 1 and 2 PASS on their own.

## Identity
- `git rev-parse HEAD` in the lane gives 648b0666... on branch lane/w17-hardening. The tree is clean apart from this checker's evidence dir.
- Manifest qa/manifests/hardening.md: Status ready-for-check, Fix cycle 1.
- Commits from base to candidate: 561036c3, e5f5fbf4, 9d05aaec and 648b0666 (manifest).

## Sub-verdict 1: 561036c3, T-007 direct publishApprovedMessage tests. PASS (with a note)
- The diff adds 43 lines to the test only. No product code changed.
- `node --test --test-force-exit --import tsx src/native-evidence/message-publication.test.ts` (apps/api) ran 15/15 pass, exit 0, 13 s.
- Mutation M1 deleted the gate at apps/api/src/native-evidence/message-publication.ts:47 (`if (false && ...)`). It killed 2 tests: the new direct "consent record absent" test and the existing "consent record absent: approval is refused by the publication gate". The direct given:false and withdrawn tests survived. That confirms the maker's admission.
- Judgement: this is acceptable coverage at function level. The tests prove that publishApprovedMessage refuses all three states with checkEvidence bypassed, which was the intent of the goal-t007-consent-negatives-w16 recommendation (upstream layers dropped). They do NOT prove the line-47 gate itself for false or withdrawn, because claimVisible (knowledge.ts:46/154, reached at :57) also refuses.
- Low note: the comment in message-publication.test.ts directGate says "only the gate's own read can refuse". That is inaccurate, because claimVisible also reads sources through the same proxy. There are two possible fixes. Either correct the comment, or make the proxy return a consented row for source reads numbered 3 and above. The second option isolates line 47 for all three states with no module stubbing. This note is not blocking and was not filed.

## Sub-verdict 2: e5f5fbf4, ISS-ALERTTENANT-001. PASS
- The diff is really one line: `git show --stat` gives 1 insertion and 1 deletion. The file has 0 CR bytes at base and 0 at candidate, both i/lf, so there is no EOL churn.
- **"Already fixed at base": confirmed.**
  - The ISS-ALERTTENANT-001 test already exists at base (test.mjs:87).
  - start-record-detached.ps1, scheduled-dispatch.ts and state/schedule-dedup-state.ts are byte-unchanged from base to candidate.
  - -Job routes through record-scheduled, then runScheduledDispatch, then readScheduledJob. That calls assertTenantTag (schedule-dedup-state.ts:199).
- **D-015 replay.** The row records two cases in prose with no command: an untagged job file and an other-tenant job file. Both are replayed through the real PowerShell -Job path (tenantId undefined and "foreign-tenant").
  - Full file run: `node --test --test-force-exit scripts/webinar/start-record-detached.test.mjs` gave 6/6 pass, exit 0, 94 s.
  - The test file uses an argv-dump fixture and a stub record callback. It never launches a real recorder or OBS. I read it before running it.
- **Normalisation.** `.replace(/\s+/g," ")` only collapses whitespace, and the assertion is still status != 0 with no argv dump.
  - Mutation M2b changed the ps1 message to "refuses some recording arguments". The test was killed ("did not match").
  - So a different message cannot pass.
- **Mutation M2** replaced assertTenantTag with `parsed as Record<string, unknown>`. The ALERTTENANT-001 test was killed.
- **Ledger.** ISS-ALERTTENANT-001 (qa/issues.alerttenant.jsonl) may flip open to verified. ISS-ALERTTENANT-002 and -003 stay open, because nothing in this lane touches them.

## Sub-verdict 3: 9d05aaec, private-acl F-1 retry. Logic PASS, commit FAIL (EOL churn)
**Logic.** I read packages/meeting-bot/src/capture/record-consent/private-acl.ts:53-60.
- launch() is called once.
- A second call happens only when `error.code==="ETIMEDOUT"`.
- After that, the same gate as before applies: error, non-zero status, non-string or oversized stdout all throw nativeUnavailable, then the JSON parse and validatePrivateAclSnapshot run.
- There is no accept path without a successful, validated ACL proof, and there is no third launch.
- spawnSync kills and reaps the timed-out child before returning, so two children never overlap.

**Checks.**
- `node --test --test-force-exit --import tsx src/capture/record-consent/private-acl.test.ts` (packages/meeting-bot) gave 3 pass and 1 skip (the real-probe test, which needs an env var), exit 0.
- Mutation M3 returned on the second timeout ("accept"). Killed: the retry test and the bounded-time test both reported "Missing expected exception".
- Mutation M3b added a third launch. Killed: the retry test.

**Worst-case time.** Each verifyPrivate* call now takes up to about 10 s plus two PowerShell cold starts, against about 5 s before. This blocks the event loop because it uses spawnSync.
- Callers are all fail-closed preflights, and none has a tighter deadline wrapped around it.
- Affected callers: controller-bridge.ts:27/29/65, windows-capture-clock.ts:97 (directory plus artifact, about 20 s), registry.ts:156 plus the per-artifact checks, native-capture-runtime/archive/authority.
- The t011-live-consent-orchestration verdict proposed this exact option. I find the timing acceptable.
- Low notes:
  - The diagnostic `deadlineMs:5000` (private-acl.ts:18) now understates elapsed time, which can reach about 10 s.
  - The mirror copy apps/api/src/bot-privacy/private-acl.ts was byte-identical at base and is not updated, so the two copies now diverge.

**FINDING F-EOL (blocks merge).**
- What changed: commit 9d05aaec rewrites both files from LF to CRLF in the index.
  - private-acl.ts: 0 CR bytes before, 64 after.
  - private-acl.test.ts: 0 CR bytes before, 70 after.
  - `git ls-files --eol` gives i/crlf, while every sibling in record-consent/ is i/lf.
- Effect: the real change is 5 lines in private-acl.ts (`git diff --ignore-cr-at-eol`), but the commit shows 125 lines changed. The test file shows 117 lines instead of 23. That noise will conflict with any lane that touches these files.
- Likely cause: system gitconfig `core.autocrlf=true` at checkout, repo `.git/config` false at commit.
- **Fix:** rewrite both files with LF bytes and commit. Then `git diff --stat 9e55b642 -- packages/meeting-bot/src/capture/record-consent/` must show about 5 and 23 lines, and `git ls-files --eol` must show i/lf. Do not change the logic.

## Mandatory checks (the maker skipped tsc)
- `tsc --noEmit -p tsconfig.json` in apps/api: exit 0, no output, 64 s.
- `tsc --noEmit -p tsconfig.json` in packages/meeting-bot: exit 0, no output, 40 s.
- Node v24.19.0, from the codex runtime.

## D-020 mutation safety
Every mutation ran through qa/verdicts/hardening-evidence/mutate.sh:
- a byte backup taken per mutation;
- a trap on EXIT, INT, TERM and ERR;
- `timeout 600`;
- a sha256 check of restored bytes against the pre-mutation bytes;
- a CR-stripped comparison against the HEAD blob.

All five targets were restored to their pre-mutation bytes.
- private-acl.ts: hash-object equals the HEAD blob (31e6779e).
- The three LF-blob files show a hash-object different from HEAD. That difference is pre-existing in the lane's CRLF working-tree checkout, and the content matches HEAD exactly once CRs are stripped.

## Ledger
- ISS-ALERTTENANT-001 may flip to verified.
- T-007 stays in_progress. This is test-only and does not close the parent.
- The private-acl F-1 note (t011 verdict) may be marked addressed only after F-EOL is repaired and re-checked.

## Not verified
- The real Windows ACL probe was skipped (LKB_PRIVATE_ACL_PROBE_DIR not set).
- Live timing on a loaded host.
- The maker's own mutation evidence was not reused.
- Checker/maker ratio: maker usage is unknown, so this is BOOTSTRAP_REVIEW with the ratio unverified. Checker scope was escalated finitely under the dispatch brief (3600 s / 200k). Actual token totals are unknown and recorded as null.

## Evidence
All in qa/verdicts/hardening-evidence/ (untracked):
- t1/t2/t3 logs and .exit files
- tsc-api and tsc-bot logs and .exit files
- M1, M2, M2b, M3 and M3b logs
- metrics-phase1.json and metrics-phase2-finalization.json, with their assess outputs (exit 0)
