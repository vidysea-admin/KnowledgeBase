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
