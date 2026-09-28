/**
 * apps/api/src/routes/health.test.ts — in-process HTTP requests against `routes/health.ts` with
 * `fakeHealthDeps`. Covers: healthy -> 200 with real shape; NO Authorization header still works
 * (the deliberate unauthenticated exception); an unhealthy db report -> 503, not 200.
 *
 * U4b/R2 (D-048) adds the watcher-silence detector's cases below: a stale heartbeat alerts, a fresh
 * one does not, a MISSING row alerts (absence is the failure mode), only the stale source alerts,
 * tenants are read one scoped call at a time, the unauthenticated body never names a tenant, and the
 * local `isStale` agrees with scripts/watch/lib/heartbeat.mjs's `isHeartbeatStale` case for case.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeHealthDeps } from "../fixtures.js";
import { detectSilentWatchers, type HeartbeatRow, type WatchSilenceDeps } from "./health.js";

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

test("GET /health with no Authorization header returns 200 with a real report shape", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { db: string; collections: Record<string, number> };
    assert.equal(body.db, "ok");
    assert.equal(body.collections.sessions, 1);
    assert.equal(body.collections.claims, 1);
  } finally {
    await server.close();
  }
});

test("GET /health reports 503, not 200, when the db is unhealthy", async () => {
  const server = await startTestServer(
    buildTestDeps({ health: fakeHealthDeps({ checkHealth: async () => ({ db: "error", collections: {} }) }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 503);
    const body = (await res.json()) as { db: string; collections: Record<string, number> };
    assert.equal(body.db, "error");
    assert.deepEqual(body.collections, {});
  } finally {
    await server.close();
  }
});

// --- U4b/R2: the watcher-silence detector -------------------------------------------------

test("R2: a watcher whose heartbeat is older than the interval produces exactly one alert", async () => {
  const stale = { tenantId: "toc", sourceType: "drive", lastHeartbeatAt: new Date(NOW.getTime() - 3 * HOUR).toISOString() };
  const { deps, alerts } = fakeWatchSilence({ toc: [stale, fresh("toc", "gmail"), fresh("toc", "calendar")] });
  assert.equal(await detectSilentWatchers(deps), 1);
  assert.deepEqual(alerts, [["toc", "drive", stale.lastHeartbeatAt, HOUR]]);
});

test("R2: all-fresh heartbeats produce NO alert (the detector is not a blanket alarm)", async () => {
  const { deps, alerts } = fakeWatchSilence({ toc: allFresh("toc") });
  assert.equal(await detectSilentWatchers(deps), 0);
  assert.deepEqual(alerts, []);
});

test("R2: a source type with NO row at all alerts — absence is the failure mode, not health", async () => {
  // The missing row is the whole point of a separate collection: a field on rows that stop being
  // written cannot detect that they stopped.
  const { deps, alerts } = fakeWatchSilence({ toc: [fresh("toc", "drive")] });
  assert.equal(await detectSilentWatchers(deps), 2);
  assert.deepEqual(alerts.map((a) => a[1]).sort(), ["calendar", "gmail"]);
  // `lastHeartbeatAt` is reported as null, so the operator reads "no run has ever completed".
  assert.deepEqual(alerts.map((a) => a[2]), [null, null]);
});

test("R2: an entirely empty collection alerts once per expected source type, and no more", async () => {
  const { deps, alerts } = fakeWatchSilence({ toc: [] });
  assert.equal(await detectSilentWatchers(deps), 3);
  assert.deepEqual(alerts.map((a) => a[1]).sort(), ["calendar", "drive", "gmail"]);
});

test("R2: the exact interval boundary is fresh, one millisecond past it is silent", async () => {
  const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const rowsAt = (ms: number) =>
    ["drive", "gmail", "calendar"].map((s) => ({ tenantId: "toc", sourceType: s, lastHeartbeatAt: at(ms) }));
  assert.equal(await detectSilentWatchers(fakeWatchSilence({ toc: rowsAt(HOUR) }).deps), 0);
  assert.equal(await detectSilentWatchers(fakeWatchSilence({ toc: rowsAt(HOUR + 1) }).deps), 3);
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
  assert.equal(await detectSilentWatchers(deps), 1);
  // One read per tenant, each carrying that tenant's id — never a single unscoped read of everything.
  assert.deepEqual(reads, ["toc", "other"]);
  assert.deepEqual(alerts, [["other", "drive", staleAt, HOUR]]);
  assert.equal(alerts.every((a) => a[0] !== "toc"), true);
});

test("R2: an unreadable heartbeat collection for one tenant does not stop the others or throw", async () => {
  const { deps, alerts } = fakeWatchSilence(
    { broken: [], toc: [] },
    {
      listHeartbeats: async (t) => {
        if (t === "broken") throw new Error("db down");
        return allFresh(t);
      },
    },
  );
  assert.equal(await detectSilentWatchers(deps), 0);
  assert.deepEqual(alerts, []);
});

test("R2: a throwing alert sink is swallowed — the probe must not die of its own notifier", async () => {
  const { deps } = fakeWatchSilence({ toc: [] }, {
    notifyWatchSilent: () => {
      throw new Error("transport down");
    },
  });
  assert.equal(await detectSilentWatchers(deps), 3);
});

test("R2: /health reports watchSilent as an aggregate count and names no tenant or source type", async () => {
  const { deps } = fakeWatchSilence({ toc: [] });
  const server = await startTestServer(buildTestDeps({ health: fakeHealthDeps({ watchSilence: deps }) }));
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.equal((JSON.parse(raw) as { watchSilent: number }).watchSilent, 3);
    // Unauthenticated route: the body must carry no tenant id and no source type, only the count.
    for (const leak of ["toc", "drive", "gmail", "calendar"]) {
      assert.equal(raw.includes(leak), false, `leaked ${leak}`);
    }
  } finally {
    await server.close();
  }
});

test("R2: /health with an all-fresh watcher set reports watchSilent: 0", async () => {
  const { deps } = fakeWatchSilence({ toc: allFresh("toc") });
  const server = await startTestServer(buildTestDeps({ health: fakeHealthDeps({ watchSilence: deps }) }));
  try {
    const body = (await (await fetch(`${server.baseUrl}/health`)).json()) as { watchSilent: number };
    assert.equal(body.watchSilent, 0);
  } finally {
    await server.close();
  }
});

test("R2: when the db ping fails the detector does not run — every watcher would look silent for that one reason", async () => {
  const { deps, alerts } = fakeWatchSilence({ toc: [] });
  const server = await startTestServer(
    buildTestDeps({
      health: fakeHealthDeps({ checkHealth: async () => ({ db: "error", collections: {} }), watchSilence: deps }),
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { watchSilent?: number }).watchSilent, undefined);
    assert.deepEqual(alerts, []);
  } finally {
    await server.close();
  }
});

test("R2: two probes in a row do not accumulate watchSilent on a shared health report object", async () => {
  const { deps } = fakeWatchSilence({ toc: [] });
  const server = await startTestServer(buildTestDeps({ health: fakeHealthDeps({ watchSilence: deps }) }));
  try {
    const first = (await (await fetch(`${server.baseUrl}/health`)).json()) as { watchSilent: number };
    const second = (await (await fetch(`${server.baseUrl}/health`)).json()) as { watchSilent: number };
    assert.equal(first.watchSilent, 3);
    assert.equal(second.watchSilent, 3);
  } finally {
    await server.close();
  }
});

test("R2: with no watchSilence wired, /health behaves exactly as before U4b (no watchSilent field)", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    const body = (await (await fetch(`${server.baseUrl}/health`)).json()) as Record<string, unknown>;
    assert.equal("watchSilent" in body, false);
  } finally {
    await server.close();
  }
});

test("health.ts's local isStale agrees with scripts/watch/lib/heartbeat.mjs case for case (drift pin)", async () => {
  // The duplicate staleness rule exists only because D-048 authorized six files and the shared home
  // would be a seventh (see health.ts's comment on `isStale`). This test is what keeps the two copies
  // honest: it drives the REAL heartbeat.mjs and the real detector over one case table and requires
  // the same verdict from both. If either implementation changes alone, this goes red.
  const libUrl = new URL("../../../../scripts/watch/lib/heartbeat.mjs", import.meta.url);
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
    const detectorSaysStale = (await detectSilentWatchers(deps)) === 1;
    assert.equal(
      detectorSaysStale,
      lib.isHeartbeatStale(lastHeartbeatAt, NOW, HOUR),
      `disagreement on lastHeartbeatAt=${String(lastHeartbeatAt)}`,
    );
  }
});
