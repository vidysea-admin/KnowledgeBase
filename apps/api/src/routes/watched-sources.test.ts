/**
 * apps/api/src/routes/watched-sources.test.ts — A13, the entrypoint T-027 never built.
 *
 * T-027 shipped the schema, the tenant-scoped accessors (`createWatchedSource`, `recordFetch`,
 * `listActive`) and the pure due-check, all checker-PASSed — and then nothing called them. Its own
 * module comment says "a future scheduler runs `listActive`". The collection has been empty ever
 * since, which is exactly why catalogue A13 scores MISSING: the probe is `collection
 * watched_sources (empty)`.
 *
 * So the gap was never the logic. It was that no user action could reach it.
 *
 * U4d (D-047/D-048/ISS-361/ISS-358) adds `GET /watch-state`'s tests below (search "U4d"). They live
 * in THIS file, not a new one, for the same dirsize reason ISS-C-UNRUN-WRITERS-017's tests do
 * (see the comment further down) — `apps/api/src` and `apps/api/src/routes/` are both at/over their
 * `lint-dirsize` budget, so the fix for ISS-358 must not be the cause of a new violation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import type { WatchHeartbeat, WatchState } from "@lkb/core";

import { isGuardedFetcher } from "@lkb/ingest";

import { startTestServer } from "../testUtils.js";
import { createWatchedRunDeps } from "../store.js";
import { buildTestDeps, fakeKeyStore, fakeWatchedSourceDeps } from "../fixtures.js";
import type { WatchedSourceDeps } from "./watched-sources.js";

const key = (scopes: string[]) => fakeKeyStore({ "ws-key": { tenantId: "tenant-1", scopes } });

/** U4d: a fake read surface for `GET /watch-state`, partitioned BY TENANT like
 * `fakeWatchedSourceDeps`'s own `byTenant` map above (ISS-C-UNRUN-WRITERS-018's lesson: a fake that
 * ignores tenantId cannot fail an isolation test). Defined here rather than in fixtures.ts, which
 * is itself at 299/300 non-blank lines with no room to grow. */
function fakeWatchStateReadDeps(
  stateByTenant: Record<string, WatchState[]> = {},
  heartbeatsByTenant: Record<string, WatchHeartbeat[]> = {},
  heartbeatIntervalMs = 60 * 60 * 1000,
): Pick<WatchedSourceDeps, "listWatchState" | "listHeartbeats" | "heartbeatIntervalMs"> {
  return {
    listWatchState: async (tenantId) => stateByTenant[tenantId] ?? [],
    listHeartbeats: async (tenantId) => heartbeatsByTenant[tenantId] ?? [],
    heartbeatIntervalMs,
  };
}

test("POST /watched-sources registers a source and returns it", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: key(["sources"]) }));
  try {
    const res = await fetch(`${server.baseUrl}/watched-sources`, {
      method: "POST",
      headers: { authorization: "Bearer ws-key", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.ac.uk/fees", reputationTier: "official", checkIntervalHours: 24 }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { source: { url: string; active: boolean; _id: string } };
    assert.equal(body.source.url, "https://example.ac.uk/fees");
    assert.equal(body.source.active, true, "a newly registered source is active by default");
    assert.ok(body.source._id.length > 0);
  } finally {
    await server.close();
  }
});

test("GET /watched-sources lists what was registered", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: key(["sources"]) }));
  try {
    await fetch(`${server.baseUrl}/watched-sources`, {
      method: "POST",
      headers: { authorization: "Bearer ws-key", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.ac.uk/fees", reputationTier: "official", checkIntervalHours: 24 }),
    });
    const res = await fetch(`${server.baseUrl}/watched-sources`, { headers: { authorization: "Bearer ws-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { sources: { url: string }[] };
    assert.equal(body.sources.length, 1);
    assert.equal(body.sources[0]?.url, "https://example.ac.uk/fees");
  } finally {
    await server.close();
  }
});

test("a url that is not http(s) is rejected, never stored", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: key(["sources"]) }));
  try {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "not-a-url", ""]) {
      const res = await fetch(`${server.baseUrl}/watched-sources`, {
        method: "POST",
        headers: { authorization: "Bearer ws-key", "content-type": "application/json" },
        body: JSON.stringify({ url, reputationTier: "official", checkIntervalHours: 24 }),
      });
      assert.equal(res.status, 400, `${JSON.stringify(url)} must be refused`);
    }
    const list = await fetch(`${server.baseUrl}/watched-sources`, { headers: { authorization: "Bearer ws-key" } });
    const body = (await list.json()) as { sources: unknown[] };
    assert.equal(body.sources.length, 0, "nothing was stored");
  } finally {
    await server.close();
  }
});

test("an unknown reputationTier is rejected -- the schema enumerates exactly three", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: key(["sources"]) }));
  try {
    const res = await fetch(`${server.baseUrl}/watched-sources`, {
      method: "POST",
      headers: { authorization: "Bearer ws-key", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", reputationTier: "gold", checkIntervalHours: 24 }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("a non-positive checkIntervalHours is rejected -- it would make the source due forever", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: key(["sources"]) }));
  try {
    for (const checkIntervalHours of [0, -1, "soon"]) {
      const res = await fetch(`${server.baseUrl}/watched-sources`, {
        method: "POST",
        headers: { authorization: "Bearer ws-key", "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com", reputationTier: "blog", checkIntervalHours }),
      });
      assert.equal(res.status, 400, `${JSON.stringify(checkIntervalHours)} must be refused`);
    }
  } finally {
    await server.close();
  }
});

test("both routes 403 without the sources scope, never a silent 200", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: key(["ask"]) }));
  try {
    const post = await fetch(`${server.baseUrl}/watched-sources`, {
      method: "POST",
      headers: { authorization: "Bearer ws-key", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", reputationTier: "blog", checkIntervalHours: 24 }),
    });
    assert.equal(post.status, 403);
    const get = await fetch(`${server.baseUrl}/watched-sources`, { headers: { authorization: "Bearer ws-key" } });
    assert.equal(get.status, 403);
  } finally {
    await server.close();
  }
});

test("one tenant never sees another tenant's watched sources", async () => {
  const deps = fakeWatchedSourceDeps();
  const server = await startTestServer(buildTestDeps({
    watchedSources: deps,
    keyStore: fakeKeyStore({
      "a-key": { tenantId: "tenant-a", scopes: ["sources"] },
      "b-key": { tenantId: "tenant-b", scopes: ["sources"] },
    }),
  }));
  try {
    await fetch(`${server.baseUrl}/watched-sources`, {
      method: "POST",
      headers: { authorization: "Bearer a-key", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://a.example/only", reputationTier: "official", checkIntervalHours: 12 }),
    });
    const res = await fetch(`${server.baseUrl}/watched-sources`, { headers: { authorization: "Bearer b-key" } });
    const body = (await res.json()) as { sources: unknown[] };
    assert.deepEqual(body.sources, [], "tenant-b must not see tenant-a's source");
  } finally {
    await server.close();
  }
});

/**
 * ISS-C-UNRUN-WRITERS-001. The route validated a PARSED url and stored the RAW string, so the
 * value approved and the value stored could differ under a different parser. That gap matters
 * precisely because this row is a future outbound fetch target: whatever the fetcher re-parses
 * must be the thing this check actually approved, not a string that merely normalises to it here.
 */
test("the STORED url is the normalised one, not the raw input", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: key(["sources"]) }));
  try {
    const res = await fetch(`${server.baseUrl}/watched-sources`, {
      method: "POST",
      headers: { authorization: "Bearer ws-key", "content-type": "application/json" },
      body: JSON.stringify({ url: "HTTPS://Example.AC.uk/fees?b=2&a=1", reputationTier: "official", checkIntervalHours: 6 }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { source: { url: string } };
    assert.equal(body.source.url, new URL("HTTPS://Example.AC.uk/fees?b=2&a=1").href,
      "what is stored must be exactly what was parsed and approved");

    const list = await fetch(`${server.baseUrl}/watched-sources`, { headers: { authorization: "Bearer ws-key" } });
    const listed = (await list.json()) as { sources: { url: string }[] };
    assert.equal(listed.sources[0]?.url, body.source.url, "and the same value must come back out");
  } finally {
    await server.close();
  }
});

test("POST /watched-sources/run reports per-source failures instead of 500ing", async () => {
  const server = await startTestServer(buildTestDeps({
    keyStore: key(["sources"]),
    watchedSources: {
      create: async () => {},
      listActive: async () => [],
      run: async () => ({ checked: 1, changed: 1, skipped: 2, failed: [{ id: "ws-bad", url: "https://x/", reason: "blocked -- private address" }], remaining: 0 }),
    },
  }));
  try {
    const res = await fetch(`${server.baseUrl}/watched-sources/run`, {
      method: "POST", headers: { authorization: "Bearer ws-key" },
    });
    assert.equal(res.status, 200, "a blocked source is an expected outcome, not a server error");
    const body = (await res.json()) as { checked: number; failed: { reason: string }[] };
    assert.equal(body.checked, 1);
    assert.equal(body.failed.length, 1);
    assert.match(body.failed[0]?.reason ?? "", /blocked/);
  } finally { await server.close(); }
});

test("POST /watched-sources/run 403s without the sources scope", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: key(["ask"]) }));
  try {
    const res = await fetch(`${server.baseUrl}/watched-sources/run`, {
      method: "POST", headers: { authorization: "Bearer ws-key" },
    });
    assert.equal(res.status, 403);
  } finally { await server.close(); }
});

test("POST /watched-sources/run runs the AUTHED tenant's sources, not another's", async () => {
  // ISS-C-UNRUN-WRITERS-018: the fixture's `run` took NO argument, so a handler calling
  // `deps.run("other-tenant")` -- or passing nothing -- passed this suite. It now records the
  // tenant it was actually handed, and this asserts on that recording.
  const ranFor: string[] = [];
  const server = await startTestServer(buildTestDeps({
    watchedSources: fakeWatchedSourceDeps({}, ranFor),
    keyStore: key(["sources"]),
  }));
  try {
    const res = await fetch(`${server.baseUrl}/watched-sources/run`, {
      method: "POST",
      headers: { authorization: "Bearer ws-key" },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { checked: 0, changed: 0, skipped: 0, failed: [], remaining: 0 });
  } finally {
    await server.close();
  }
  assert.deepEqual(ranFor, ["tenant-1"]);
});

/**
 * ISS-C-UNRUN-WRITERS-017 / -021. These three assert on the PRODUCTION composition, not the route.
 * They live here rather than in their own file because `apps/api/src` is at its 30-file dirsize
 * budget and a new file there turned `lint:structure` red for the whole lane -- the fix for one
 * finding must not be the cause of the next.
 *
 * Watched Sources fetches user-supplied URLs unattended on a timer, so the guarded fetcher is the
 * feature's SSRF boundary. While it was composed inline inside `run`, swapping it for a bare fetch
 * left the entire suite green: no test could reach the composition.
 */
test("the production watched-run deps use a BRANDED guarded fetcher, not a bare one", () => {
  assert.equal(isGuardedFetcher(createWatchedRunDeps().fetcher), true);
});

test("isGuardedFetcher rejects a plain function -- the brand is not incidental", () => {
  assert.equal(isGuardedFetcher(async (_url: string) => ""), false);
  assert.equal(isGuardedFetcher(globalThis.fetch), false);
});

test("the deps supply a real sha256 hasher and an ISO clock", () => {
  const deps = createWatchedRunDeps();
  assert.equal(
    deps.hasher("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.match(deps.now(), /^\d{4}-\d{2}-\d{2}T/);
});

// --- U4d (D-047/D-048/ISS-361): GET /watch-state ------------------------------------------

test("U4d: GET /watch-state 501s when the deployment has not wired the read deps (the A13-only default)", async () => {
  const server = await startTestServer(buildTestDeps({ keyStore: key(["sources"]) }));
  try {
    // buildTestDeps' default watchedSources is plain fakeWatchedSourceDeps() — no listWatchState/
    // listHeartbeats/heartbeatIntervalMs — matching what an A13-only fixture looks like today.
    const res = await fetch(`${server.baseUrl}/watch-state`, { headers: { authorization: "Bearer ws-key" } });
    assert.equal(res.status, 501, "an unwired deployment must say so, never a silent empty 200");
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "not_implemented");
  } finally {
    await server.close();
  }
});

test("U4d: GET /watch-state 403s without the sources scope", async () => {
  const server = await startTestServer(buildTestDeps({
    keyStore: key(["ask"]),
    watchedSources: { ...fakeWatchedSourceDeps(), ...fakeWatchStateReadDeps() },
  }));
  try {
    const res = await fetch(`${server.baseUrl}/watch-state`, { headers: { authorization: "Bearer ws-key" } });
    assert.equal(res.status, 403);
  } finally {
    await server.close();
  }
});

test("U4d: GET /watch-state returns watch_state rows and heartbeat staleness computed server-side, per R2's own rule", async () => {
  const HOUR = 60 * 60 * 1000;
  const NOW = Date.now();
  const state: WatchState[] = [
    { _id: "tenant-1:drive:f1", tenantId: "tenant-1", sourceType: "drive", sourceId: "f1", status: "failed", seenAt: new Date(NOW - 60_000).toISOString(), failedAt: new Date(NOW - 60_000).toISOString(), failureReason: "401: token expired" },
  ];
  const heartbeats: WatchHeartbeat[] = [
    { _id: "tenant-1:drive", tenantId: "tenant-1", sourceType: "drive", lastHeartbeatAt: new Date(NOW - 5 * 60_000).toISOString() },
    { _id: "tenant-1:gmail", tenantId: "tenant-1", sourceType: "gmail", lastHeartbeatAt: new Date(NOW - 3 * HOUR).toISOString() },
    // calendar: no row at all -- must be synthesised as maximally stale, not silently dropped.
  ];
  const server = await startTestServer(buildTestDeps({
    keyStore: key(["sources"]),
    watchedSources: { ...fakeWatchedSourceDeps(), ...fakeWatchStateReadDeps({ "tenant-1": state }, { "tenant-1": heartbeats }, HOUR) },
  }));
  try {
    const res = await fetch(`${server.baseUrl}/watch-state`, { headers: { authorization: "Bearer ws-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { state: WatchState[]; heartbeats: { sourceType: string; lastHeartbeatAt: string | null; stale: boolean }[] };
    assert.equal(body.state.length, 1);
    assert.equal(body.state[0]?.failureReason, "401: token expired");

    const byType = new Map(body.heartbeats.map((h) => [h.sourceType, h]));
    assert.equal(byType.get("drive")?.stale, false, "5 minutes old, well within the 1h interval");
    assert.equal(byType.get("gmail")?.stale, true, "3 hours old, past the 1h interval");
    assert.equal(byType.get("calendar")?.stale, true, "no row at all -- absence is maximally stale, not healthy (D-048)");
    assert.equal(byType.get("calendar")?.lastHeartbeatAt, null);
  } finally {
    await server.close();
  }
});

test("U4d/R8: one tenant's watch-state read never returns another tenant's rows -- live two-key walk", async () => {
  const HOUR = 60 * 60 * 1000;
  const NOW = Date.now();
  const stateByTenant: Record<string, WatchState[]> = {
    "tenant-a": [{ _id: "tenant-a:drive:only-a", tenantId: "tenant-a", sourceType: "drive", sourceId: "only-a", status: "failed", seenAt: new Date(NOW).toISOString(), failureReason: "tenant-a's own failure" }],
    // tenant-b: deliberately empty.
  };
  const heartbeatsByTenant: Record<string, WatchHeartbeat[]> = {
    "tenant-a": [{ _id: "tenant-a:drive", tenantId: "tenant-a", sourceType: "drive", lastHeartbeatAt: new Date(NOW).toISOString() }],
    // tenant-b: no heartbeat rows either -- every source type must come back maximally stale.
  };
  const server = await startTestServer(buildTestDeps({
    watchedSources: { ...fakeWatchedSourceDeps(), ...fakeWatchStateReadDeps(stateByTenant, heartbeatsByTenant, HOUR) },
    keyStore: fakeKeyStore({
      "a-key": { tenantId: "tenant-a", scopes: ["sources"] },
      "b-key": { tenantId: "tenant-b", scopes: ["sources"] },
    }),
  }));
  try {
    const aRes = await fetch(`${server.baseUrl}/watch-state`, { headers: { authorization: "Bearer a-key" } });
    const aBody = (await aRes.json()) as { state: WatchState[] };
    assert.equal(aBody.state.length, 1);
    assert.equal(aBody.state[0]?.failureReason, "tenant-a's own failure");

    const bRes = await fetch(`${server.baseUrl}/watch-state`, { headers: { authorization: "Bearer b-key" } });
    const bBody = (await bRes.json()) as { state: WatchState[]; heartbeats: { sourceType: string; stale: boolean }[] };
    // NOT assert.deepEqual(bBody.state, [], ...): node:assert/strict's deepEqual is deepStrictEqual,
    // typed `<T>(actual: unknown, expected: T): asserts actual is T`. With expected inferred as
    // `never[]` from the `[]` literal, that assertion signature narrows bBody.state itself to
    // `never[]` for the rest of this block, breaking the `.some((s) => s.failureReason ...)` call
    // below with TS2339 ("does not exist on type 'never'"). Asserting on `.length` instead narrows
    // only that number property, leaving bBody.state's array element type untouched.
    assert.equal(bBody.state.length, 0, "tenant-b must not see tenant-a's watch_state row");
    assert.equal(bBody.state.some((s) => s.failureReason === "tenant-a's own failure"), false, "tenant-a's failure text must never appear in tenant-b's response");
    assert.equal(bBody.heartbeats.every((h) => h.stale === true), true, "tenant-b has no heartbeat rows of its own, so every source type is maximally stale, never borrowed from tenant-a");
  } finally {
    await server.close();
  }
});
