# Verdict — parallel-meeting-fixture-tenancy

**VERDICT:** PASS
**Cycle checked:** 0
**ISSUES-WRITTEN:** none
**Manifest:** qa/manifests/parallel-meeting-fixture-tenancy.md (ready-for-check, fix cycle 0)
**Contract:** qa/contracts/parallel-meeting-fixture-tenancy.md
**Checked:** 2026-10-09

Independent scoped security check: ISS-359 fixture fidelity and standing route regression coverage. No production Mongo/runtime mutation or live-provider proof is claimed. The complete owned diff changes only the candidate fixture tenant maps and three tests; legacy `_rows`/`_trust` are tenant-1 map aliases, and typed per-tenant candidate/trust maps replace shared global state. Approve/reject first resolve the authenticated tenant's map; trust increments the same tenant's domain counter only after a pending row transitions. Empty scan retains its existing no-op behavior.

Ground truth inspected: original ISS-359 row and all three recorded reproductions verbatim; Gmail approval contract C4/C6; production `createMeetingCandidatesDeps`, collection `listAll`/`decide` and route authentication/scope code. The production collection still uses `scopedCollection` for tenant-merged reads and writes. This route suite executes the fixed fixture, not that Mongo accessor: it does not prove that any arbitrary future production raw-handle regression would fail. It does catch the fixture/route tenant confusion described by this issue.

**D-015 corpus: ISS-359, 3/3 addressed independently; none omitted.**

1. `Seed fakeMeetingCandidatesDeps()._rows with a candidate under an implicit tenant-1 context, call listCandidates('tenant-2', ...) -- returns the tenant-1 row (should return []).` First standing test passed with tenant-2 empty and owner positive control seeing two seeded rows.
2. `Live repro (this session): fixture server with tenant-1 seeded meeting-candidates + tenant-2 key with none; GET /meeting-candidates with tenant-2's key returned tenant-1's 2 rows via the browser's real network call.` Second standing test passed through the actual fixture-backed Express route, using loopback fetch instead of a browser. Owner response contains both exact recorded titles `Weekly Ops Sync` and `Ashoka Educator Dialogues follow-up`; foreign response is `{candidates:[]}` and neither title appears. This is an explicit transport translation, not a claimed literal browser replay.
3. `grep -n tenant apps/api/src/routes/meeting-candidates.test.ts -- no cross-tenant assertion present, unlike watched-sources.test.ts:124,205.` Independently executed Windows equivalent `rg -n tenant apps/api/src/routes/meeting-candidates.test.ts`; output now includes executable cross-tenant assertions at 20–23, 26–42 and 45–93. The third test also passed; keyword presence alone is not credited as isolation.

Security controls reviewed and executed: foreign approve/reject are denied both directions with 404; full candidate snapshots (including decision dates) and both trust maps remain unchanged. Missing Gmail scope returns 403 without state changes. Source inspection verifies `requireScope("gmail")` precedes handlers and returns without `next()` on denial; tests do not separately instrument store invocation counts. Query/body tenant forgery is ignored in favor of `req.auth.tenantId`. Both rightful owners can approve, tenant-1 can reject, identical sender domains earn separate counts, and duplicate approvals do not double-count. Legacy single-tenant tests still pass.

Independent bounded execution, cwd `C:\Users\product\Desktop\KnowledgeBase\apps\api`:

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test --test-concurrency=1 --test-timeout=45000 --experimental-test-isolation=none --import tsx src/routes/meeting-candidates.test.ts
```

```text
✔ ISS-359 recorded reproduction 1: implicit tenant-1 fixture rows are invisible to tenant-2 (2.8729ms)
✔ ISS-359 recorded reproduction 2: HTTP tenant-2 cannot see the two seeded tenant-1 titles (73.9126ms)
✔ ISS-359 recorded reproduction 3: cross-tenant assertions cover lists, decisions and sender trust (112.8925ms)
✔ production factory preserves registration acquisition evidence without inventing absent fields (2.7131ms)
✔ POST /gmail/scan with the gmail scope returns a real scan summary (15.3017ms)
✔ production Gmail factory binds source owner and actual work DB before provider writes (27.1102ms)
✔ Gmail scan refuses unbound/production/foreign work DB before provider writes and sanitizes failures (44.6749ms)
✔ GET /meeting-candidates without the gmail scope returns 403 (10.0604ms)
✔ approving a pending candidate flips its status and records a sender approval (7.3485ms)
✔ approving an already-decided candidate returns 404, never double-counts trust (7.1968ms)
✔ rejecting a pending candidate flips its status (7.1794ms)
tests 11
suites 0
pass 11
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 1358.7595
exit 0
```

The exact scoped test command used auto-reviewed escalation to allow local esbuild spawning. No runtime/provider credential acquisition was involved. The maker's reported pre-fix 2/2 failure is maker evidence only; this checker did not replay an old-source mutation.

Independent hash/LOC command, cwd repo root:

```powershell
& 'C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module -e 'import {countLoc} from "./scripts/lib/walk.mjs";import {readFileSync} from "node:fs";import {createHash} from "node:crypto";const c=JSON.parse(readFileSync("structure.config.json"));for(const p of ["apps/api/src/fixtures.ts","apps/api/src/routes/meeting-candidates.test.ts","apps/api/src/routes/meeting-candidates.ts","apps/api/src/store.ts"]){console.log(p+" sha256="+createHash("sha256").update(readFileSync(p)).digest("hex")+" nonblank="+countLoc(p));}console.log("budget fixture="+c.loc.max+" test="+c.loc.testMax);'
git diff --check -- apps/api/src/fixtures.ts apps/api/src/routes/meeting-candidates.test.ts
```

```text
apps/api/src/fixtures.ts sha256=a99dd8a2c9abf1864d9af6f26741e1d890da46fb9a4a1c0dbb2e0d762781639f nonblank=300
apps/api/src/routes/meeting-candidates.test.ts sha256=155b9f1a58f57510d8764b47b8eba1efed8f86c624aa714eba2c45ba9d334037 nonblank=247
apps/api/src/routes/meeting-candidates.ts sha256=e725bd9bdedd6c899d4163c02dbca3487d499cc50a11c38376fce8b99c0184c0 nonblank=63
apps/api/src/store.ts sha256=83246bd38acb07aef3505a7fd5894a58332db66da45041642156546c632a732a nonblank=290
budget fixture=300 test=400
exit 0; diff-check emitted only Git LF-to-CRLF advisories
```

All four byte hashes match the maker's frozen checkpoint. Fixture meets 300/300; test meets 247/400. No full structure lint, whole-API typecheck, full suite, DB, browser, provider or live mutation ran. Remaining full-feature/live criteria retain their existing obligations. Only contract/verdict were authored by this checker; manifest and shared ledger remain maker/orchestrator-owned.
