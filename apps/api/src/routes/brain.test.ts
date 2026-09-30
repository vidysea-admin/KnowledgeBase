/**
 * apps/api/src/routes/brain.test.ts — in-process HTTP requests (matching server.test.ts's
 * `startTestServer` pattern) against `routes/brain.ts` with `fakeBrainReadDeps`. Covers:
 * GET /sessions -> list; GET /sessions/:id -> real detail shape; missing id -> 404; each of
 * /sessions, /sources, /gaps -> 403 without the right scope, never a silent 200.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withSessionArtifacts } from "./brain.js";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeBrainReadDeps } from "../fixtures.js";

test("GET /sessions with the sessions scope returns the real seeded fixture list", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "sessions-key": { tenantId: "tenant-1", scopes: ["sessions"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/sessions`, { headers: { authorization: "Bearer sessions-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { sessions: unknown[] };
    assert.equal(body.sessions.length, 1);
  } finally {
    await server.close();
  }
});

test("GET /sessions/:id returns the joined session+page+claims+turns shape", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "sessions-key": { tenantId: "tenant-1", scopes: ["sessions"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/sessions/session-1`, { headers: { authorization: "Bearer sessions-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { session: { title: string }; page: { summary: string } | null; claims: unknown[]; turns: unknown[] };
    assert.equal(body.session.title, "Fixture Session");
    assert.equal(body.page?.summary, "A fixture summary.");
    assert.equal(body.claims.length, 1);
    assert.equal(body.turns.length, 1);
  } finally {
    await server.close();
  }
});

test("GET /sessions/:id with an unknown id returns 404", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "sessions-key": { tenantId: "tenant-1", scopes: ["sessions"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/sessions/does-not-exist`, { headers: { authorization: "Bearer sessions-key" } });
    assert.equal(res.status, 404);
  } finally {
    await server.close();
  }
});

test("GET /sources without the sources scope returns 403, not 200 or 501", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "ask-only-key": { tenantId: "tenant-1", scopes: ["ask"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/sources`, { headers: { authorization: "Bearer ask-only-key" } });
    assert.equal(res.status, 403);
  } finally {
    await server.close();
  }
});

test("GET /sources with the sources scope returns a real (possibly empty) list, never a stub 501", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "sources-key": { tenantId: "tenant-1", scopes: ["sources"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/sources`, { headers: { authorization: "Bearer sources-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { sources: unknown[] };
    assert.ok(Array.isArray(body.sources));
  } finally {
    await server.close();
  }
});

test("GET /gaps with the gaps scope returns a real (possibly empty) list", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "gaps-key": { tenantId: "tenant-1", scopes: ["gaps"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/gaps`, { headers: { authorization: "Bearer gaps-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { gaps: unknown[] };
    assert.ok(Array.isArray(body.gaps));
  } finally {
    await server.close();
  }
});

test("GET /gaps without the gaps scope returns 403", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "ask-only-key": { tenantId: "tenant-1", scopes: ["ask"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/gaps`, { headers: { authorization: "Bearer ask-only-key" } });
    assert.equal(res.status, 403);
  } finally {
    await server.close();
  }
});

test("fixtures sanity: fakeBrainReadDeps builds an injectable dep without touching Mongo", async () => {
  const deps = fakeBrainReadDeps();
  const sessions = await deps.listSessions("tenant-1");
  assert.equal(sessions.length, 1);
  assert.equal(await deps.getSessionDetail("tenant-1", "nope"), null);
});

test("session assets enforce auth, tenant ownership, confinement and frame hashes", async () => {
  const root = mkdtempSync(join(tmpdir(), "lkb-assets-"));
  const dir = join(root, "data", "toc-migrated", "session-1");
  mkdirSync(join(dir, "screen-frames", "run"), { recursive: true });
  mkdirSync(join(root, "raw"));
  writeFileSync(join(root, "raw", "video.mp4"), "video bytes");
  const frameBytes = "frame bytes", hash = createHash("sha256").update(frameBytes).digest("hex");
  const frame = { id: "f1", file: "screen-frames/run/frame-1.jpg", hash, tStart: 0, analysis: { ocrText: "Visible slide" } };
  writeFileSync(join(dir, frame.file), frameBytes);
  let sourcePath = "raw/video.mp4";
  const writeSource = () => writeFileSync(join(dir, "source.json"), JSON.stringify({ _id: "source-1", tenantId: "tenant-1", path: sourcePath }));
  writeSource();
  writeFileSync(join(dir, "screen-evidence.json"), JSON.stringify({ sessionId: "session-1", frames: [frame] }));
  writeFileSync(join(dir, "notes.json"), JSON.stringify({ sessionId: "session-1", notes: [{ text: "Useful note", kind: "screen-text", evidence: [{ sessionId: "session-1", frameId: "f1", tStart: 0 }] }] }));
  const original = fakeBrainReadDeps();
  const deps = withSessionArtifacts({ ...original,
    getSessionDetail: async (tenant, id) => {
      if (tenant !== "tenant-1") return null;
      const detail = await original.getSessionDetail(tenant, id);
      if (detail) detail.turns[0]!.screenEvidence = { frameId: "f1", file: frame.file, hash };
      return detail;
    },
    listSources: async (tenant) => tenant === "tenant-1" ? [{ _id: "source-1", tenantId: tenant, kind: "recording", captureMode: "silent", hash: "hash", createdAt: "2026-09-30", path: sourcePath, consent: { given: true, recordedBy: "test" } }] : [],
  }, root);
  const server = await startTestServer(buildTestDeps({ brain: deps, keyStore: fakeKeyStore({ one: { tenantId: "tenant-1", scopes: ["sessions"] }, two: { tenantId: "tenant-2", scopes: ["sessions"] } }) }));
  try {
    assert.equal((await fetch(`${server.baseUrl}/sessions/session-1/media`)).status, 401);
    const get = (suffix: string, key = "one") => fetch(`${server.baseUrl}/sessions/session-1/${suffix}`, { headers: { authorization: `Bearer ${key}` } });
    assert.equal((await get("media")).status, 200);
    const range = await fetch(`${server.baseUrl}/sessions/session-1/media`, { headers: { authorization: "Bearer one", range: "bytes=0-4" } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), "video");
    assert.equal(range.headers.get("cache-control"), "private, no-store");
    assert.equal((await get("media", "two")).status, 404);
    assert.equal((await get("frames/f1")).status, 200);
    assert.equal((await deps.getSessionDetail("tenant-1", "session-1"))?.notes?.[0]?.text, "Useful note");
    writeFileSync(join(dir, frame.file), "tampered");
    assert.equal((await get("frames/f1")).status, 404);
    sourcePath = "../outside.mp4"; writeSource();
    assert.equal((await get("media")).status, 404);
    assert.equal(await deps.getSessionAsset!("tenant-1", "../session-1"), null);
  } finally { await server.close(); rmSync(root, { recursive: true, force: true }); }
});

test('webinar operations enforce scope and exact tenant ownership with bounded redaction', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lkb-operation-api-'));
  const dir = join(root, 'data/webinar-release'); mkdirSync(dir, { recursive: true });
  const file = join(dir, 'operations.json');
  const deps = withSessionArtifacts(fakeBrainReadDeps(), root);
  const server = await startTestServer(buildTestDeps({ brain: deps, keyStore: fakeKeyStore({
    one: { tenantId: 'tenant-1', scopes: ['sessions'] }, two: { tenantId: 'tenant-2', scopes: ['sessions'] }, wrong: { tenantId: 'tenant-1', scopes: ['ask'] }
  }) }));
  const get = (key: string) => fetch(`${server.baseUrl}/webinar-operations`, { headers: { authorization: `Bearer ${key}` } });
  try {
    assert.equal((await fetch(`${server.baseUrl}/webinar-operations`)).status, 401);
    assert.equal((await get('wrong')).status, 403);
    assert.deepEqual(await (await get('one')).json(), { operations: [], omitted: 0 });
    const rows = { webinar: { tenantId: 'tenant-1', title: 'Webinar https://private.test/?token=secret', status: 'failed', attempts: 2, reason: 'provider secret details', artifact: 'C:/private/file', updatedAt: '2026-09-30T12:00:00Z' } };
    writeFileSync(file, JSON.stringify({ version: 1, tenantId: 'tenant-1', operations: rows }));
    const response = await get('one'), body = await response.json() as any;
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(body.operations[0].attempts, 2); assert.equal(body.operations[0].reason, 'processing-failed');
    assert.ok(!JSON.stringify(body).includes('secret')); assert.ok(!JSON.stringify(body).includes('C:/private'));
    assert.deepEqual(await (await get('two')).json(), { operations: [], omitted: 0 });
    for (const reason of ['no-join-link', 'source-discontinuity', 'unproven-calendar-history', 'rejected', 'rescheduled',
      'rescheduled-completed', 'recurring-series', 'unknown-tombstone', 'ambiguous-provider', 'contradictory-revision', 'missing-revision', 'ambiguous-identity']) {
      writeFileSync(file, JSON.stringify({version:1,tenantId:'tenant-1',operations:{webinar:{...rows.webinar,status:'action_required',reason}}}));
      assert.equal(((await (await get('one')).json()) as any).operations[0].reason, reason);
      assert.deepEqual(await (await get('two')).json(), {operations:[],omitted:0});
    }
    const checkedAt = '2026-09-30T12:00:00.000Z';
    const discovery = {calendar: {status:'healthy',checkedAt,lastSuccessAt:checkedAt,notification:{fingerprint:'private-secret'}},
      gmail: {status:'failed',checkedAt}};
    writeFileSync(file, JSON.stringify({version:1,tenantId:'tenant-1',operations:rows,discovery}));
    const projected = await (await get('one')).json() as any;
    assert.deepEqual(projected.discovery, {calendar:{status:'healthy',checkedAt,lastSuccessAt:checkedAt},gmail:{status:'failed',checkedAt}});
    assert.ok(!JSON.stringify(projected).includes('private-secret'));
    assert.deepEqual(await (await get('two')).json(), {operations:[],omitted:0});
    for (const invalid of [[], {}, {...discovery,gmail:{status:'unknown',checkedAt}}, {...discovery,gmail:{status:'failed',checkedAt:'invalid'}},
      {...discovery,calendar:{status:'healthy',checkedAt}}]) {
      writeFileSync(file, JSON.stringify({version:1,tenantId:'tenant-1',operations:rows,discovery:invalid}));
      assert.equal((await get('one')).status,503);
    }
    writeFileSync(file, JSON.stringify({ version: 1, operations: rows })); assert.equal((await get('one')).status, 503);
    writeFileSync(file, JSON.stringify({ version: 1, tenantId: 'tenant-1', operations: { webinar: { ...rows.webinar, tenantId: 'tenant-2' } } })); assert.equal((await get('one')).status, 503);
    writeFileSync(file, '{'); assert.equal((await get('one')).status, 503);
  } finally { await server.close(); rmSync(root, { recursive: true, force: true }); }
});

test('authenticated API owner preflight precedes both discovery loaders and capture', async () => {
  const { createServer } = await import('node:http');
  const {runPipelineTick, createPipelineDeps} = await import(new URL('../../../../scripts/webinar/run-pipeline.mjs', import.meta.url).href);
  const requests: string[] = []; let owner = 'other-tenant', status = 200, redirectDiscovery = false, workHeader: string | undefined = 'lkb_work_release';
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost'), path = url.pathname; requests.push(path);
    if (path === '/webinar-operations') { res.statusCode = status; if (owner) res.setHeader('X-LKB-Tenant', owner); res.end('{}'); }
    else if (redirectDiscovery) { res.statusCode = 302; res.setHeader('Location', '/foreign-discovery'); res.end(); }
    else {
      const requestedSyncToken = url.searchParams.get('syncToken') ?? undefined;
      const calendar = url.searchParams.get('sync') === '1' ? {version:1,tenantId:'fixture',scope:'available-connected-source-state',complete:true,
        mode:requestedSyncToken ? 'sync' : 'baseline',requestedSyncToken,syncToken:'fixture-native',checkedAt:new Date().toISOString(),sourceEvents:[],meetings:[]} : {meetings:[]};
      res.setHeader('content-type', 'application/json'); if (workHeader) res.setHeader('X-LKB-Work-DB', workHeader);
      res.end(JSON.stringify(path === '/calendar/upcoming' ? calendar : path === '/gmail/scan' ? {created: 0, autoApproved: 0} : { candidates: [] }));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const root = mkdtempSync(join(tmpdir(), 'lkb-owner-preflight-')), stateDir = join(root, 'data/webinar-release');
  mkdirSync(stateDir, {recursive: true});
  const calls: any[] = [];
  const f = {root, stateDir, calls, deps: {env: {MONGO_WORK_DB: 'lkb_work_release', LKB_TENANT_ID: 'fixture'}, launch: async (...args: any[]) => calls.push(args)},
    cleanup: () => rmSync(root, {recursive: true, force: true})};
  try {
    const recording = join(root, 'proof.webm'); writeFileSync(recording, 'test artifact');
    writeFileSync(join(stateDir, 'live-proof.json'), JSON.stringify({status:'passed',platform:process.platform,backend:'tab',sessionId:'proof-session',audio:true,video:true,verifiedAt:'2026-09-30T12:00:00Z',recording:'proof.webm'}));
    const env = { ...f.deps.env, LKB_API_URL: `http://127.0.0.1:${(server.address() as {port: number}).port}`, LKB_API_KEY: 'fixture-key' };
    const deps = { ...createPipelineDeps(env), root: f.root, stateDir: f.stateDir, now: () => new Date().toISOString(), log: () => {}, launch: f.deps.launch };
    for (const candidate of ['other-tenant', '']) {
      owner = candidate; requests.length = 0;
      await assert.rejects(runPipelineTick(deps, true), /owner/);
      assert.deepEqual(requests, ['/webinar-operations']); assert.equal(f.calls.length, 0);
    }
    owner = 'fixture'; status = 403; requests.length = 0;
    await assert.rejects(runPipelineTick(deps, true), /owner/); assert.deepEqual(requests, ['/webinar-operations']);
    status = 200; requests.length = 0;
    for (const database of [undefined, 'lkb', 'foreign-work']) {
      workHeader = database; requests.length = 0;
      await assert.rejects(runPipelineTick(deps, true), /discovery/);
      assert.ok(!requests.includes('/gmail/scan')); assert.equal(f.calls.length, 0);
    }
    workHeader = 'lkb_work_release'; requests.length = 0;
    await runPipelineTick(deps, false); assert.ok(!requests.includes('/gmail/scan'));
    requests.length = 0;
    const result = await runPipelineTick(deps, true);
    assert.equal(result.status, 'running'); assert.equal(requests[0], '/webinar-operations');
    assert.ok(requests.includes('/calendar/upcoming')); assert.ok(requests.includes('/meeting-candidates'));
    assert.ok(requests.includes('/gmail/scan'));
    redirectDiscovery = true; requests.length = 0;
    await assert.rejects(runPipelineTick(deps, true));
    assert.ok(!requests.includes('/foreign-discovery')); assert.equal(f.calls.length, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.cleanup(); }
});
