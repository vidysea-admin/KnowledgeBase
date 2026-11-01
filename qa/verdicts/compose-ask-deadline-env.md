# Verdict: compose-ask-deadline-env

VERDICT: PASS
Cycle checked: 0
ISSUES-WRITTEN: none
Subject: commit fd62a5fd (Policy-Version proportional-verification/2026-10-19.17, Tier L config, single checker)

## EXPLANATION
The claim holds. docker-compose.yml gains exactly one value-less line, `LKB_ASK_FAST_DEADLINE_MS:`, in the api environment map (+1/-0). The name is read by apps/api/src/answer-policy/application.ts:52-56 (fastDeadlineMs) and falls back to FAST_DEADLINE_MS=20_000 (packages/ask/src/ask-v2.ts:29; used at :52). ask-v2.ts itself does not read the env name; it takes `deadlineMs` from the API caller, so the env read lives only in application.ts (not a defect). The extended test pins the name and goes red when the line is removed. The runbook line (docs/DEVOPS-REDEPLOY-2026-11-01.md:116) matches reality. No .env was read or committed, and no value is in compose. Low-severity notes: none.

## EVIDENCE
1. `git show --stat fd62a5fd`: 4 files: docker-compose.yml (1 +), docs/DEVOPS-REDEPLOY-2026-11-01.md (2 +-), qa/manifests/compose-ask-deadline-env.md (23 +), scripts/operations/compose-t028-env.test.mjs (14 +-). 33 insertions, 7 deletions total; compose is +1/-0. Added line (docker-compose.yml:98, after WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP:, hunk @@ -95,6 +95,7 @@): `      LKB_ASK_FAST_DEADLINE_MS:`
2. Code reads: application.ts:54 `const n = Number(env.LKB_ASK_FAST_DEADLINE_MS); return Number.isSafeInteger(n) && n > 0 ? n : FAST_DEADLINE_MS;`; application.ts:60 passes `deadlineMs: fastDeadlineMs()`; ask-v2.ts:29 FAST_DEADLINE_MS = 20_000, :52 `options.deadlineMs ?? FAST_DEADLINE_MS`.
3. `TMP=TEMP=D:/kb-scratch/e2e/tmp node --test scripts/operations/compose-t028-env.test.mjs`: tests 6, pass 6, fail 0, skipped 0 (including the 3 docker-config behaviour tests, which ran).
4. Falsification in a copy (D:/kb-scratch/e2e/check-copy: HEAD compose with only that line removed, plus the test file; diff confirmed exactly line 98 removed): tests 6, pass 4, fail 2. Red: "C1/C2 static: the 9 names are value-less pass-through entries" (AssertionError: LKB_ASK_FAST_DEADLINE_MS is a value-less map entry) and "C1/C2 behaviour: all 9 set in .env -> forwarded verbatim". Repo untouched: `git hash-object docker-compose.yml` = 37637d873852d5bd5d0b2092519864c459c6719a = `git rev-parse HEAD:docker-compose.yml`; `git status --short` on the touched files is empty.
5. Doc (docs/DEVOPS-REDEPLOY-2026-11-01.md:116): "Compose now forwards `LKB_ASK_FAST_DEADLINE_MS` to the api (value-less, only when present in `.env`): set `LKB_ASK_FAST_DEADLINE_MS=150000` in the server `.env` and recreate the api" matches items 1 and 3 (the "none set" behaviour test shows an unset name stays undefined). 150000 appears only in the doc and the test comment, never in compose.
6. `git show fd62a5fd --name-only` lists no .env file (tracked .env.example files exist but are unchanged by this commit). I never opened any .env. Compose carries the name only; the only `NAME=value` text in the commit is the doc/manifest prose.
