# Verdict: autojoin

Cycle checked: 0
Commit checked: 4cbb040d
VERDICT: FAIL (fix cycle 1 needed)
ISSUES-WRITTEN: ISS-AUTOJOIN-001 (medium), ISS-AUTOJOIN-002 (low), ISS-AUTOJOIN-003 (low)

## Blocking
ISS-AUTOJOIN-001: the 6 emails/hour cap does not hold. Failure kinds bypass it (alerts.ts:93). Probe with a fake gws runner: 12 about-to-join -> 6 emails; 12 more capture-failed on distinct sessions -> 18 emails in the same hour. The brief and D-165 intent say at most 6/hour. Dedupe per (session, kind, channel) holds.

## Held (evidence)
- Routing: only testData===true reroutes; requires LKB_ALLOW_STAGING=lkb_staging, else refuses (no fallback). lkb/global_university_db are refused by isProtectedWorkDbName regardless of tag, so lkb is unreachable from sync-session. Tags typed-checked (string "true" ignored). Fail-open on a missing tag: ISS-AUTOJOIN-002 (low).
- Classifier: Career Counselling Masterclass, Study Abroad Webinar, College admission Q&A, Career Guidance Q&A = career; Gemini at Work, Weekly sync = not; FDE roadmap = not (staged). Keywords stored in verdict and shown in alerts. False positives: ISS-AUTOJOIN-003.
- Email: To is the config address (EMAIL_RE validated), never event data; subject is RFC 2047 base64, CRLF stripped, body base64: injection probe yielded no extra header. URLs stripped.
- Calendar: insert/patch with sendUpdates none, no attendees key, private, transparent, patch only by stored id with id regex; gap 60 s probe: rate-limited then updated.
- install-tasks.ps1: preview by default, -Apply needed, no task registered (Get-ScheduledTask empty), paths single-quoted, quote/newline in paths refused.
- Tenancy: /bot-events requires scope jobs, tenant from verified key, query validated, 503 when unwired; feed reader filters on tenant.
- Defaults: no config/autojoin.json and no env -> AUTOJOIN_OFF (legacy). LKB_JOIN_RULES_ENFORCE untouched.

## Mutation (scripts/lib/mutate.mjs apply/restore, try/finally, per-mutation, 240 s timeout, HEAD hash verified; assert-clean OK)
10/10 killed: staging-route-skip, staging-optin-skip, feed tenant filter, router tenant arg, router scope, email cap, dedupe, test-data email skip, calendar gap, tick testData tag. All restored to HEAD blob.

## Suites
meeting-bot: tests 914 pass 910 fail 2 (the 2 EPERM symlink record-backend tests, same as main). apps/api: 874/874 pass. apps/web vitest: 723 passed (70 files). tsc clean apps/api and apps/web (meeting-bot tsc not rerun; tests ran under tsx). lint-loc --all: 10 stages OK. test-data-route + install-tasks: 7/7.
No real Gmail/Calendar/Mongo/browser calls.

---

Cycle checked: 1
Commit checked: 831d1c7e
VERDICT: PASS
ISSUES-WRITTEN: ISS-AUTOJOIN-004 (low, file-don't-fix). Closed: ISS-AUTOJOIN-001, ISS-AUTOJOIN-003. ISS-AUTOJOIN-002 accepted (documented).

## ISS-AUTOJOIN-001
Cycle-0 reproduction re-run verbatim: 12 about-to-join + 12 failures on distinct sessions -> 9 emails immediately (6 + 3), 10 after the digest (flush at +6 min). Storm of 100 more failures in the same hour: still 10, pending queued. After an hour: one more digest (11). Digest send failure: pending kept (7), retried each flush, delivered once the transport recovered (state is persisted in the alert-state file, so a restart does not lose it). Hour-boundary burst: 4 failures queued inside the hour, 3 individual + 1 digest after it. Bound 6+3+1 per hour holds. Caveat: pending is truncated to the last 50 (ISS-AUTOJOIN-004).
Mutations (mutate.mjs, per mutation, timeout, HEAD hash verified, assert-clean OK): failure cap off, digest wait off, failures counted in ordinary log, digest not queued: all killed. Digest once-per-hour guard (`st.digestLog.length > 0`) SURVIVED: test gap, behaviour correct by probe -> ISS-AUTOJOIN-004 low.

## ISS-AUTOJOIN-003
Weekly SOP review, Campus security training -> not career. SOP workshop for MBA admission, Statement of Purpose workshop, Campus placement guidance, Careers in AI, scholarships webinar, Career-Counselling -> career. Universitycareer day, Subcareer, Incollege -> not (whole-word confirmed).

## Suites
meeting-bot 916 tests, 912 pass, 2 fail (same EPERM symlink record-backend tests as main); apps/api 874/874; apps/web 723/723; tsc clean api+web; lint-loc 10 stages OK.
