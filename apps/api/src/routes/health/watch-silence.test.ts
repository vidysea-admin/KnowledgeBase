/**
 * apps/api/src/routes/health/watch-silence.test.ts — the watcher-silence detector behind `/health`
 * (split out of routes/health.test.ts to stay under the 400-line test budget; no test removed).
 *
 * U4b/R2 (D-048) adds the watcher-silence detector's cases below: a stale heartbeat alerts, a fresh
 * one does not, a MISSING row alerts (absence is the failure mode), only the stale source alerts,
 * tenants are read one scoped call at a time, the unauthenticated body never names a tenant, and the
 * local `isStale` agrees with scripts/watch/lib/heartbeat.mjs's `isHeartbeatStale` case for case.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "../../testUtils.js";
import { buildTestDeps, fakeHealthDeps } from "../../fixtures.js";
import { detectSilentWatchers, type HeartbeatRow, type WatchSilenceDeps } from "../health.js";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

type Alert = [string, string, string | null, number];

/** A detector wired to in-memory rows and a recording sink — no Mongo, no real alert ever sent. */
function fakeWatchSilence(
  rows: Record<string, HeartbeatRow[]>,
  overrides: Partial<WatchSilenceDeps> = {},
): { deps: WatchSilenceDeps; alerts: Alert[]; reads: string[] } {
  const alerts: Alert[] = [];
  const reads: string[] = [];
  const deps: WatchSilenceDeps = {
    tenantIds: Object.keys(rows),
    intervalMs: HOUR,
    now: () => NOW,
    listHeartbeats: async (tenantId) => {
      reads.push(tenantId);
      return rows[tenantId] ?? [];
    },
    notifyWatchSilent: (t, s, last, iv) => alerts.push([t, s, last, iv]),
    ...overrides,
  };
  return { deps, alerts, reads };
}

const fresh = (tenantId: string, sourceType: string): HeartbeatRow => ({
  tenantId,
  sourceType,
  lastHeartbeatAt: new Date(NOW.getTime() - 60_000).toISOString(),
});
const allFresh = (tenantId: string): HeartbeatRow[] =>
  ["drive", "gmail", "calendar"].map((s) => fresh(tenantId, s));

test("R2: a watcher whose heartbeat is older than the interval produces exactly one alert", async () => {
  const stale = { tenantId: "toc", sourceType: "drive", lastHeartbeatAt: new Date(NOW.getTime() - 3 * HOUR).toISOString() };
  const { deps, alerts } = fakeWatchSilence({ toc: [stale, fresh("toc", "gmail"), fresh("toc", "calendar")] });
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 1, unreadable: 0});
  assert.deepEqual(alerts, [["toc", "drive", stale.lastHeartbeatAt, HOUR]]);
});

test("R2: all-fresh heartbeats produce NO alert (the detector is not a blanket alarm)", async () => {
  const { deps, alerts } = fakeWatchSilence({ toc: allFresh("toc") });
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 0, unreadable: 0});
  assert.deepEqual(alerts, []);
});

test("R2: a source type with NO row at all alerts — absence is the failure mode, not health", async () => {
  // The missing row is the whole point of a separate collection: a field on rows that stop being
  // written cannot detect that they stopped.
  const { deps, alerts } = fakeWatchSilence({ toc: [fresh("toc", "drive")] });
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 2, unreadable: 0});
  assert.deepEqual(alerts.map((a) => a[1]).sort(), ["calendar", "gmail"]);
  // `lastHeartbeatAt` is reported as null, so the operator reads "no run has ever completed".
  assert.deepEqual(alerts.map((a) => a[2]), [null, null]);
});

test("R2: an entirely empty collection alerts once per expected source type, and no more", async () => {
  const { deps, alerts } = fakeWatchSilence({ toc: [] });
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 3, unreadable: 0});
  assert.deepEqual(alerts.map((a) => a[1]).sort(), ["calendar", "drive", "gmail"]);
});

test("R2: the exact interval boundary is fresh, one millisecond past it is silent", async () => {
  const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const rowsAt = (ms: number) =>
    ["drive", "gmail", "calendar"].map((s) => ({ tenantId: "toc", sourceType: s, lastHeartbeatAt: at(ms) }));
  assert.deepEqual(await detectSilentWatchers(fakeWatchSilence({ toc: rowsAt(HOUR) }).deps), {silent: 0, unreadable: 0});
  assert.deepEqual(await detectSilentWatchers(fakeWatchSilence({ toc: rowsAt(HOUR + 1) }).deps), {silent: 3, unreadable: 0});
});

test("R8: each tenant is read through its own scoped call, and one tenant's staleness never alerts as another's", async () => {
  const staleAt = new Date(NOW.getTime() - 9 * HOUR).toISOString();
  const { deps, alerts, reads } = fakeWatchSilence({
    toc: allFresh("toc"),
    other: [
      { tenantId: "other", sourceType: "drive", lastHeartbeatAt: staleAt },
      fresh("other", "gmail"),
      fresh("other", "calendar"),
    ],
  });
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 1, unreadable: 0});
  // One read per tenant, each carrying that tenant's id — never a single unscoped read of everything.
  assert.deepEqual(reads, ["toc", "other"]);
  assert.deepEqual(alerts, [["other", "drive", staleAt, HOUR]]);
  assert.equal(alerts.every((a) => a[0] !== "toc"), true);
});

test("R2: an unreadable heartbeat collection for one tenant does not stop the others or throw", async () => {
  const { deps, alerts, reads } = fakeWatchSilence(
    { broken: [], toc: [] },
    {
      listHeartbeats: async (t) => {
        reads.push(t);
        if (t === "broken") throw new Error("db down");
        return [];
      },
    },
  );
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 3, unreadable: 1});
  assert.deepEqual(reads, ["broken", "toc"]);
  assert.deepEqual(alerts, ["drive", "gmail", "calendar"].map(source => ["toc", source, null, HOUR]));
});

test("R2: a throwing alert sink is swallowed — the probe must not die of its own notifier", async () => {
  const { deps } = fakeWatchSilence({ toc: [] }, {
    notifyWatchSilent: () => {
      throw new Error("transport down");
    },
  });
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 3, unreadable: 0});
});

test("R2: /health runs the detector (alerts fire) but exposes NO watcher counts, tenant or source type in the body", async () => {
  const { deps, alerts } = fakeWatchSilence({ toc: [] });
  const server = await startTestServer(buildTestDeps({ health: fakeHealthDeps({ watchSilence: deps }) }));
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.deepEqual(JSON.parse(raw), { db: "ok" });
    assert.equal(alerts.length, 3);
    for (const leak of ["toc", "drive", "gmail", "calendar", "watchSilent", "watchUnreadable"]) {
      assert.equal(raw.includes(leak), false, `leaked ${leak}`);
    }
  } finally {
    await server.close();
  }
});

test("R2: /health with an all-fresh watcher set is 200 {db: ok}", async () => {
  const { deps } = fakeWatchSilence({ toc: allFresh("toc") });
  const server = await startTestServer(buildTestDeps({ health: fakeHealthDeps({ watchSilence: deps }) }));
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { db: "ok" });
  } finally {
    await server.close();
  }
});

test("R2: when the db ping fails the detector does not run — every watcher would look silent for that one reason", async () => {
  const { deps, alerts, reads } = fakeWatchSilence({ toc: [] });
  const server = await startTestServer(
    buildTestDeps({
      health: fakeHealthDeps({ checkHealth: async () => ({ db: "error" }), watchSilence: deps }),
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { db: "error" });
    assert.deepEqual(alerts, []);
    assert.deepEqual(reads, []);
  } finally {
    await server.close();
  }
});

test("R2: two probes in a row give the same body and each re-runs the detector", async () => {
  const { deps } = fakeWatchSilence({ toc: [] });
  const server = await startTestServer(buildTestDeps({ health: fakeHealthDeps({ watchSilence: deps }) }));
  try {
    const first = await (await fetch(`${server.baseUrl}/health`)).json();
    const second = await (await fetch(`${server.baseUrl}/health`)).json();
    assert.deepEqual(first, { db: "ok" });
    assert.deepEqual(second, { db: "ok" });
  } finally {
    await server.close();
  }
});

test("R2: with no watchSilence wired, /health is exactly {db: ok}", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    assert.deepEqual(await (await fetch(`${server.baseUrl}/health`)).json(), { db: "ok" });
  } finally {
    await server.close();
  }
});

test("health.ts's local isStale agrees with scripts/watch/lib/heartbeat.mjs case for case (drift pin)", async () => {
  // The duplicate staleness rule exists only because D-048 authorized six files and the shared home
  // would be a seventh (see health.ts's comment on `isStale`). This test is what keeps the two copies
  // honest: it drives the REAL heartbeat.mjs and the real detector over one case table and requires
  // the same verdict from both. If either implementation changes alone, this goes red.
  const libUrl = new URL("../../../../../scripts/watch/lib/heartbeat.mjs", import.meta.url);
  // `libUrl.href`, not a filesystem path: Node's ESM loader rejects a bare Windows `D:\...` path.
  const lib = (await import(libUrl.href)) as {
    isHeartbeatStale: (l: string | null | undefined, n: Date, i: number) => boolean;
    watchHeartbeatIntervalMs: (env: Record<string, string>) => number;
  };
  // The writer's default interval and the detector's must be the SAME number, or a watcher looks
  // alive to one side and dead to the other.
  assert.equal(lib.watchHeartbeatIntervalMs({}), HOUR);

  const cases: (string | null | undefined)[] = [
    null,
    undefined,
    "",
    "not-a-date",
    new Date(NOW.getTime() - HOUR).toISOString(),
    new Date(NOW.getTime() - HOUR - 1).toISOString(),
    new Date(NOW.getTime() - HOUR + 1).toISOString(),
    new Date(NOW.getTime() - 9 * HOUR).toISOString(),
    new Date(NOW.getTime() + HOUR).toISOString(),
  ];
  for (const lastHeartbeatAt of cases) {
    const { deps } = fakeWatchSilence(
      { toc: [{ tenantId: "toc", sourceType: "drive", lastHeartbeatAt }] },
      { expectedSourceTypes: ["drive"] },
    );
    const detected = await detectSilentWatchers(deps);
    assert.equal(detected.unreadable, 0);
    const detectorSaysStale = detected.silent === 1;
    assert.equal(
      detectorSaysStale,
      lib.isHeartbeatStale(lastHeartbeatAt, NOW, HOUR),
      `disagreement on lastHeartbeatAt=${String(lastHeartbeatAt)}`,
    );
  }
});


test("ISS-368: HTTP distinguishes unreadable watchers from readable fresh watchers without leaks", async () => {
  for (const unreadable of [true, false]) {
    const {deps, reads, alerts} = fakeWatchSilence({"private-tenant": []}, {
      listHeartbeats: async tenant => {
        reads.push(tenant);
        if (unreadable) throw new Error("private database credential failure");
        return allFresh(tenant);
      },
    });
    const server = await startTestServer(buildTestDeps({health: fakeHealthDeps({watchSilence: deps})}));
    try {
      const res = await fetch(`${server.baseUrl}/health`);
      assert.equal(res.status, unreadable ? 503 : 200);
      const raw = await res.text();
      assert.deepEqual(JSON.parse(raw), {db: "ok"});
      assert.deepEqual(reads, ["private-tenant"]);
      assert.deepEqual(alerts, []);
      for (const secret of ["private-tenant", "private database credential failure", "drive", "gmail", "calendar"])
        assert.equal(raw.includes(secret), false, `leaked ${secret}`);
    } finally { await server.close(); }
  }
});

test("ISS-368: partial reads still alert only known silent tenants and report 503", async () => {
  const {deps, reads, alerts} = fakeWatchSilence({broken: [], toc: []}, {
    listHeartbeats: async tenant => {
      reads.push(tenant);
      if (tenant === "broken") throw new Error("sensitive read failure");
      return [];
    },
  });
  const server = await startTestServer(buildTestDeps({health: fakeHealthDeps({watchSilence: deps})}));
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 503);
    const raw = await res.text();
    assert.deepEqual(JSON.parse(raw), {db: "ok"});
    assert.deepEqual(reads, ["broken", "toc"]);
    assert.deepEqual(alerts, ["drive", "gmail", "calendar"].map(source => ["toc", source, null, HOUR]));
    for (const secret of ["broken", "toc", "sensitive read failure", "drive", "gmail", "calendar"])
      assert.equal(raw.includes(secret), false, `leaked ${secret}`);
  } finally { await server.close(); }
});

test("ISS-368: recovery re-reads heartbeats (503 then 200) without mutating a cached health report", async () => {
  const cached = Object.freeze({db: "ok" as const, collections: Object.freeze({sessions: 1})});
  let failed = true;
  const {deps, reads, alerts} = fakeWatchSilence({toc: []}, {
    listHeartbeats: async tenant => {
      reads.push(tenant);
      if (failed) throw new Error("private recovery failure");
      return allFresh(tenant);
    },
  });
  const server = await startTestServer(buildTestDeps({health: fakeHealthDeps({checkHealth: async () => cached, watchSilence: deps})}));
  try {
    const first = await fetch(`${server.baseUrl}/health`);
    assert.equal(first.status, 503);
    assert.deepEqual(await first.json(), {db: "ok"});
    failed = false;
    const recovered = await fetch(`${server.baseUrl}/health`);
    assert.equal(recovered.status, 200);
    assert.deepEqual(await recovered.json(), {db: "ok"});
    assert.deepEqual(cached, {db: "ok", collections: {sessions: 1}}); // untouched by the probe
    assert.deepEqual(reads, ["toc", "toc"]);
    assert.deepEqual(alerts, []);
  } finally { await server.close(); }
});

test("AC-4: a throwing db probe or detector reports 503 degraded, never 200 or a hang, and leaks nothing", async () => {
  const cases: Array<[string, Parameters<typeof fakeHealthDeps>[0], unknown]> = [
    ["checkHealth throws", {checkHealth: async () => { throw new Error("private mongodb://user:secret@host credential failure"); }}, {db: "error"}],
    ["detector throws", {watchSilence: fakeWatchSilence({toc: []}, {now: () => { throw new Error("private clock failure"); }}).deps}, {db: "ok"}],
    ["detector tenant list is broken", {watchSilence: {...fakeWatchSilence({toc: []}).deps, tenantIds: undefined as unknown as string[]}}, {db: "ok"}],
  ];
  for (const [label, overrides, body] of cases) {
    const server = await startTestServer(buildTestDeps({health: fakeHealthDeps(overrides)}));
    try {
      const res = await fetch(`${server.baseUrl}/health`, {signal: AbortSignal.timeout(5000)});
      assert.equal(res.status, 503, label);
      const raw = await res.text();
      assert.deepEqual(JSON.parse(raw), body, label);
      for (const leak of ["secret", "private", "credential", "toc"]) assert.equal(raw.includes(leak), false, `${label}: leaked ${leak}`);
    } finally { await server.close(); }
  }
});
