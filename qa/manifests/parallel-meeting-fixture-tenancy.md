# Manifest — parallel-meeting-fixture-tenancy

Status: checked-PASS
Fix cycle: 0
**Handshake status:** checked-PASS

Closed 2026-10-09 after independent `qa/verdicts/parallel-meeting-fixture-tenancy.md`
reported PASS, Cycle checked 0, ISSUES-WRITTEN none, 11/11 tests and ISS-359 corpus 3/3.
Maker re-read the verdict and verified all four checkpoint byte hashes match before close-out.
Checker adopted ground truth at `qa/contracts/parallel-meeting-fixture-tenancy.md`.
Fixture source stays frozen at its 300/300 line budget; further integration requires coordinated ownership.

## Selection, authority and ownership

2026-10-09: orchestrator assigned ISS-359 under Umesh's NORMAL-mode authorization with an
independent checker. Tier 2/security-class exception: the ledger rates this fixture gap medium,
but it concerns tenancy and writes, so D-014 leaves it uncapped and requires the scoped handshake.
The held enforcement unit at the top of `qa/QUEUE.md` remains gated and unchanged.

Own only `apps/api/src/fixtures.ts`, `apps/api/src/routes/meeting-candidates.test.ts` and this
manifest. Before edits, `git status --short --` for all three paths was empty. A search of
manifests mentioning `fixtures.ts` found no pending ready-for-check/in-progress/building owner.
No runtime production store, route, schema, ledger, contract, task, enforcement or goal was edited.

Ground truth: `qa/contracts/gmail-meeting-candidates-approval.md` C4/C6 and tenant-led
trusted-sender/candidate separation, Developer API auth/scope contract, and ISS-359's exact
recorded reproduction corpus. No new contract was authored by the maker.

## Change

Meeting-candidate fixture state is keyed by tenant for list, approve, reject and sender trust.
Legacy `_rows` and `_trust` remain aliases for tenant-1; `_rowsFor(tenantId)` and
`_trustFor(tenantId)` support explicit independent seeding and inspection. Candidate response
shape stays unchanged. Empty scan remains its existing injected/no-op fixture behavior.

Three standing tests cover the recorded corpus plus security controls. They preserve both
tenants' rows and trust on foreign and unscoped writes, reject forged body/query tenants,
exercise both rightful owners and isolate trust even when both use the same sender domain.
Duplicate approvals remain refused without double-counting trust.

## Recorded reproduction measurement — ISS-359: 3/3 addressed

1. Exact ledger case: "Seed fakeMeetingCandidatesDeps()._rows with a candidate under an implicit
   tenant-1 context, call listCandidates('tenant-2', ...) -- returns the tenant-1 row (should return [])."
   Standing reproduction seeds the implicit tenant-1 map and calls `listCandidates("tenant-2")`.
   Before fixture fix: returned both rows, assertion failed. After fix: empty, tenant-1 positive
   control still returns both rows.
2. Exact ledger case: "Live repro (this session): fixture server with tenant-1 seeded
   meeting-candidates + tenant-2 key with none; GET /meeting-candidates with tenant-2's key
   returned tenant-1's 2 rows via the browser's real network call."
   Standing reproduction uses the real fixture-backed Express HTTP route with those keys and
   exact titles `Weekly Ops Sync` and `Ashoka Educator Dialogues follow-up`. Before fixture fix:
   both leaked. After fix: `{candidates:[]}`, neither title appears, owner positive sees both.
   This rerun uses loopback fetch rather than a browser; no browser verification is claimed.
3. Exact ledger case: "grep -n tenant apps/api/src/routes/meeting-candidates.test.ts -- no
   cross-tenant assertion present, unlike watched-sources.test.ts:124,205."
   Windows portable equivalent `rg -n tenant apps/api/src/routes/meeting-candidates.test.ts`
   now identifies explicit foreign-list assertions at lines 20-23 and two-tenant route/write
   assertions beginning at line 45. These execute as the third standing regression rather than
   relying on a keyword match alone. No recorded case is silently omitted.

## Exact checkpoint and bounded execution

HEAD: `87858c734f4928df7a141e8f17691f170719c76b` (clean owned source before this unit).
Post-run SHA256:

| File | SHA256 |
| --- | --- |
| `apps/api/src/fixtures.ts` | `A99DD8A2C9ABF1864D9AF6F26741E1D890DA46FB9A4A1C0DBB2E0D762781639F` |
| `apps/api/src/routes/meeting-candidates.test.ts` | `155B9F1A58F57510D8764B47B8EBA1EFED8F86C624AA714EBA2C45BA9D334037` |
| `apps/api/src/routes/meeting-candidates.ts` (read only) | `E725BD9BDEDD6C899D4163C02DBCA3487D499CC50A11C38376FCE8B99C0184C0` |
| `apps/api/src/store.ts` (read only) | `83246BD38ACB07AEF3505A7FD5894A58332DB66DA45041642156546C632A732A` |

Cwd: `C:\Users\product\Desktop\KnowledgeBase\apps\api`.
Baseline command before changing the fixture (test additions only, no live source mutation):

```powershell
& 'C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-concurrency=1 --test-timeout=45000 --experimental-test-isolation=none --test-name-pattern='ISS-359 recorded reproduction' --import tsx src/routes/meeting-candidates.test.ts
```

```text
tests 2; pass 0; fail 2; duration_ms 2329.3419; exit 1
Both assertions expected [] and received the owner's two seeded rows.
```

Final one-file command (tool-approved escalation for the local esbuild helper):

```powershell
& 'C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-concurrency=1 --test-timeout=45000 --experimental-test-isolation=none --import tsx src/routes/meeting-candidates.test.ts
```

```text
✔ ISS-359 recorded reproduction 1: implicit tenant-1 fixture rows are invisible to tenant-2
✔ ISS-359 recorded reproduction 2: HTTP tenant-2 cannot see the two seeded tenant-1 titles
✔ ISS-359 recorded reproduction 3: cross-tenant assertions cover lists, decisions and sender trust
All eight existing focused tests also passed.
tests 11; pass 11; fail 0; cancelled 0; skipped 0; todo 0
duration_ms 1802.8121; exit 0
```

Canonical `scripts/lib/walk.mjs` `countLoc` returned fixtures 300/300 and test 247/400 against
`structure.config.json`. Only the owned files were counted; no full structure lint is claimed.

## Shared-data disclosure and limits

No shared database, provider, browser, production service or source artifact was touched.
Writes were limited to the owned code/manifest and ephemeral in-memory fixture maps. The
production store already appears tenant-scoped; this fixes fixture fidelity/coverage, not a
demonstrated production disclosure. No live mutations, full suite or typecheck was run.
ISS-359 remains unchanged in the ledger; this close-out edits only the corresponding manifest.

Independent checker reviewed the scoped maps and all three ledger cases, reran the bounded
command (11/11), and returned `qa/verdicts/parallel-meeting-fixture-tenancy.md` with
`Cycle checked: 0` and PASS. Maker records that scoped verdict above; broader validation remains open.
