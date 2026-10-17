import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createGuardedFetcher } from "../../packages/ingest/src/index.js";
import type { WatchedSources } from "../../packages/core/src/generated/watched_sources.js";
import type { VerifiedKey } from "../../apps/api/src/auth.js";
import type { ConnectorWorkflowDeps } from "../../apps/api/src/connector-workflow/types.js";
import type { SourceJobView } from "../../apps/api/src/source-intake/jobs/types.js";
import { createConnectorWatchVerifier } from "../../apps/api/src/connector-workflow/watched.js";
import { createWatchedSourceTickHost } from "./host.js";
import { runWatchedSourceSupervisor } from "./supervisor.js";

const NOW = "2026-10-16T00:00:00.000Z";
const auth: VerifiedKey = { tenantId: "A", keyId: "service-a", scopes: ["sources", "ingest"] };
const enabled = { LKB_WATCHED_WORKER_ENABLED: "1", LKB_WATCHED_WORKER_KEY: "fixture-only" };
function fixture(count = 31) {
  const rows: WatchedSources[] = Array.from({ length: count }, (_, n) => ({ _id: `watch-${String(n).padStart(3, "0")}`,
    tenantId: "A", active: true, url: `https://public.example/${n}`, reputationTier: "official", checkIntervalHours: 1,
    lastFetch: { fetchedAt: NOW, hash: "prior", diffFrom: null } }));
  const fetched: string[] = [], enqueued: string[] = [], saved: string[] = [];
  const jobs = new Map<string, SourceJobView>();
  let fail = false, failSave = false, reads = 0, verified = 0;
  const deps = {
    store: {
      assertWritableTenant: () => undefined,
      listWatched: async (tenant: string) => { reads++; return rows.filter(row => row.tenantId === tenant); },
      hasConsumedSource: async () => true,
      resolveWatchedFailures: async () => undefined,
      recordFetch: async (_tenant: string, id: string, prior: string | null, value: WatchedSources["lastFetch"]) => {
        const row = rows.find(row => row._id === id)!;
        if (failSave || (row.lastFetch?.hash ?? null) !== prior) return false;
        row.lastFetch = value; saved.push(id); return true;
      },
      createGap: async () => undefined,
    },
    sourceJobs: {
      poll: async (_tenant: string, id: string) => jobs.get(id) ?? null,
      enqueue: async (input: any, authorize: (value: any) => Promise<unknown>) => {
        await authorize(input); enqueued.push(input.watchedSnapshot.watchedSourceId);
        return { jobId: "fixture-job", state: "queued", revision: 1, createdAt: NOW, updatedAt: NOW };
      },
    },
    watched: { fetcher: createGuardedFetcher({ lookup: async () => ["93.184.216.34"], request: async url => {
      fetched.push(url); if (fail) throw new Error("private-token"); return { status: 200, location: null, body: "snapshot" };
    } }), sink: {}, indexSession: async () => { throw new Error("Jobs must execute downstream separately"); } },
    capabilities: [], now: () => NOW, newId: () => "fixture-gap",
  } as unknown as ConnectorWorkflowDeps;
  const keyStore = { verify: async () => { verified++; return auth; } };
  return { rows, deps, keyStore, fetched, enqueued, saved, jobs,
    counts: () => ({ reads, verified }), fail: (value: boolean) => { fail = value; }, failSave: () => { failSave = true; } };
}

test("31-source cadence visits later due rows after 25 not-due rows, then wraps", async () => {
  const f = fixture(); for (const row of f.rows.slice(25)) delete row.lastFetch;
  const tick = createWatchedSourceTickHost({ workflow: f.deps, keyStore: f.keyStore, env: enabled });
  const first = await tick(); assert.equal(first.outcomes.length, 25); assert.equal(first.remaining, 6); assert.equal(f.fetched.length, 0);
  const second = await tick(); assert.equal(second.status, "queued"); assert.equal(second.outcomes.length, 6);
  assert.deepEqual(f.enqueued, f.rows.slice(25).map(row => row._id)); assert.equal(f.saved.length, 0);
  assert.equal((await tick()).outcomes[0]?.id, "watch-000"); assert.equal(f.counts().verified, 3);
});

test("failed acquisition advances fairly and remains due for a later sweep retry", async () => {
  const f = fixture(); for (const row of f.rows) delete row.lastFetch;
  f.fail(true);
  const tick = createWatchedSourceTickHost({ workflow: f.deps, keyStore: f.keyStore, env: enabled });
  assert.equal((await tick()).status, "attention"); assert.equal(f.fetched.length, 25);
  f.fail(false); assert.equal((await tick()).outcomes[0]?.id, "watch-025");
  assert.equal((await tick()).outcomes[0]?.id, "watch-000");
  assert.equal(f.rows[0]?.lastFetch, undefined); assert.ok(f.enqueued.includes("watch-000"));
});

test("unchanged consumed snapshot skips enqueue; failed hash CAS stays due", async () => {
  const f = fixture(1), row = f.rows[0]!;
  row.lastFetch = { fetchedAt: "2026-10-14T00:00:00.000Z", hash: createHash("sha256").update("snapshot").digest("hex"),
    diffFrom: null, sourceRef: "source", sessionId: "session" };
  const verify = createConnectorWatchVerifier(f.deps);
  f.failSave(); assert.equal((await verify("A", auth)).outcomes[0]?.status, "failed");
  assert.equal(row.lastFetch.fetchedAt, "2026-10-14T00:00:00.000Z");
  const ok = fixture(1); ok.rows[0]!.lastFetch = structuredClone(row.lastFetch);
  assert.equal((await createConnectorWatchVerifier(ok.deps)("A", auth)).outcomes[0]?.status, "unchanged");
  assert.equal(ok.enqueued.length, 0); assert.equal(ok.saved.length, 1);
});

test("deleted cursor resumes lexically, and restart preserves persisted due work", async () => {
  const f = fixture(); const verify = createConnectorWatchVerifier(f.deps);
  await verify("A", auth); f.rows.splice(24, 1);
  assert.equal((await verify("A", auth)).outcomes[0]?.id, "watch-025");
  const restarted = createConnectorWatchVerifier(f.deps);
  assert.equal((await restarted("A", auth)).outcomes[0]?.id, "watch-000");
  assert.equal((await restarted("A", auth)).outcomes[0]?.id, "watch-026");
});

test("whole result tenant/ID corruption refuses before acquisition, even past batch boundary", async () => {
  const f = fixture(); f.deps.store.listWatched = async () => f.rows;
  f.rows[30]!.tenantId = "B";
  await assert.rejects(createConnectorWatchVerifier(f.deps)("A", auth), /watched_tenant_mismatch/);
  assert.equal(f.fetched.length, 0);
  f.rows[30]!.tenantId = "A"; f.rows[30]!._id = f.rows[0]!._id;
  await assert.rejects(createConnectorWatchVerifier(f.deps)("A", auth), /watched_identity_invalid/);
});

test("host defaults disabled, rechecks revoked/scoped identity, resets rotation and refuses overlap", async () => {
  const f = fixture();
  await createWatchedSourceTickHost({ workflow: f.deps, keyStore: f.keyStore, env: {} })();
  assert.deepEqual(f.counts(), { reads: 0, verified: 0 });
  let current: VerifiedKey | null = auth;
  let release: (() => void) | undefined;
  const keyStore = { verify: async () => current };
  const tick = createWatchedSourceTickHost({ workflow: f.deps, keyStore, env: enabled });
  await tick(); current = { ...auth, keyId: "replacement" }; assert.equal((await tick()).outcomes[0]?.id, "watch-000");
  current = { ...auth, scopes: ["sources"] }; await assert.rejects(tick(), /unauthorized/);
  current = null; await assert.rejects(tick(), /unauthorized/);
  current = { ...auth, tenantId: "B" }; assert.equal((await tick()).outcomes.length, 0);
  current = auth;
  f.deps.store.listWatched = async () => { await new Promise<void>(resolve => { release = resolve; }); return f.rows; };
  const pending = tick(); await Promise.resolve(); await Promise.resolve();
  assert.equal((await tick()).status, "busy"); release!(); await pending;
  delete f.deps.sourceJobs; await assert.rejects(tick(), /unavailable/);
});

test("supervisor is passive while disabled; abort drains tick and sanitizes failure", async () => {
  const f = fixture(), controller = new AbortController(), logs: string[] = [];
  await runWatchedSourceSupervisor({ workflow: f.deps, keyStore: f.keyStore, env: {}, signal: controller.signal });
  assert.equal(f.counts().reads, 0);
  await runWatchedSourceSupervisor({ workflow: f.deps, env: enabled, signal: controller.signal,
    keyStore: { verify: async () => { controller.abort(); throw new Error("private-token"); } }, log: value => logs.push(value) });
  assert.deepEqual(logs, ["Watched worker unavailable or unauthorized; no successful cycle established."]);
  await runWatchedSourceSupervisor({ workflow: f.deps, keyStore: f.keyStore, env: enabled, signal: controller.signal });
  assert.equal(f.counts().reads, 0);
});
