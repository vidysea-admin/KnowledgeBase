// user-accounts A3 (D-206) UA-9a: generated route-enumeration test. EVERY mounted write route (POST/PUT/PATCH/DELETE) of the
// real createServer app must answer a viewer session with 403 read_only_role, unless it is an allowlisted read-like POST
// or lives under a perimeter prefix that authenticates itself (/auth, /admin). A route added later that escapes the guard
// fails here until it is classified, and a self-test proves the detector bites on a deliberately unguarded route.
import assert from "node:assert/strict";
import test from "node:test";
import express, { type Express } from "express";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { createServer } from "../server.js";
import { COOKIE_NAME_SECURE } from "./cookie.js";
import { csrfTokenFor } from "./csrf.js";
import { createSessionAuth } from "./principal.js";
import { createSessionService } from "./sessions.js";
import { fakeClock, memorySessionStore, memoryUsers, user } from "./sessions.testsupport.js";
import { isReadLikePost, READ_LIKE_POSTS } from "./viewer-guard.js";

const ORIGIN = "https://kb.example.org", SECRET = "k".repeat(48), UNSAFE = ["post", "put", "patch", "delete"];
/** Prefixes whose routers are PUBLIC (soft principal, no guard): only /auth. /admin is authenticated by the shared perimeter, so the guards MUST cover it (fix cycle 1). */
const SELF_GUARDED_PREFIXES = ["/auth"];
const ok: express.RequestHandler = (_q, s) => { s.json({ ok: true }); };
/** A stub admin router (A6 is not built): mirrors the shape that matters, including the three paths Checker A used to bypass the guards. */
function adminStub(): express.Router {
  const r = express.Router();
  r.get("/auth/x", ok); r.get("/users", ok); r.post("/ask", ok); r.post("/citations/native/resolve", ok);
  r.post("/users/:id/role", ok); r.patch("/users/:id", ok); r.put("/policy", ok); r.delete("/sessions/:id", ok);
  return r;
}

type Found = { method: string; path: string };
/** Walks an Express 5 router stack. Mount prefixes are not kept by the router, so Router#use is observed while the app is built. */
function enumerateUnsafe(build: () => Express): { app: Express; routes: Found[] } {
  let proto = express.Router() as unknown as { use: (...a: unknown[]) => unknown };
  while (!Object.prototype.hasOwnProperty.call(proto, "use")) proto = Object.getPrototypeOf(proto); // the object that OWNS Router#use
  const original = proto.use, prefixes = new WeakMap<object, string>();
  proto.use = function (this: unknown, ...args: unknown[]) {
    const first = args[0], prefix = typeof first === "string" ? first : Array.isArray(first) && typeof first[0] === "string" ? first[0] : "";
    for (const a of args) if (typeof a === "function" && Array.isArray((a as { stack?: unknown }).stack)) prefixes.set(a, prefix === "/" ? "" : prefix);
    return original.apply(this, args);
  };
  let app: Express;
  try { app = build(); } finally { proto.use = original; }
  const out: Found[] = [];
  const walk = (stack: any[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods ?? {}).filter((m) => m !== "_all");
        const all = layer.route.methods?._all ? UNSAFE : [];
        const path = prefix + (typeof layer.route.path === "string" ? layer.route.path : String(layer.route.path));
        for (const m of new Set([...methods, ...all])) if (UNSAFE.includes(m)) out.push({ method: m.toUpperCase(), path });
      } else if (Array.isArray(layer.handle?.stack)) walk(layer.handle.stack, prefix + (prefixes.get(layer.handle) ?? ""));
    }
  };
  walk((app as unknown as { router: { stack: any[] } }).router.stack, "");
  return { app, routes: out };
}
const concrete = (p: string) => p.replace(/:[A-Za-z0-9_]+\??/g, "x").replace(/\/+/g, "/");

type RigOpts = { extra?: (app: Express) => void; user?: Partial<Parameters<typeof user>[0]>; admin?: boolean };
async function viewerRig(opts: RigOpts | ((app: Express) => void) = {}) {
  const { extra, user: who = {}, admin = true } = typeof opts === "function" ? { extra: opts } : opts;
  const clock = fakeClock(), mem = memorySessionStore();
  const sessions = createSessionService({ store: mem.store, users: memoryUsers([user({ _id: "v1", tenantId: "tA", role: "viewer", ...who })]), now: clock.now });
  const userAccounts = { session: createSessionAuth({ sessions, cookie: { basePath: "", production: true }, csrf: { secret: SECRET, allowedOrigins: [ORIGIN] } }), ...(admin ? { adminRouter: adminStub() } : {}) };
  const deps = buildTestDeps({ keyStore: fakeKeyStore({}), userAccounts });
  const { app, routes } = enumerateUnsafe(() => { const a = createServer(deps); extra?.(a); return a; });
  const { token, session } = await sessions.create("tA", "v1");
  const http = app.listen(0, "127.0.0.1"); await new Promise((r) => http.once("listening", r));
  const base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const send = async (f: Found) => {
    const res = await fetch(base + concrete(f.path), { method: f.method, headers: { connection: "close", cookie: `${COOKIE_NAME_SECURE}=${token}`, origin: ORIGIN, "x-lkb-csrf": csrfTokenFor(session._id, SECRET), "content-type": "application/json" }, ...(f.method === "DELETE" ? {} : { body: "{}" }) });
    return { status: res.status, error: ((await res.json().catch(() => null)) as { error?: string } | null)?.error };
  };
  const call = async (method: string, path: string) => {
    const res = await fetch(base + path, { method, headers: { connection: "close", cookie: `${COOKIE_NAME_SECURE}=${token}`, origin: ORIGIN, "x-lkb-csrf": csrfTokenFor(session._id, SECRET), "content-type": "application/json" }, ...(method === "GET" || method === "DELETE" ? {} : { body: "{}" }) });
    return { status: res.status, error: ((await res.json().catch(() => null)) as { error?: string } | null)?.error };
  };
  return { routes, send, call, close: () => new Promise<void>((r) => http.close(() => r())) };
}

/** Routes that are neither guarded for viewers, allowlisted, nor under a self-guarded prefix. */
async function unclassified(rig: Awaited<ReturnType<typeof viewerRig>>): Promise<string[]> {
  const bad: string[] = [];
  for (const f of rig.routes) {
    if (SELF_GUARDED_PREFIXES.some((p) => f.path === p || f.path.startsWith(`${p}/`))) continue;
    const res = await rig.send(f);
    const readLike = isReadLikePost(f.method, concrete(f.path));
    if (readLike ? res.error === "read_only_role" : res.error !== "read_only_role") bad.push(`${f.method} ${f.path} -> ${res.status} ${res.error ?? ""}`);
  }
  return bad;
}

test("every mounted write route (including every /admin one) answers a viewer 403 read_only_role, or is allowlisted / the public /auth perimeter (UA-9a)", async () => {
  const rig = await viewerRig();
  try {
    assert.ok(rig.routes.length >= 40, `enumerated ${rig.routes.length} write routes (the walker must really see the app)`);
    assert.ok(rig.routes.some((r) => r.method === "POST" && r.path === "/ask"), "mount-less router routes are found");
    assert.ok(rig.routes.filter((r) => r.path.startsWith("/admin/")).length >= 6, "the /admin write routes are enumerated, not exempted");
    assert.deepEqual(await unclassified(rig), []);
  } finally { await rig.close(); }
});

/** Checker A's reproductions of the defect, verbatim (ISS-UA-A cycle 0): req.path is mount-relative under app.use("/admin", ...). D-015: the count is reported by id. */
test("ua-session-core-A: 3/3 refused - the guards see the FULL path under the /admin mount", async () => {
  const viewer = await viewerRig(), pending = await viewerRig({ user: { status: "pending", role: undefined } });
  try {
    const got = [
      ["pending GET /admin/auth/x", await pending.call("GET", "/admin/auth/x"), 403, "account_not_active"],
      ["viewer POST /admin/ask", await viewer.call("POST", "/admin/ask"), 403, "read_only_role"],
      ["viewer POST /admin/citations/native/resolve", await viewer.call("POST", "/admin/citations/native/resolve"), 403, "read_only_role"],
    ] as const;
    const refused = got.filter(([, r, status, error]) => r.status === status && r.error === error);
    assert.equal(refused.length, 3, `ua-session-core-A: ${refused.length}/3 refused; ${JSON.stringify(got.map(([n, r]) => [n, r.status, r.error]))}`);
    assert.notEqual((await viewer.call("POST", "/ask")).error, "read_only_role");
  } finally { await viewer.close(); await pending.close(); }
});

test("a pending session is 403 account_not_active on EVERY route outside /auth, including every /admin route of every method", async () => {
  const rig = await viewerRig({ user: { status: "pending", role: undefined } });
  try {
    const probes = [...rig.routes.filter((r) => !r.path.startsWith("/auth")), { method: "GET", path: "/admin/auth/x" }, { method: "GET", path: "/admin/users" }, { method: "GET", path: "/sessions" }];
    assert.ok(probes.filter((p) => p.path.startsWith("/admin/")).length >= 8, "the /admin stub routes are enumerated");
    const bad: string[] = [];
    for (const f of probes) { const res = await rig.call(f.method, concrete(f.path)); if (res.status !== 403 || res.error !== "account_not_active") bad.push(`${f.method} ${f.path} -> ${res.status} ${res.error ?? ""}`); }
    assert.deepEqual(bad, []);
  } finally { await rig.close(); }
});

test("the enumerator resolves mount prefixes, nested routers and all()", () => {
  const { routes } = enumerateUnsafe(() => {
    const app = express(), inner = express.Router(), outer = express.Router();
    inner.delete("/leaf/:id", () => undefined); outer.use("/inner", inner); outer.post("/direct", () => undefined); outer.all("/any", () => undefined);
    app.use("/outer", outer); app.get("/read", () => undefined); app.put("/top", () => undefined);
    return app;
  });
  const got = routes.map((r) => `${r.method} ${r.path}`).sort();
  assert.deepEqual(got, ["DELETE /outer/inner/leaf/:id", "DELETE /outer/any", "PATCH /outer/any", "POST /outer/any", "POST /outer/direct", "PUT /outer/any", "PUT /top"].sort());
});

test("the detector bites: a write route mounted BEFORE the perimeter is reported as unclassified", async () => {
  // Same app, but a throwaway POST is injected ahead of the auth perimeter (the failure mode a future route could have).
  const rig = await viewerRig((a) => { const r = express.Router(); r.post("/__throwaway", (_q, s) => { s.json({ ok: true }); }); (a as unknown as { router: { stack: unknown[] } }).router.stack.unshift(...(r as unknown as { stack: unknown[] }).stack.map((l) => l)); a.post("/__late_throwaway", (_q, s) => { s.json({ ok: true }); }); });
  try {
    const bad = await unclassified(rig);
    assert.ok(bad.some((b) => b.includes("/__throwaway") && b.includes("200")), `unguarded route detected: ${JSON.stringify(bad)}`);
    assert.ok(!bad.some((b) => b.includes("__late_throwaway")), "a route added after the perimeter is guarded by construction");
  } finally { await rig.close(); }
});

test("the read-like POST allowlist is pinned to exactly the two documented routes (roles.md); widening it needs a deliberate edit here too", () => {
  assert.deepEqual([...READ_LIKE_POSTS].sort(), ["POST /ask", "POST /citations/native/resolve"]);
  for (const [m, p] of [["POST", "/ingest"], ["POST", "/ask/extra"], ["PUT", "/ask"], ["POST", "/Ask"]] as const) assert.equal(isReadLikePost(m, p), false, `${m} ${p}`);
  assert.equal(isReadLikePost("POST", "/ask/"), true, "a trailing slash is the same route");
});
