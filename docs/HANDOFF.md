# HANDOFF — 2026-11-25 (read this first in the next Claude Code session)

## Plan of 2026-11-25 (D-227): the single tracker

- Plan file: `C:\Users\Lenovo\.claude\plans\meeting-bot-imperative-starfish-of-3fb8d78b-cac7-406e-9e13-fe76f3d5cd42.md` (approved by Umesh on 2026-11-25, decision D-227).
- Rule: a row's state changes to PASSED only when its check passed on the real deployment; the date goes in the last column.

### Stage 0 (unblock)

| # | What | State |
|---|---|---|
| 0.1 | gcloud sign-in | NOT NEEDED (already signed in as the product account). |
| 0.2 | rights check | DONE 2026-11-25. Granted: Cloud Run services, jobs and worker pools; the full load-balancer resource set; Cloud Build builds; Secret Manager; bucket creation; service accounts. Denied: project-level storage.objects.create (bucket level untested). Untested: cloudbuild.buildTriggers.update. So B5 and C5 are ours (L5 is deferred by D-228); F0's trigger change is ours if the update is allowed, else the vendor's. |
| 0.3 | vendor mail 1 | DONE 2026-11-25 13:08 IST. Short status reply sent on Umesh's "send" (Gmail message `1a211a4247c7562f`, to the vendor helpdesk, cc Manish): public link is down, the `kb` DNS request is cancelled, one ask = the AWS redirect (D-228). Old unsent draft deleted. |
| 0.4 | fetch | DONE. origin/master is still ce5cef49; local master is 19 commits behind it; the release chain (tip a9bbeb98 when checked) was 5 commits ahead of origin/master. The pinned launch commit is 40a0bc76. The head of `release/kb-golive` has moved on to 6df8934c (merges of D4, F0 and D2; not pushed); structure lint is green on it since 2026-11-25 and the push now waits on GitHub write access (see "Gates that need Umesh"). |
| 0.5 | decision entry | DONE (D-227). |
| 0.6 | three pending handshakes | CLOSED on disk (sweep 2026-11-25): the three handshakes are checked-PASS in the working tree (ua-web-unverified-login, vector-gap-durability, kb-password-min8-release; files of the Codex session, not committed). No check or fix is owed. The stop hook still counts 5 old HOLD verdicts that wait on live evidence or an owner decision (goal-t013, goal-t045, goal-t057, goal-t058, goal-u32) and 1 stale manifest (u2-4-phase3-precision-regate; left as it is, it has its own pause file). |
| 0.7 | Codex note | WRITTEN below; Umesh pastes it into the Codex session. |
| 0.8 | free memory | DONE. No leftover test or bot process exists. 3.6 GB of 23.7 GB is free; the large users are VS Code (7.2 GB), Chrome (2.5 GB), Claude Code (1.6 GB), ChatGPT app (1.1 GB). Builder cap stays at 3 to 4. |

The build trigger has an inline four-step config (not an autodetected Dockerfile): pull, build the default target only, push, `gcloud run services update --image`. A master push would replace the two-container revision. Never push master before F0. The trigger fires only on a push to a branch matching `master` (the pattern is not anchored). Feature and release branches do not match. Master is still not pushed.

Status as of 2026-11-25 14:40 IST: nothing has been deployed today. No row below is PASSED.

### Lane table

State changes to PASSED only when the check in the Check column passed on the real deployment. Units with no row in plan section 4 carry their own check from plan sections 6 and 7.

| Unit | Lane | What | Owner | State | Check (plan section 4 row) | Date passed |
|---|---|---|---|---|---|---|
| L1 | Launch | Extend live-verify.mjs with --base and login env names | Claude | checked-PASS (unit `golive-launch-prep`, branch `release/kb-golive`, head 40a0bc76; two blind checkers; verdicts `qa/verdicts/golive-launch-prep.md` and `golive-launch-prep.b.md` on that branch). 11 of 13 criteria pass for L1 and L2 together. Open: L1-C7, the scripted run against the tagged address; it waits on Umesh's yes. Five low findings: ISS-KBGOLIVE-001 to 005. Not PASSED: nothing is deployed. | none (own check: green on test tag; feeds row 1) | |
| L2 | Launch | Key the rate limiter on the user, not the tenant | Claude | checked-PASS (same unit and verdicts as L1, head 40a0bc76). Open: L2-C6, the two-user 429 / 200 probe on the deployed address; it waits on Umesh's yes. Not PASSED: nothing is deployed. | none (own check: unit tests, two-user probe) | |
| L3 | Launch | Build images from L2 head; deploy tagged revision, no traffic | Claude + Umesh's yes | dry run shown to Umesh; waits on his yes (asked as A1). Launch commit pinned at 40a0bc76. Preflight 2026-11-25 (read-only): all 8 needed rights are granted to our account. Secrets `lkb-prod-mongodb-url` and `lkb-prod-ollama-api-key` do not exist yet; they are created in the batch. The tag `kb-login-test` follows latest, so it is pinned to revision `00020-7ss` first. | none (own check: smoke 1-7 on tag URL) | |
| L4 | Launch | Shift traffic to the new revision | Claude + Umesh's yes | dry run shown to Umesh (with L3); waits on his yes (asked as A1). Rollback: traffic back to revision `00015-rbd`. | none (own check: /api/health db ok, root loads) | |
| L5 | Launch | Build the public load-balancer path | Claude + Umesh's yes | deferred (D-228): add-on, only if the name kb.vidysea.com is wanted later | none | |
| L6 | Launch | Cloudflare A record for kb host | vendor (Umesh's yes) | deferred (D-228): needed only together with L5 | none | |
| L7 | Launch | Measure TRUST_PROXY_HOPS with the forged-address loop | Claude + Umesh's yes | waits on Umesh's yes for the `lkb_prod` writes (asked as A2). `mongodump` is not installed on the laptop; install MongoDB Database Tools before the backup step. | none (own check: about 20 refusals then 429) | |
| L8 | Launch | Fresh sign-up approved as viewer; run the row 1 check | Claude + Umesh's yes | waits on Umesh's yes for the `lkb_prod` writes (asked as A2). The backup step needs MongoDB Database Tools (see L7). | 1 | |
| L9 | Launch | Vendor changes AWS /knowledgebase* rule to a path-keeping redirect to the Cloud Run service URL (D-228) | vendor (Umesh's yes on the mail) | asked 2026-11-25 13:08 IST (mail sent, message `1a211a4247c7562f`); waiting for the vendor; no reply yet | 2 | |
| L10 | Launch | Lock ingress to the load balancer; drop tag URL from CORS | Claude + Umesh's yes | deferred (D-228): needed only together with L5 | 1 (again) | |
| LINT | Launch | Structure-lint repair on `release/kb-golive` (unit `structure-lint-repair`, D-237) | Claude | unit check PASSED 2026-11-25 (6 of 6 criteria); manifest closed at commit 437bd02b. Three low issues filed: ISS-KBGOLIVE-006, 007, 008. Pre-push check of the merged branch (`a9bbeb98..b03d4108`, 33 commits): no new failing test (every red is already in `qa/checkpoints/baseline-reds.md`), `pnpm lint:structure` OK, `pnpm typecheck` clean; push gate green at 437bd02b. The push to origin was refused with HTTP 403: the signed-in GitHub account has no write access to the origin repository. The branch is local only, not merged. See "Gates that need Umesh". | none (own check: unit check 6 of 6) | |
| F0 | A | Root cloudbuild.yaml; point trigger at it; then merges | Claude + Umesh's yes | checked-PASS (branch `f0-cloudbuild`, head 36c71ae2); merged into `release/kb-golive` (worktree `.worktrees/kb-golive`, head 6df8934c) with D4 and D2; tests at baseline there (API 2694 pass, 1 known red, 47 skipped; web 1469 pass, 1 known red; typecheck clean). The structure lint is red on that branch; the repair passed its check on 2026-11-25 (see row LINT). Not pushed: the push waits on that repair and on the pre-push check. The live check F0-C5 and the trigger repoint wait on gate question Q5. | none (own check: throwaway tagged deploy keeps both containers) | |
| F1 | A | Waiver defect: full speaker turn as evidence, hold dropped conditions | Claude | checked-PASS 6/6 (branch `wave/f1-waiver-condition`, head f7eb479f). NOT in the launch build. Reason: the production hydrator (`apps/api/src/ask/source-context.ts:198`) returns 1024-byte slices, so fast Ask would hold every answer that cites a turn over 1024 bytes. Follow-up unit F1B (`f1-whole-turn-hydration`, ISS-F1WAIVERCONDITION-001, -002) has its own row below. Row 3 cannot pass before it. | 3 | |
| F1B | A | Whole-turn hydration: the hydrator returns the full speaker turn, not a 1024-byte slice | Claude | first build dropped an over-size cited turn instead of holding the answer; found by review (D-238 item 4; branch `wave/f1-whole-turn-hydration`). Repair built (code f8565d3c); code review Approve; the first of the two blind checks PASSED (verdict commit cb3c9957); the second blind check is running. Not closed, not merged, not pushed. Not PASSED. | 3 (with F1) | |
| F2 | A | Index nine sessions; UCAS timing fix; two replacements | Claude + Umesh's yes | not started | 4 | |
| F3 | A | Retrieval: session diversification in ranking and hybrid arms | Claude | not started | 5 | |
| F4 | A | Web fallback and ISS-454: retry, explicit sessions-only result. Same wave: the Ask-specific per-user cap as its own small unit with its own check (D-229) | Claude | not started. Q6 is answered (D-229): Ask launches with the per-user rate limit only; the Ask-specific cap is built in wave 2 with F4. | 6 | |
| F5 | A | ISS-426 text index, ISS-UAAUTH-001, corpus reconcile, listed issues | Claude + Umesh's yes (ISS-453, ISS-446, ISS-455: Codex) | not started | none (own check: 51-route walk re-run) | |
| B1 | B | Decision entries E1 to E5 for the Cloud Run recorder | Claude | done. Entries landed: D-230 (recorder on a Cloud Run worker pool, one meeting at a time), D-231 (single-slot attendance mode), D-232 (Meet refusal ends the capture as `admission_denied`, with one alert mail), D-233 (state in a bucket tar, lease, host id override), D-234 (registration; blocked on gate question Q3). | none (own check: entries land) | 2026-11-25 |
| B2 | B | Detect Meet refusal early; no zero-byte file | Claude | unit check PASSED 2026-11-25 (branch `wave/b2-admission-denied`, head 95a22efd, 13 of 13 criteria; not merged, not pushed). Decided in D-232. Live check 8 still open: it needs B10 and a real host refusal. | 8 | |
| B3 | B | Host id override LKB_CAPTURE_HOST_ID | Claude | not started. Held until the Codex session commits its uncommitted edits to `scripts/webinar/run-pipeline.mjs`. | 7 (in B9) | |
| B4 | B | Restore, snapshot, lease, shutdown trap, record-once, attendance loop | Claude | first build blocked by a security review before its check (D-238 item 5); repair in progress (branch `wave/b4-recorder-state`). Not PASSED. | none (own check: restarted container still signed in) | |
| B4B | B | Live-proof media object | Claude | not started. Decided in D-236. Starts after B4. | none (own check: set in D-236) | |
| B5 | B | Cloud resources: bucket, secrets, service account, worker pool, job | Claude + Umesh's yes | not started | none (own check: dry-run output reviewed) | |
| B6 | B | Google sign-in for the bot; profile tar to bucket | Umesh | not started | 7 (in B8) | |
| B7 | B | Export gws credentials to Secret Manager | Umesh | not started | 7 (in B9) | |
| B8 | B | First proof: record-once job joins a meeting Umesh hosts | Umesh | not started | 7 (first half) | |
| B9 | B | Single-slot attendance mode: skip slot check unless autonomous | Claude | not started. Decided in D-231. Held until the Codex session commits its uncommitted edits to `scripts/webinar/run-pipeline.mjs`. | 7 (second half) | |
| B10 | B | Failure alert by email when Telegram is unset | Claude | building since 2026-11-25 on branch `wave/b10-failure-alert-mail`, created from `wave/b2-admission-denied` at 063a9b79. Decided in D-232 and D-236. The mail path already exists; the work is the reason lookup plus carrying the failure name from the capture child to the failed row. Built for the default (non-graph) pipeline mode; graph mode is a filed candidate and `LKB_PIPELINE_GRAPH=1` must not be set on the recorder until it is built (D-238 item 3). B2 is closed; B10 no longer waits for B9. | 8 | |
| B11 | B | Calendar in the hosted app via the worker bridge | Claude + Umesh's yes | not started | 9 | |
| B12 | B | Auto-registration in attendance mode; Umesh picks the webinar | Claude + Umesh's yes | not started; held on Umesh's answer (gate question Q3, see D-234): the bot submits a form in his name, and he picks the first webinar. | 10 | |
| C1 | C | Archiver-repo decision: patch, /svc/v1 listener, Cloud Run, key store | Claude | decisions recorded: archiver repo entries D-023, D-024, D-025 on its branch `wave/hosted-service` (worktree `.worktrees/wa-hosted`, not pushed); KB entry D-235. Not PASSED. | none (own check: entry lands in archiver repo) | |
| C2 | C | Baileys companion_reg_refresh patch (unit `wa-baileys-patch`) | Claude | not started; no code yet. Cause of the pairing stall is known: upstream Baileys pull request 2765; our patch is a backport of it. Unit check is written and goes into the contracts next. Reading waits on Umesh (asked as E): the patch sends only the handshake ack. Code may be built; nothing merges to the archiver's main branch before he answers. | none (own check: real phone pairs, no stall) | |
| C3 | C | Minimum /svc/v1 routes, session-key store, Dockerfile | Claude | split into C3A, C3B and C3C below | none (own check: local /svc/v1/health returns 200) | |
| C3A | C | /svc/v1 route surface (unit `wa-svc-surface`) | Claude | building (archiver branch `wave/c3a-svc-surface`; declaration commit c4bb66b3). Unit check is in `qa/contracts/wa-svc-surface.md`. Not PASSED. Reading waits on Umesh (asked as E): the routes take the owner id from the URL path under the service token. Code may be built; nothing merges to the archiver's main branch before he answers. | none (own check: local /svc/v1/health returns 200) | |
| C3B | C | Session-key store (unit `wa-key-store`) | Claude | not started; no code yet. Unit check is written and goes into the contracts next. Same hold on merging as C3A. | none (own check: set in the unit check) | |
| C3C | C | Dockerfile (unit `wa-dockerfile`) | Claude | not started; starts after C2. Unit check is written and goes into the contracts next. Same hold on merging as C3A. | none (own check: set in the unit check) | |
| C4 | C | Database connection and user for the archiver | Claude | not started | none (own check: connection test from archiver) | |
| C5 | C | Deploy the archiver; set three API env settings | Claude + Umesh's yes (or vendor) | not started | none (own check: API health call reaches archiver) | |
| C6 | C | Pin bump here and the section 3 amendment (E6) | Claude | not started | none (own check: pin equals archiver tip) | |
| C7 | C | Scan the QR on the hosted link screen | Umesh | not started | 11 | |
| C8 | C | Groups and tracking routes; scheduled ingest into the knowledge base | Claude | not started | 12 | |
| D1 | D | Real speaker names: roster overlay, speakerLabel in quotes | Claude | not started | 13 | |
| D2 | D | Claims review: machine-checked tier, review route, thresholds | Claude | checked-PASS 6/6 (branch `d2-extraction-harness`, head a23f5656); merged into `release/kb-golive` (head 6df8934c; not pushed, see F0). Two code reviews gave Warning with three high fail-open items; one follow-up fix unit after gate question Q1 is answered. The harness cannot judge row 14 yet: its bar file says `proposed`. | 14 | |
| D3 | D | Counsellor page: multi-turn history on POST /ask, names | Claude | not started | 15 | |
| D4 | D | Championship rehearsal: 92 questions, pairwise judges, win rate | Claude | checked-PASS (branch `d4-pairwise-judge`, head d100eefa); merged into `release/kb-golive` (head 6df8934c; not pushed, see F0). | 16 | |
| E | E | Database hardening: replica-set rehearsal, auth, cutover | Codex (rehearsal tooling); vendor (shared server); Umesh's yes | not started | 17 | |

Owner gate file: `qa/gates/golive-owner-questions-2026-11-25.md`. Q1 to Q5 are open. Q6 is answered (D-229): Ask launches with the per-user rate limit only; the Ask-specific cap is built in wave 2 with F4; a provider spend alert is set on launch day.

### Fixed file order (one owner at a time)

| File | Order |
|---|---|
| `apps/api/src/answer-policy/answer-evidence.ts` | F1, D1, F4 |
| `apps/api/src/answer-policy/answer-workflow.ts` | F4, D4, D3 |
| `packages/ask/src/ask-v2.ts` | F1, F3 |
| `apps/api/src/claims/router.ts` | D1, D2 |
| `scripts/webinar/run-pipeline.mjs`, `run-pipeline-deps.mjs` | B9, B10, B12 |

### Note for the Codex session (Umesh pastes this into Codex)

1. One plan was approved on 2026-11-25 (decision D-227). Plan file: `C:\Users\Lenovo\.claude\plans\meeting-bot-imperative-starfish-of-3fb8d78b-cac7-406e-9e13-fe76f3d5cd42.md`. Tracker: the lane table in docs/HANDOFF.md.
2. Codex owns: `codex/t051-recorder-readiness` (rebase and the colliding D-216); `docker-compose.yml`; `docker/meeting-bot/image.test.mjs`; `packages/meeting-bot/src/capture/record-consent/private-acl*`; the Lane E local replica-set rehearsal tooling; ISS-453 and ISS-446 in `apps/web`; ISS-455 in `packages/ingest`.
3. Claude owns every other file named in lanes A to D, including `docker/meeting-bot/entrypoint.sh`, `docker/meeting-bot/Dockerfile`, `packages/meeting-bot/py/*`, `scripts/webinar/*`, `apps/api/src/**` and `packages/ask/**`.
4. `docs/DECISIONS.md` and `TASKS.md` have ONE writer: the Claude main session. Codex writes the entry text under "Codex lane" in docs/HANDOFF.md and Claude appends it through `scripts/append_decision.ps1`. This avoids the id race (ISS-362). The D-216 on `codex/t051-recorder-readiness` collides with a different D-216 on `docs/cloud-run-golive`: at rebase, drop that DECISIONS hunk and hand the entry text over the same way; it gets the next free id.
5. Claude's unit B4 edits `entrypoint.sh` and the bot `Dockerfile`, which will break five assertions in `docker/meeting-bot/image.test.mjs`. Claude does not edit that file. Claude lists the changed behaviours under "B4 changes for Codex" in docs/HANDOFF.md; Codex updates the test from that list. The five assertions, with line ranges in that file as read on 2026-11-25:
   1. Test "entrypoint has run, doctor and login modes and cleans stale state" (:42-51). Needle `run-pipeline.mjs --run --watch` (:47) and `assert.match(e, /exec node scripts\/webinar\/run-pipeline\.mjs --run --watch/)` (:49) fail once `exec` is replaced by a child process and a loop. Needle `.lkb-tab-capture.lock` (:46) fails only if that line at `entrypoint.sh:32` is removed or renamed.
   2. Test "entrypoint ... BEFORE any daemon starts (ISS-409)" (:65-76). It requires lines that start exactly `pulseaudio -D` and `Xvfb :99` at column 0 (`/^pulseaudio -D/m`, `/^Xvfb :99/m`). Wrapping them in a function or indenting them breaks it. A restore step placed before them must not read `$VNC_PASSWORD` (the test requires every read to come before the `unset`).
   3. Test "removes the VNC pass file when x11vnc fails (ISS-410)" (:78-83). It looks for the literal `trap 'rm -f "$VNC_PASSFILE"' EXIT` before `x11vnc`. A second `trap ... EXIT` for shutdown would replace it in `sh`. So the shutdown trap must be armed only after the login branch, in a different signal slot or a combined handler that still contains that literal text.
   4. Test "Dockerfile sets the Linux bot environment and carries no secrets" (:33-40). It breaks if a new `ENV` line matches `(API_KEY|TOKEN|PASSWORD|SECRET|MONGODB_URL)\s*=\s*\S`, for example a variable named with SECRET and given a value.
   5. Built-image tests (:129-152, skipped unless `LKB_DOCKER_TESTS=1` and `BOT_IMAGE`): "doctor passes" and "doctor gate fails closed when node itself fails" break if doctor mode starts to need a bucket or a lease.
6. Never push or merge to master. The vendor's build trigger deploys on every master push and would remove the web container. Feature branches and draft pull requests only, until F0 lands.
7. Each session edits docs/HANDOFF.md only under its own lane heading.
8. Consent stays out of scope (D-210). No units, issues, checks or questions about it.

### Codex lane

Codex writes here.

### B4 changes for Codex

Claude fills this when B4 is ready for check.

---

## Where things stand
- master = ce5cef49 and it DOES contain d521fec0 (git merge-base --is-ancestor d521fec0 origin/master: yes). It has the go-live build:
  user accounts, Ask, compose fixes D-212/D-213, Docker-only indexer fix (d521fec0).
- Status 2026-11-25 13:50 IST: nothing has been deployed today. The launch commit is 40a0bc76 on `release/kb-golive`. The lane table above is the current state; the older text below is history.
- The public link is DOWN. The vendor stopped VM 34.47.136.12 on 2026-11-23. www.vidysea.com/knowledgebase still 302s to
  https://34.47.136.12:8081/ (dead). kb.vidysea.com has no DNS.
- The Knowledge Base default Cloud Run revision is API-only. The separate `kb-login-test` tag serves both web and API with sign-in against `lkb_prod`. The signed-in UC retest on `00020-7ss` returned exactly the matching speaker and turn, but broadened a school-specific waiver. The external NASA answer passed on `00019-jvc`. Wording candidate `def9078d` is local and failed the final independent check. See D-218 before another release or live Ask. The current release evidence and test link are in [the Cloud Run runbook](DEVOPS-REDEPLOY-2026-11-01.md).
- Maker loop: the pause was lifted on 2026-11-25 for the units of the approved plan only (D-227); `qa/.paused` is removed. Work outside the plan stays stopped. Decision entries and `TASKS.md` are written by the main Claude session only, which sidesteps the id race in ISS-362; the fix for ISS-362 itself still needs Approved-by.

## Decision
- D-215 (2026-11-24) supersedes D-214: go-live on that Cloud Run service as ONE service, TWO containers (web ingress + api sidecar
  on 127.0.0.1:3300), built from the root Dockerfile by the vendor's Cloud Build trigger from master.
  [Changed by D-228, 2026-11-25: the launch address is the Cloud Run service address. The load balancer and the name kb.vidysea.com
  are deferred (L5, L6, L10). The AWS ALB /knowledgebase* rule is to become a path-keeping redirect to the Cloud Run service address (L9).]
  No code change. Runbook: docs/DEVOPS-REDEPLOY-2026-11-01.md, section "Cloud Run go-live (D-215...)". Topology: docs/HLD.md section 5.

## Next steps (in order)
1. DONE 2026-11-25 13:08 IST: the vendor reply mail was shown to Umesh and sent on his yes (row 0.3). Mail 2 (row L9) was sent the same day; no reply yet.
2. [Superseded: our account has the needed rights (row 0.2 and L3), so we create the secrets and set the Cloud Run settings ourselves in the L3 batch, on Umesh's yes. Old text: we supply the names and values through an agreed secure channel; the vendor applies them in Cloud Run and Secret Manager
   (lkb_prod, accounts on, CORS and origin = https://kb.vidysea.com; AUTH_CSRF_SECRET is generated by the vendor directly in Secret Manager).]
3. We run the smoke checks on the run.app URL (runbook checks 1-7).
4. DEFERRED by D-228 (rows L5, L6): the load balancer, the serverless NEG, the certificate and the Cloudflare A record for kb.
5. First admin from a laptop (create-admin.mjs), then sign-in check and the forged X-Forwarded-For loop; this sets TRUST_PROXY_HOPS.
6. Index sessions from the laptop (sync-session.mjs --index-existing --grounded-notes, about 35 min each).
7. Smoke checks again on the Cloud Run service address; then the vendor changes the AWS ALB /knowledgebase* rule (row L9, already asked). The ingress lock (row L10) is deferred by D-228.
8. /maker resume, then the deferred list.

## Gates that need Umesh
- Merging to master triggers the vendor's Cloud Build deploy; do not merge or push to master without Umesh's yes and a heads-up to the vendor. The trigger fires only on a push to a branch matching `master` (pattern not anchored); feature and release branches do not match.
- Every vendor mail, and every DNS / LB / ALB / server step: dry run first, then his yes.
- First admin, the sign-in check with the forged X-Forwarded-For loop, and indexing all write lkb_prod: explicit yes each. Session ids to index: ask Umesh.
- The AWS ALB rule change (L9) comes after the checks pass. The ingress lock is deferred by D-228 (L10).
- ISS-362 needs an Approved-by entry before builds resume.
- GitHub write access. Pushing any branch to origin is refused (403) for the signed-in account. Umesh either gets write access for that account on the origin repository or signs in to git with an account that has it; a second option he was offered is pushing feature branches to the `legacy` remote, which was not done. Until this is settled: no CI on GitHub, no draft pull requests, no master merge. The launch deploy batch does not need a push. Asked in chat on 2026-11-25; not answered.

## Deferred (ledger, not launch blockers)
ISS-443..451 web polish, ISS-453 8 web test reds, ISS-454 timeout labelled stale, ISS-455 strict-index error.
Host notes: C: and D: are 91%/95% full; put temp on D:. Local-only files never to commit:
apps/web/vite.e2e.local.config.mjs, .claude/launch.json.

---

# Session Handoff — KnowledgeBase machine migration — 2026-10-09 12:44:13 +0530

> READ THIS FIRST when resuming. This checkpoint preserves work in progress for a second machine. Static rules are in AGENTS.md; verify runtime, paths and paused-unit conditions before acting.

## TL;DR — resume in one paragraph
Umesh asked to publish all current repository work to continue on a machine with more RAM/space. Clone the public admin repository on branch codex/machine-migration-2026-10-09 to obtain the complete current root source, QA, goal/task state and selected corpus artifacts. Four unmerged histories and a separate dirty alert worktree are also preserved; they are not automatically merged into this candidate. This is a migration backup, not a green release or live-deployment claim. First inspect the goal, QA and this handoff; then continue candidate reconciliation and U2.2 offline quality work without rebuilding already shipped features.

## Active task (what was in flight)
Machine-migration publication under D-117: preserve current code and all local unique histories, ship a portable handoff, audit secrets and verify by an independent fresh clone. Application north star remains the hosted Living Knowledge Base and AI virtual counsellor. Roadmap is unchanged: 95 tasks, 51 done, 5 in progress and 39 pending. Full R1/R2/R3 product scope remains.

## Done this session
- Inventoried all 30 registered worktrees and 42 original branch refs. Original root parent is 614d78b8966428296f394b8bf3e6c547d41beca5.
- Identified root 48 modified tracked paths and 20 new code/QA paths; eight new small corpus/source artifacts must travel with the code.
- Identified a separate worktree with two modified alert files; preserve it on codex/machine-migration-alerts-2026-10-09 without rewriting or cleaning the owner's working tree.
- Identified four histories absent from master: lane/a-speakers (2 commits), wave/u2-4-phase3-fix (13), wave/vector-gap-durability (2), worktree-agent-a035913864247fa58 (5). Their union is 22 unique commits.
- Secret audit across 3838 history blobs and 78 working files: two configured secret values and eight credential patterns; eight positive/eight negative controls; zero findings after credential-specific classification. No credential values are retained in the audit.
- Appended D-117 using scripts/append_decision.ps1; all pre-existing decision bytes preserved.
- Fresh contracts/verify_contracts.py exit 0 by vacuity. Fresh offline extraction replay exit 2: 29 loaded cases, 3427 turns, 72 persisted claims, 14 invalid references of 80; no independently labelled semantic cases. Existing failures retained honestly.
- Created this sanitized portable handoff and local archive. Publication success is established by remote/clone verification, not by this pre-publication note.

## In progress / paused mid-step
- U2.2: offline extraction-quality harness is BUILDING. Source/claims/corpus are available; six declared synthetic case artifacts are missing and three sessions have invalid source timing. Semantic gold, thresholds and independent final checker acceptance remain pending.
- U2.4: speaker precision re-gate is FAIL/paused. Read qa/.paused.u2-4-phase3-precision-regate; at least 8 GB free plus its other conditions are required. No model-proposed speaker writes/persona backfill until the gate passes.
- U3.1: Ask page exists and has historical real-browser citation click-through proof. The goal's old unreachable-UI title is stale. Broader answer UX/acceptance remains.
- T-051: real operational release, grounded notes/Q&A scope, actual alert receipt, complete feed acquisition, restart/recovery and actual Ubuntu-host proof remain open.
- T-052: acquisition/persistence subunits have scoped PASS; complete executable registration safety and confirmation-email correlation acceptance remain open.
- Unmerged branch verdicts include FAIL/paused work. Preserve history and use existing-file, independently approved maker/checker changes; do not bulk-merge stale branches.
- Historical HANDOFF tool handles refer to another machine/session. A number/lock/pending JSON is not live process proof. Inspect retained artifacts and present runtime before resuming or restarting.

## Next steps (do these to continue) — ordered
1. Clone the exact migration branch. Initialize the private WhatsApp submodule with your GitHub account if needed. Read AGENTS.md, ARCHITECTURE.md, current docs/DECISIONS.md and TASKS.md.
2. Read .handoffs/machine-migration-inventory-2026-10-09.json for all original branch names/SHAs/worktree paths. All original branch commits must be reachable from published migration/master/unmerged refs. Historical merged branch names can be reconstructed from that map without copying machine worktree metadata.
3. Install project dependencies on the new machine: Node 24+, pnpm 10.33.0, Python suitable for the pinned requirements, Chrome, FFmpeg/FFprobe and Docker where the work runtime needs it. Use the existing webinar setup script; do not copy node_modules, .venv or browser cookies.
4. Configure secrets locally using .env.example, reconnect GWS OAuth and establish an isolated MONGO_WORK_DB. Production Mongo remains read-only; never inherit an implicit production DB default.
5. Re-run typecheck and the relevant checks on this exact candidate. Latest source-wide evidence had typecheck PASS, published remux CI FAIL and structure/tracker failures; do not call this green or deployed.
6. In two non-overlapping light lanes, reconcile candidate/CI/structure work and finish U2.2's independent semantic/citation evaluation. Run the heavy speaker re-gate only under its resource/pause conditions.
7. Prove R1 on a real approved webinar: usable audio/video -> grounded speech/screen evidence -> cited Ask, sustained capture, actual alerts and interruption/restart. Registration-required coverage requires T-052; direct-link coverage can advance independently.
8. Independently verify the accepted release on the actual Ubuntu host. Then close R2 full-corpus/search/speaker/answer acceptance before broader R3 counsellor/platform/championship work.

### New-machine clone and setup
Commands below are instructions, not actions performed on this old machine:

    git clone --branch codex/machine-migration-2026-10-09 https://github.com/vidysea-admin/KnowledgeBase.git KnowledgeBase
    cd KnowledgeBase
    git submodule update --init --recursive
    corepack enable
    corepack pnpm install --frozen-lockfile
    node scripts/webinar/setup.mjs --install
    node scripts/webinar/setup.mjs
    pnpm -r typecheck
    node scripts/eval-extraction.mjs --input data/eval/extraction-corpus.json

The private submodule remains https://github.com/umeshsugara-ai/whatsapp-archiver.git at 7cdf1a18ac542ada34113b291a5cac51079ae9af; your account needs access. Parent CI does not initialize it. If local pnpm is installed directly, pnpm install --frozen-lockfile is the equivalent package-install command. Schema validation also needs jsonschema in the chosen Python environment, as the existing CI specifies. Use the existing setup doctor to identify missing tools.

To preview the app, configure the isolated work Mongo, tenant/API key and local credentials according to docs/webinar-release.md, then use pnpm demo:up. That command requires MONGO_WORK_DB. Do not start a live registration or paid provider batch just to verify a clone.

## Open threads / pending user decisions
- Umesh/checker: independent semantic gold adjudication and binding quality thresholds; previously rejected canonical grounded-notes/Q&A schema scope.
- External registration identity/scope and new paid provider batches remain separate human gates.
- DevOps: actual Ubuntu host/service owner and actual operator alert recipient/channel.
- Championship judges are later R3 scope and should not block R1.
- Other machine-local AIOS skills/brain at D:/ai_os and user-level credentials are outside this repository. Reconnect that context separately if required; do not publish their credentials/config as part of the public repo.

## Runtime state (VERIFY before resuming)
- Repo/branch on old machine: D:/KnowledgeBase, master; original working source/index preserved. Migration state is published via separate refs.
- API/UI/work Mongo were inactive at the report probe; Docker engine was unreachable. Latest report probe: 23.7 GB RAM total, 2.4 GB free. These are historical machine observations, not guarantees for the new host.
- No app server, paid model, browser capture, scheduler or deployment was started by this migration session.
- Browser/OAuth sessions do not transfer through Git. Authenticate locally on the new machine.
- Locked old worktrees are not evidence of live agents; old referenced PIDs were absent at the migration check.

## Key files & artifacts (paths)
Old-machine paths below remap to the chosen clone directory:
- D:/KnowledgeBase/.goal/goal.json — full roadmap and release order.
- D:/KnowledgeBase/TASKS.md — task evidence and current checkpoints.
- D:/KnowledgeBase/docs/DECISIONS.md — append-only history through D-117.
- D:/KnowledgeBase/docs/webinar-release.md — operational runbook and accepted proof limits.
- D:/KnowledgeBase/qa/manifests/t052-executable-registration.md — remaining registration seam.
- D:/KnowledgeBase/qa/manifests/u22-extraction-measurement-harness.md — extraction BUILDING state.
- D:/KnowledgeBase/data/eval/extraction-corpus.json — portable replay input.
- D:/KnowledgeBase/.handoffs/machine-migration-inventory-2026-10-09.json — branch/worktree/source inventory.
- D:/KnowledgeBase/.handoffs/KnowledgeBase-Analytical-Report-2026-10-09.md — full counts, all 44 unfinished tasks and plan.
- D:/KnowledgeBase/.handoffs/KnowledgeBase-Report-2026-10-09.html — standalone filterable report.
- D:/KnowledgeBase/.handoffs/machine-migration-public-audit.json — sanitized scanner evidence.
- D:/KnowledgeBase/.handoffs/2026-10-09-124413-previous-HANDOFF.md — previous canonical handoff, retained as historical context.

## Pointers (deeper context already on disk — read on demand)
- D-104 through D-114: current work/testing authorizations; D-115/D-116: public repo migration; D-117: this cross-machine WIP backup.
- qa/contracts/, qa/manifests/, qa/verdicts/ and the union of qa/issues*.jsonl remain the maker/checker evidence surface.
- Copied analytical report contains older original-machine artifact links; use the report text plus relative repository paths when those links are unavailable on the new machine.
- Root/master is the accepted historical baseline, not an accepted completion of dirty candidate work.

## Gotchas / watch-outs
- This migration branch is intentionally WIP. Do not promote it directly to a live server merely because it is available on GitHub.
- Keep uncertain speakers unresolved and strict webinar indexing/media provenance checks intact.
- Do not claim the empty frozen-contract validator's vacuous PASS proves product quality.
- 14/80 invalid citation references measures structural integrity, not answer accuracy/hallucination rate.
- Gmail's historical full ID listing did not establish full body acquisition/classification; do not silently treat partial reads as a complete scan.
- Credentials, cookies, raw recording binaries, machine-installed dependencies, caches and Mongo volume files are not a Git transport. Retained source/transcript/corpus files are in the repository; regenerate runtime state or separately transfer required private media through an authorized private channel.
- No production promotion, live deployment, external organizer submission or paid model batch is implied by this backup.
- The normal push remote is the admin repository. Keep migration/FAIL/paused histories separate until independently accepted.

## Desktop continuation — 2026-10-09
- Current repo: C:/Users/product/Desktop/KnowledgeBase, migration branch; local agent checkpoint only, no push/merge/deployment.
- Installed plain Node executable verified v24.21.0: C:/Program Files/WindowsApps/OpenAI.Codex_26.1002.7124.0_x64__2p2nqsd0c76g0/app/resources/cua_node/bin/node.exe.
- Task-local pnpm10.33.0 CLI: C:/Users/product/Documents/Codex/2026-10-09/what-is-the-current-update-and/work/pnpm-10.33.0/package/bin/pnpm.cjs. Run through Node. Core/AI/index85dependency hardlink install works; full/web install previously hit ENOSPC and its partial files were cleaned by its owning agent.
- U2.2 reviewed-metric followup:22/22 tests, independent21/21 adversarial probes and index typecheck green; omission/entity coverage remains explicit. Full U2.2 remains BUILDING pending independently confirmed gold, thresholds and real corpus acceptance.
- Stale citation cause verified: T003 replaced positional turn IDs while T002 claims/pages survived. New version-safe transcript/provenance unit preserves original bytes, invalidates derived knowledge before replacement and freezes same-buffer seed snapshots. Strict speech+screen/frame validation and explicit work-DB targets are preserved.
- Provenance targeted13/13 and independent27/27 checks pass; affected union54/55 FAIL at genuine realFFmpeg fixture (spawn ffmpeg ENOENT). Unit HOLD/BUILDING. No FFmpeg/FFprobe found; storage cannot safely provision them now. Global LOC6 and directory2 baseline failures remain; frozen-contract validator passes by vacuity only.
- Original corpus unchanged:72claims/80references,14invalid references and3invalid-time sessions. data/eval/extraction-reconciliation-reviewed.json contains7independently approved proposed mappings with65unreviewed IDs; proposals are not applied or reimported. Preliminary13labels are independent-AI review, not human gold.
- Existing local credentials/.env, isolated MONGO_WORK_DB/MONGODB_URL, Google OAuth and provider/media readiness remain setup gates. Production DB defaults are refused by seed/sync; no real DB/provider/browser/scheduler operation ran.
- Resume after storage recovery: install FFmpeg+FFprobe and finish dependency setup; rerun the failing affected-media gate, obtain independent provenance verdict close-out; then independently reconcile the retained corpus and prove full R1/R2/R3 acceptance. Do not stamp old claims/pages with current hashes or reimport unresolved knowledge. U2.4 pause still requires its original8GB/resource conditions.

## Later Desktop runtime checkpoint — 2026-10-09
- Earlier storage/prerequisite hold resolved: FFmpeg and FFprobe9.0.2 are verified at task work/ffmpeg. Provenance Cycle2 independently checked-PASS: prior54 unchanged affected cases plus freshly executed formerly failing real-media1/1, independently rerun; do not describe this as a new full55-case run.
- Full frontend build and configured API/index typechecks pass. Strict runtime extraction source unit now submits/judges complete bounded speech/screen spans, carries pending questions across windows, preserves exact item/question/answer quotations, and preflights a real candidate session tree and finite vectors before replacing knowledge. Runtime schemas/generated types remain unchanged; historical canonical-schema approval/rollout is still separate.
- Maker affected62/62 and immediate downstream35/35 pass with zero skips; final index/API typechecks pass. Independent checker verdict is recorded separately at qa/verdicts/strict-webinar-runtime-extraction.md. The1011-turn/>100K fixture proves bounded local context and all10 pending questions; individual over-budget full context fails honestly. No provider precision, human gold or full-release acceptance follows.
- Actual local services at checkpoint: Mongo7.0.43 PID22376,127.0.0.1:27019; API production factory PID13656,127.0.0.1:3300 with health200/dbok; static built frontend PID22112,http://127.0.0.1:5173/ with API base3300. Environment helper/logs/identity files are under C:/Users/product/Documents/Codex/2026-10-09/what-is-the-current-update-and/work. Only those exact owned processes may be restarted or stopped after revalidating ownership.
- API database is explicit isolated lkb_work_20261009_01a11f9c; generated read-key in gitignored .env is never printed or committed. Authenticated sessions currently returns an empty list; absent/malformed keys are401. This proves local app plumbing, not corpus acceptance. No real corpus seed, paid provider call, OAuth-token setup, live capture or production DB write occurred.
- Original72claims and7proposed independently reviewed replacements remain unchanged, with65unreviewed IDs explicit. Next work needs legitimate source-bound recovery, provider/OAuth readiness, human gold/thresholds and actual webinar/Ask acceptance. Keep full R1/R2/R3 roadmap gates open.
- Concurrent calendar-attendance files, docs/DECISIONS.md and scripts/webinar/run-pipeline.mjs have unconfirmed ownership in this worktree. They were preserved and excluded from this source/runtime checkpoint; do not call the whole worktree clean or stage them implicitly. No push, master merge, deployment or activation was performed.

## Source recovery and provider checkpoint — 2026-10-09
- The Desktop migration checkout now has a real local product corpus. Original repository corpus bytes are preserved; task packet work/toc-recovery-v1 projects29 real dated sessions (23 originals plus6 September additions),3424 valid source turns,29 extractive transcript pages,7 independently reviewed replacement claims and58 visible source/vector gaps. The65 other legacy claims remain unresolved. Three reversed intervals remain archived/excluded with exact IDs; six declared synthetic cases still lack artifacts. Claims stay needs-review, speaker identity/external truth remain unverified, and session semantic/index status stays pending.
- Recovery packetId477255b83bb0f001a7fce53d48af7631bdc8a92c2e24e85b3108a3c9ece749ef is bound to preserved original byte hashes and independently approved review SHA2568aa7ce9c90ae2b83107fdf815e90491194ac4fea830ae79a4b957d52dc5ea0e5. Build/import refuses changed review authority, altered source/evidence, nonempty knowledge collections and partial-import retries. Insert-only initialization into mongodb://127.0.0.1:27019/lkb_work_20261009_01a11f9c completed; existing API keys/unrelated collections were preserved. Durable receipt is under task work/toc-recovery-v1-import-receipt.json. Recovery CLI has --build, --dry-run and --import; the current initialized DB must not be reseeded.
- Maker recovery33/33 and immediate downstream31/31 passed; actual production session/search/citation/tree readers resolve all29 sessions and8 supporting citation turns, with foreign tenant reads empty/null. The independent checker owns the matching recovery verdict. This is source recovery; genuine corpus vectors and complete accepted Ask remain separate gates.
- Current loopback runtime: Mongo PID22376 at27019; accepted-source API PID29316 at3300 health200/dbok, authorized /sessions200 returns29, missing/malformed auth401; built frontend PID22112 at http://127.0.0.1:5173/ uses API3300. Isolated Ollama PID7732 at11435 uses a task-owned model store with cloud disabled. API read key and .env remain local/ignored; provider/auth values are never recorded here. Revalidate ownership before stopping these processes. Runtime helpers/logs remain in C:/Users/product/Documents/Codex/2026-10-09/what-is-the-current-update-and/work.
- Provider boundary and missing-Gemini-credentials units are independently scoped checked-PASS. Claude uses the existing native OAuth login with an isolated ephemeral cwd, restricted/no-tool/no-MCP/no-Chrome execution, bounded input/output/time and owned process cleanup; one public synthetic KB_OK prompt succeeded. Blank Gemini credentials fail before prompt transport and retain legitimate router fallback. Actual local nomic-embed-text document/query outputs are finite/nonzero768-dimensional vectors; truncate:false and oneCPUthread are enforced. Only public synthetic provider proof ran; corpus embedding backfill remains pending.
- Next implementation: opt-in bounded Ask catalog and tenant-scoped source hydration preserving exact source excerpts/turn IDs/speaker labels/times, followed by genuine corpus-vector backfill and real in-corpus/off-corpus Ask acceptance. The current full extractive tree is2096418bytes; do not submit it through the legacy whole-tree provider path. Preserve standing evaluator/routing thresholds and strict speech/screen guards. Human semantic gold, canonical grounded-schema rollout, full U2.2 and product/release acceptance remain open; roadmap51/95 count is unchanged. These are local checkpoints, with no public push/master merge/deployment.
