# Checkpoint (coordinator A) — wa-isolation-read-side, cycle 0

Verdict: FAIL (qa/verdicts/wa-isolation-read-side.md). Head bfc5350f, base aa8ef31a, tier L, policy proportional-verification/2026-10-19.17.

## Evidence identities
- Scratch copy: `git archive bfc5350f` extracted under the session scratchpad (`w7chk-A-copy`); the bound tree was not edited by any probe or mutation.
- Manifest verify commands re-run in the copy: isolation-read-side + isolation-write-side 26 pass / 0 fail; router, review-source, routes/whatsapp, route-tenant, message-vertical 33 pass; read-side-quarantine + read-side-quarantine-trusted 26 pass; wire-mongo (real Mongo) pass; `tsc --noEmit` clean for product files (errors only in my own probe file).
- Production-composition probe: `node --test --import tsx apps/api/src/whatsapp/w7chk-A-prodwire.test.ts` -> 13 pass, 2 fail (owner/admin raw session read 404 instead of 200; audit fail-closed 404 instead of 503). Status matrix: every principal gets 404 on sess-a/b/l, `admin.raw_read` events 0. Source: qa/evidence/wa-isolation-read-side-A/w7chk-A-prodwire.test.ts.txt.
- Real-Mongo probe: local mongod 7.0 single-node replica set on port 27391, throwaway database, dropped afterwards; PID started by this check and stopped by it (32416). Source: qa/evidence/wa-isolation-read-side-A/w7chk-A-realmongo.test.ts.txt. No production or shared Mongo touched; no .env printed.
- Mutations (copy only, per-mutation byte backup, timeout, restore, HEAD fidelity `git hash-object` == `git rev-parse bfc5350f:<file>`): C1 9 red, C2 2 red, C3 3 red, C4 1 red, C5 3 red, C6a 5 red, C6b 3 red; one survivor at store.ts:163 (not a W7-changed line). Script: qa/evidence/wa-isolation-read-side-A/w7chk-A-mut.py.txt.
- ISS-API-003 measured against its recorded reproductions: 2/2 refused; authored corpus 9/9.

## Not done / out of scope
No full suite. No push. No ledger rows written (dual coordinator; findings are PROPOSED-ISSUE P1..P4 in the verdict). Consent paths untouched (D-210). Live browser not applicable (api-only).

## Resume note
Re-check after fix: forward `read` in `withSessionArtifacts.getSessionDetail` (apps/api/src/routes/brain.ts:154-155), add a test through the production composition, then re-run the prodwire probe and the 7 mutations.

# Checkpoint (coordinator A) — cycle 1 (repair re-check)

Verdict: PASS (qa/verdicts/wa-isolation-read-side.md; cycle-0 FAIL archived at .r0-1.md). Head 7ab17ee6 (code 21dfc204), repair base bfc5350f, tier L.
## Evidence identities
- Copy: git archive 7ab17ee6 under scratchpad w7c1/base and w7c1/mut, junctions to main-tree node_modules (removed with cmd rmdir); bound tree untouched.
- isolation-read-side 20/20, isolation-write-side 17/17, regression set 76/76 (node --test --import tsx), tsc --noEmit clean for product files.
- Cycle-0 repros verbatim: prodwire 16/16 (events=6), real-Mongo duplicate probe pass. New probe w7chk-A2-marker (real replica set, throwaway mongod port 27391, PID 25180 started and killed by this check, db dropped) pass.
- Mutants M1..M8 all red, restored, HEAD fidelity true. Evidence: qa/evidence/wa-isolation-read-side-A-c1/.
