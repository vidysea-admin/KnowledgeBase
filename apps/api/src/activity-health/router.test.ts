import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import express from "express";
import { Collection, MongoClient } from "mongodb";
import { requireAuth } from "../auth.js";
import { createServer, startServer } from "../server.js";
import { buildProductionDeps } from "../production.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { createActivityHealthRouter } from "./router.js";
import { createConfiguredActivityHealthDeps, createQueueActivityHealthReader, readQueueConfiguration, type QueueReadCollection } from "./queue-reader.js";
import type { ActivityHealthDeps } from "./types.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const env = { UPLOAD_TENANT_ID: "owner", UPLOAD_ACTOR: "operator", UPLOAD_QUEUE_DB: "upload_queue_fixture01", MONGODB_URL: "mongodb://fixture.invalid" };
const row = { _id: "a".repeat(64), tenantId: "owner", kind: "transcribe.rpc", status: "pending", createdAt: "2026-10-09T12:00:00Z", deadlineMs: Date.parse("2026-10-09T12:30:00Z"), attempts: 0, maxAttempts: 2 };
const options = (key = "owner") => ({ headers: { authorization: `Bearer ${key}` } });
const keyStore = fakeKeyStore({ owner: { tenantId: "owner", scopes: ["jobs"] }, foreign: { tenantId: "foreign", scopes: ["jobs"] }, limited: { tenantId: "owner", scopes: ["sessions"] } });
async function fixture(deps: ActivityHealthDeps, run: (url: string) => Promise<void>) {
  const app = express(); app.use(express.json()); app.use(requireAuth(keyStore)); app.use(createActivityHealthRouter(deps));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}`); } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
function memoryReader(rows = [row], calls: unknown[] = []): QueueReadCollection {
  return { find(filter, config) {
    calls.push([filter, config]); const selected = rows.filter(value => value.tenantId === filter.tenantId && value.kind === filter.kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b._id.localeCompare(a._id));
    return { toArray: async () => selected.slice(0, config.limit) };
  } };
}
test("auth/scope, strict selectors and GET bodies refuse before reads", async () => {
  let reads = 0;
  const deps = createQueueActivityHealthReader(readQueueConfiguration(env), memoryReader());
  await fixture({ readActivityHealth: async (tenant, limit) => { reads++; return deps.readActivityHealth(tenant, limit); } }, async url => {
    for (const key of [undefined, "bad", "limited"]) assert.equal((await fetch(`${url}/activity-health`, key ? options(key) : {})).status, key === "limited" ? 403 : 401);
    const corpus = ["limit=0", "limit=101", "limit=-1", "limit=01", "limit=1.0", "limit=1e2", "limit=", "limit=%201", "limit=1&limit=2", "limit[]=1", "limit[x]=1", "tenantId=foreign", "tenant=foreign", "database=main", "status=done", "__proto__=foreign"];
    for (const query of corpus) assert.equal((await fetch(`${url}/activity-health?${query}`, options())).status, 400, query);
    for (const body of [{ tenantId: "foreign" }, { limit: 1 }, ["foreign"]]) {
      const bytes = JSON.stringify(body), status = await new Promise<number>((resolve, reject) => {
        const call = request(`${url}/activity-health`, { method: "GET", headers: { ...options().headers, "content-type": "application/json", "content-length": Buffer.byteLength(bytes) } }, response => { response.resume(); response.on("end", () => resolve(response.statusCode!)); }); call.on("error", reject); call.end(bytes);
      }); assert.equal(status, 400);
    }
    assert.equal(reads, 0);
    const good = await fetch(`${url}/activity-health?limit=1`, { headers: { ...options().headers, "x-tenant-id": "foreign" } }); assert.equal(good.status, 200); assert.equal(good.headers.get("cache-control"), "private, no-store");
    assert.equal(reads, 1);
  });
});
test("configured/unconfigured/foreign/error output remains sanitized and distinguishes empty", async () => {
  await fixture(createConfiguredActivityHealthDeps({}, async () => { throw new Error("unexpected connector"); }), async url => {
    const result = await fetch(`${url}/activity-health`, options()); assert.equal(result.status, 503); assert.ok(!(await result.text()).includes("unexpected"));
  });
  await fixture(createQueueActivityHealthReader(readQueueConfiguration(env), memoryReader([])), async url => {
    assert.equal((await fetch(`${url}/activity-health`, options("foreign"))).status, 503);
    const result = await fetch(`${url}/activity-health`, options()); assert.equal(result.status, 200); assert.deepEqual((await result.json() as { jobs: unknown[] }).jobs, []);
  });
  await fixture({ readActivityHealth: async () => { throw new Error("SECRET URI actor path"); } }, async url => {
    const result = await fetch(`${url}/activity-health`, options()); assert.equal(result.status, 503); assert.ok(!(await result.text()).includes("SECRET"));
  });
});

const pythonFixture = String.raw`
import sys,json,copy
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'workers/transcribe/src'))
from job_queue import JobQueue
rows=json.load(sys.stdin); clock=int(rows[0]['deadlineMs'])-10000
def match(row,query):
 for key,value in query.items():
  if key=='$or':
   if not any(match(row,part) for part in value):return False
  elif key=='$expr':
   op,args=next(iter(value.items()));left,right=[row[a[1:]] for a in args]
   if not (left<right if op=='$lt' else left>=right):return False
  elif isinstance(value,dict):
   for op,wanted in value.items():
    actual=row.get(key)
    if op=='$exists' and (key in row)!=wanted:return False
    if op=='$in' and actual not in wanted:return False
    if op=='$lte' and (actual is None or actual>wanted):return False
    if op=='$gt' and (actual is None or actual<=wanted):return False
  elif row.get(key)!=value:return False
 return True
def update(row,changes):
 row.update(changes.get('$set',{}))
 for key,value in changes.get('$inc',{}).items():row[key]+=value
 for key in changes.get('$unset',{}):row.pop(key,None)
class Result:
 def __init__(self,n):self.modified_count=n
class PrivateCollection:
 def update_many(self,query,changes):
  for row in rows:
   if match(row,query):update(row,changes)
 def find_one_and_update(self,query,changes,**options):
  for row in sorted(rows,key=lambda row:row['createdAt']):
   if match(row,query):update(row,changes);return copy.deepcopy(row)
 def update_one(self,query,changes):
  for row in rows:
   if match(row,query):update(row,changes);return Result(1)
  return Result(0)
collection=PrivateCollection(); queue=JobQueue(collection,'owner',lease_ms=100)
with patch('job_queue.now_ms',lambda:clock),patch('job_queue.iso',lambda:'2026-10-09T12:01:00Z'):
 first=queue.claim();assert first['attempts']==1
 rows[0]['leaseUntilMs']=clock-1
 second=queue.claim();assert second['attempts']==2 and first['claimToken']!=second['claimToken']
 assert not queue.finish(first,response={'status':200,'headers':{},'body':{}})
 assert queue.finish(second,response={'status':200,'headers':{},'body':{'fixture':True}})
 for index,changes in enumerate([
  {'status':'processing','attempts':2,'leaseUntilMs':clock-1,'claimToken':'expired'},
  {'status':'pending','attempts':0,'deadlineMs':clock-1},
  {'status':'failed','attempts':1,'error':'worker-operation-failed','cancelledAt':'2026-10-09T12:01:00Z'},
  {'status':'processing','attempts':1,'maxAttempts':1,'leaseUntilMs':clock-1,'claimToken':'one'},
  {'status':'pending','attempts':0,'cancelledAt':'2026-10-09T12:01:00Z'},
  {'status':'pending','attempts':0,'tenantId':'foreign'}]):
   candidate=copy.deepcopy(first);candidate['_id']=format(index+1,'064x');candidate.update(changes);rows.append(candidate)
 assert queue.claim() is None
 assert rows[1]['status']=='failed' and rows[2]['status']=='failed' and rows[4]['status']=='failed'
 assert rows[3]['status']=='failed' and rows[5]['status']=='pending' and rows[6]['status']=='pending'
 print(json.dumps({'rows':rows,'firstAttempts':first['attempts'],'reclaimedAttempts':second['attempts'],'staleOwnerFenced':True,'terminalDeadlineCancelExhaustionFenced':True}))
`;
test("actual producer -> Python first/reclaim/fences -> real production Mongo binding -> authenticated current server -> consumer output", { timeout: 20000 }, async () => {
  const queueModule = await import(new URL("../../../../scripts/upload/queue.mjs", import.meta.url).href);
  const parent = join(root, ".cache", "coordination", "t057-d2-private"); await mkdir(parent, { recursive: true }); const spoolRoot = await mkdtemp(join(parent, "spool-"));
  let produced: Record<string, unknown> | null = null, finished: Record<string, unknown> | null = null;
  const queue = { tenantId: "owner", scope: (filter: object) => ({ ...filter, tenantId: "owner" }), jobs: {
    updateOne: async (_filter: unknown, update: { $setOnInsert?: Record<string, unknown> }) => { if (update.$setOnInsert) produced = update.$setOnInsert; },
    findOne: async () => finished ?? produced,
  } };
  const transport = await queueModule.createQueueTransport(queue, { spoolRoot, runId: "b".repeat(64), timeoutMs: 10000, pollMs: 10 });
  const pending = transport({ method: "GET", url: "https://generativelanguage.googleapis.com/v1beta/files/fixture?key=private-fixture-key", headers: {} });
  for (let n = 0; n < 100 && !produced; n++) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(produced);
  assert.equal(JSON.stringify(produced).includes("private-fixture-key"), false);
  const child = spawnSync(process.env.D2_FIXTURE_PYTHON ?? join(root, ".venv", "Scripts", "python.exe"), ["-c", pythonFixture], { cwd: root, input: JSON.stringify([produced]), encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr); const proof = JSON.parse(child.stdout) as { rows: typeof row[]; firstAttempts: number; reclaimedAttempts: number; staleOwnerFenced: boolean; terminalDeadlineCancelExhaustionFenced: boolean };
  finished = proof.rows[0]!; assert.equal((await pending).status, 200);
  const calls: unknown[] = []; const safeCollection = memoryReader(proof.rows, calls);
  let connections = 0, closes = 0;
  const connectMock = mock.method(MongoClient.prototype, "connect", async function (this: MongoClient) { connections++; return this; });
  const findMock = mock.method(Collection.prototype, "find", function (this: Collection, filter: Record<string, unknown>, config: Parameters<QueueReadCollection["find"]>[1]) { assert.equal(this.namespace, `${env.UPLOAD_QUEUE_DB}.jobs`); return safeCollection.find(filter, config); });
  const closeMock = mock.method(MongoClient.prototype, "close", async () => { closes++; });
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, env); const deps = buildProductionDeps(); assert.equal(connections, 0); assert.ok(deps.activityHealth);
    const server = startServer({ ...deps, keyStore, rateLimit: { max: 1000 } }, 0); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string");
    try {
      const url = `http://127.0.0.1:${address.port}/activity-health`;
      assert.equal((await fetch(url)).status, 401); assert.equal((await fetch(url, options("limited"))).status, 403); assert.equal((await fetch(url, options("foreign"))).status, 503); assert.equal(connections, 0);
      const response = await fetch(url, options()); assert.equal(response.status, 200); const body = await response.json(); assert.equal(connections, 1);
      assert.ok(!JSON.stringify(body).includes("claimToken")); assert.ok(!JSON.stringify(body).includes("foreign"));
      const output = { response: body, producerWorkerProof: { firstAttempts: proof.firstAttempts, reclaimedAttempts: proof.reclaimedAttempts, staleOwnerFenced: proof.staleOwnerFenced, terminalDeadlineCancelExhaustionFenced: proof.terminalDeadlineCancelExhaustionFenced }, selectedDatabase: env.UPLOAD_QUEUE_DB, httpStatus: response.status };
      await writeFile(join(root, ".cache", "coordination", "t057-d2-runtime-output.json"), JSON.stringify(output, null, 2));
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await deps.activityHealth.close?.(); }
    assert.equal(closes, 1);
    const missing = createServer({ ...buildTestDeps(), keyStore }); const server2 = missing.listen(0, "127.0.0.1"); await once(server2, "listening"); const address2 = server2.address(); assert.ok(address2 && typeof address2 !== "string");
    try { assert.equal((await fetch(`http://127.0.0.1:${address2.port}/activity-health`, options())).status, 503); } finally { await new Promise<void>((resolve, reject) => server2.close(error => error ? reject(error) : resolve())); }
  } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    connectMock.mock.restore(); findMock.mock.restore(); closeMock.mock.restore();
  }
});
