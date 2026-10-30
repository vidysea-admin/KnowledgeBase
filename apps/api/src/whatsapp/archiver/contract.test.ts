/**
 * Contract suite, part 1 of 2 (docs/whatsapp/archiver-service-api.md section 11): auth, request hygiene, provisioning,
 * health. Wire tests only: black-box HTTP, run against the in-repo fake every time and against a real archiver ONLY
 * when LKB_ARCHIVER_CONTRACT_URL and LKB_ARCHIVER_CONTRACT_TOKEN are set (staging only: the suite creates owners).
 * "archiver-only" acceptance items are listed as skipped; a KB claim that the archiver passes them needs the real run.
 */
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createArchiverClient } from "./client.js";
import { loadArchiverConfig } from "./config.js";
import { realTargetFromEnv, startFakeArchiver, type FakeControl } from "./fake-archiver.js";

interface Target { name: string; url: string; token: string; tokenNext?: string; control: FakeControl | null }
const fake = await startFakeArchiver();
const real = realTargetFromEnv();
const targets: Target[] = [{ name: "fake", url: fake.url, token: fake.token, tokenNext: fake.tokenNext, control: fake.control }];
if (real) targets.push({ name: "real", url: real.baseUrl, token: real.token, control: null });
after(async () => { await fake.stop(); });
test("real archiver contract run (LKB_ARCHIVER_CONTRACT_URL + _TOKEN)", { skip: real ? false : "set LKB_ARCHIVER_CONTRACT_URL and LKB_ARCHIVER_CONTRACT_TOKEN to run against a real archiver" }, () => {});
for (const id of ["AC-A3", "AC-A4", "AC-A5", "AC-A6", "AC-P2", "AC-P3"]) test(`${id} (archiver-only)`, { skip: "archiver-only: needs the archiver's process, logs or database; proven in W2b" }, () => {});

const rnd = (): string => Array.from({ length: 24 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

for (const t of targets) describe(`contract[${t.name}] auth, hygiene, provisioning, health`, () => {
  let clock = Date.now();
  /** Move past every rate window: the fake clock jumps; a real archiver is waited out. */
  const freshWindow = async (): Promise<void> => { if (t.control) { clock += 120_000; t.control.setNow(clock); } else await sleep(61_000); };
  const client = (): ReturnType<typeof createArchiverClient> =>
    createArchiverClient(loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: t.url, WHATSAPP_ARCHIVER_API_TOKEN: t.token, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" })!);
  async function raw(path: string, o: { method?: string; token?: string | null; headers?: Record<string, string>; body?: string; ct?: string | null } = {}) {
    const headers: Record<string, string> = { ...o.headers };
    if (o.token !== null) headers.authorization ??= `Bearer ${o.token ?? t.token}`;
    if (o.body !== undefined && o.ct !== null) headers["content-type"] = o.ct ?? "application/json";
    const res = await fetch(`${t.url}${path}`, { method: o.method ?? "GET", headers, body: o.body, redirect: "manual" });
    const text = await res.text(); let json: unknown; try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, headers: res.headers, text, json: json as { error?: { code?: string; requestId?: string } } & Record<string, unknown> };
  }
  const code = (r: { json: { error?: { code?: string } } }): string | undefined => r.json?.error?.code;

  // AC-A7 first: it needs an untouched failed-auth window.
  test("AC-A7 21 bad-token requests inside a minute from one source: the 21st is 429 rate_limited", async () => {
    await freshWindow();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await raw("/svc/v1/health", { token: `wrong-${i}` })).status);
    assert.deepEqual(statuses.slice(0, 20), Array(20).fill(401));
    const last = await raw("/svc/v1/health", { token: "wrong-21" });
    assert.equal(last.status, 429); assert.equal(code(last), "rate_limited"); assert.ok(last.headers.get("retry-after"));
  });

  test("AC-A1 missing, Basic, empty, wrong, one-char-off and different-length tokens: identical 401, no handler reached", async () => {
    await freshWindow();
    const off = t.token.slice(0, -1) + (t.token.endsWith("0") ? "1" : "0");
    const variants: Array<Parameters<typeof raw>[1]> = [{ token: null }, { token: null, headers: { authorization: "Basic dXNlcjpwYXNz" } }, { token: null, headers: { authorization: "Bearer " } },
      { token: "wrong" }, { token: off }, { token: t.token + "x" }, { token: null, headers: { authorization: `Token ${t.token}` } }];
    const before = t.control?.counters.handled;
    const seen: Array<{ body: string; headers: string[] }> = [];
    for (const v of variants) {
      const r = await raw("/svc/v1/owners", { method: "POST", body: JSON.stringify({ ownerRef: rnd() }), ...v });
      assert.equal(r.status, 401); assert.equal(code(r), "unauthorized");
      seen.push({ body: JSON.stringify(Object.keys(r.json.error ?? {}).sort()), headers: [...r.headers.keys()].filter(h => !["x-request-id", "date"].includes(h)).sort() });
    }
    assert.ok(seen.every(s => JSON.stringify(s) === JSON.stringify(seen[0])), "401 responses differ in shape");
    if (t.control) assert.equal(t.control.counters.handled, before);
  });

  test("AC-A2 a valid token works on a route; the rotation token also works when configured", async () => {
    assert.equal((await raw("/svc/v1/health")).status, 200);
    if (t.tokenNext) assert.equal((await raw("/svc/v1/health", { token: t.tokenNext })).status, 200);
  });

  test("AC-V1 unknown field, wrong type, malformed JSON, array body, oversize body and wrong media type change nothing", async () => {
    await freshWindow();
    const post = (body: string, ct?: string | null) => raw("/svc/v1/owners", { method: "POST", body, ct });
    assert.equal(code(await post(JSON.stringify({ ownerRef: rnd(), extra: 1 }))), "invalid_request");
    assert.equal(code(await post(JSON.stringify({ ownerRef: 5 }))), "invalid_request");
    assert.equal(code(await post("{not json")), "invalid_request");
    assert.equal(code(await post(JSON.stringify([{ ownerRef: rnd() }]))), "invalid_request");
    const big = await post(JSON.stringify({ ownerRef: rnd(), pad: "x".repeat(70 * 1024) }));
    assert.equal(big.status, 413); assert.equal(code(big), "payload_too_large");
    const wrongType = await post(JSON.stringify({ ownerRef: rnd() }), "text/plain");
    assert.equal(wrongType.status, 415); assert.equal(code(wrongType), "unsupported_media_type");
    assert.equal((await post(JSON.stringify({ ownerRef: rnd() }), null)).status, 415);
  });

  test("AC-V2 malformed ownerId, personId and jid (x@c.us, traversal, long digit run, uppercase hex) are 400 invalid_request", async () => {
    const o = rnd();
    for (const bad of ["A".repeat(24), "a".repeat(23), "a".repeat(25), "..%2f..%2fetc", "g".repeat(24)])
      assert.equal(code(await raw(`/svc/v1/owners/${bad}/session`)), "invalid_request", bad);
    for (const jid of ["x%40c.us", "..%2f..%2fx%40g.us", `${"1".repeat(41)}%40g.us`, "1%40g.us", "120363000000000000%40G.US"])
      for (const tail of ["tracking", "people"]) assert.equal(code(await raw(`/svc/v1/owners/${o}/groups/${jid}/${tail}`, { method: tail === "tracking" ? "PUT" : "GET", body: tail === "tracking" ? JSON.stringify({ isTracked: true }) : undefined })), "invalid_request", `${jid}/${tail}`);
    const real = (await client().ensureOwner(rnd())).ownerId; // body-level checks are asserted against an owner that exists
    assert.equal(code(await raw(`/svc/v1/owners/${real}/groups/120363000000000000%40g.us/people`, { method: "PUT", body: JSON.stringify({ personIds: ["ZZ"] }) })), "invalid_request");
  });

  test("AC-V3 unknown path 404 not_found; wrong method 405 method_not_allowed", async () => {
    const nf = await raw("/svc/v1/nothing"); assert.equal(nf.status, 404); assert.equal(code(nf), "not_found");
    assert.equal((await raw("/api/me")).status, 404);
    const mna = await raw("/svc/v1/health", { method: "DELETE" }); assert.equal(mna.status, 405); assert.equal(code(mna), "method_not_allowed");
    assert.equal(code(await raw("/svc/v1/owners", { method: "GET" })), "method_not_allowed");
  });

  test("AC-V4 every error is exactly {error:{code,requestId}} (+retryAfterSec), a closed code, with the version header", async () => {
    await freshWindow();
    const closed = new Set(["unauthorized", "invalid_request", "confirm_required", "not_found", "method_not_allowed", "owner_not_found", "group_not_found", "person_not_found", "payload_too_large",
      "unsupported_media_type", "owner_unlinked", "session_not_started", "idempotency_key_reused", "request_in_progress", "rate_limited", "store_unavailable", "internal_error"]);
    const rs = [await raw("/svc/v1/health", { token: "bad" }), await raw("/svc/v1/zzz"), await raw("/svc/v1/health", { method: "PUT" }), await raw(`/svc/v1/owners/${rnd()}/session`),
      await raw("/svc/v1/owners", { method: "POST", body: "{" }), await raw(`/svc/v1/owners/BAD/session`)];
    for (const r of rs) {
      assert.equal(r.headers.get("x-archiver-api-version"), "1");
      assert.ok(closed.has(code(r) ?? ""), r.text);
      assert.deepEqual(Object.keys(r.json.error!).filter(k => k !== "retryAfterSec").sort(), ["code", "requestId"]);
      assert.match(r.json.error!.requestId!, /^[A-Za-z0-9_-]{8,64}$/);
      assert.ok(!/stack|\/src\/|node_modules|at .*\(/.test(r.text));
    }
  });

  test("AC-P1 ensureOwner is idempotent by ownerRef: same id, created true then false; 20 concurrent first calls make one owner", async () => {
    await freshWindow();
    const c = client(); const ref = rnd();
    const a = await c.ensureOwner(ref), b = await c.ensureOwner(ref);
    assert.deepEqual([a.created, b.created, a.ownerId === b.ownerId, a.state], [true, false, true, "active"]);
    assert.notEqual((await c.ensureOwner(rnd())).ownerId, a.ownerId);
    const race = await Promise.all(Array.from({ length: 20 }, () => c.ensureOwner(rnd.call(null) && ref.replace(/.$/, ref.endsWith("1") ? "2" : "1"))));
    assert.equal(new Set(race.map(r => r.ownerId)).size, 1);
    assert.equal(race.filter(r => r.created).length, 1);
  });

  test("AC-P4 after unlink, ensureOwner with the same ref returns the same id with state unlinked and does not reset it", async () => {
    await freshWindow();
    const c = client(); const ref = rnd(); const o = await c.ensureOwner(ref);
    await c.unlinkSession(o.ownerId);
    const again = await c.ensureOwner(ref);
    assert.deepEqual([again.ownerId, again.state, again.created], [o.ownerId, "unlinked", false]);
    assert.equal((await c.getSession(o.ownerId)).status, "closed");
  });

  test("AC-W1 the id of a password (UI) owner is 404 owner_not_found on every operation", { skip: t.control ? false : "needs a seeded UI owner (fake control)" }, async () => {
    await freshWindow();
    const ui = t.control!.addUiOwner(); const g = "120363000000000000%40g.us";
    for (const [m, tail, body] of [["GET", "session"], ["POST", "session"], ["GET", "session/qr"], ["GET", "groups"], ["PUT", `groups/${g}/tracking`, { isTracked: true }],
      ["GET", `groups/${g}/people`], ["PUT", `groups/${g}/people`, { personIds: [] }], ["POST", "unlink", { confirm: "UNLINK" }]] as const) {
      const r = await raw(`/svc/v1/owners/${ui}/${tail}`, { method: m, body: body ? JSON.stringify(body) : undefined });
      assert.deepEqual([r.status, code(r)], [404, "owner_not_found"], `${m} ${tail}`);
    }
  });

  test("AC-W2 a well-formed unknown ownerId is 404 owner_not_found on every operation", async () => {
    await freshWindow();
    const o = rnd(); const g = "120363000000000000%40g.us";
    for (const [m, tail, body] of [["GET", "session"], ["POST", "session"], ["GET", "session/qr"], ["GET", "groups"], ["PUT", `groups/${g}/tracking`, { isTracked: true }],
      ["GET", `groups/${g}/people`], ["PUT", `groups/${g}/people`, { personIds: [] }], ["POST", "unlink", { confirm: "UNLINK" }]] as const)
      assert.equal(code(await raw(`/svc/v1/owners/${o}/${tail}`, { method: m, body: body ? JSON.stringify(body) : undefined })), "owner_not_found", `${m} ${tail}`);
  });

  test("AC-H1 health needs the token and matches section 5.7; with the store down it is 200 degraded while operations are 503", async () => {
    assert.equal(code(await raw("/svc/v1/health", { token: null })), "unauthorized");
    const h = await client().getHealth();
    assert.deepEqual([h.status, typeof h.owners.active, typeof h.owners.unlinked], ["ok", "number", "number"]);
    if (!t.control) return;
    t.control.setStoreDown(true);
    try {
      const degraded = await raw("/svc/v1/health");
      assert.deepEqual([degraded.status, degraded.json.status, degraded.json.store], [200, "degraded", "down"]);
      const op = await raw(`/svc/v1/owners/${rnd()}/groups`);
      assert.deepEqual([op.status, code(op)], [503, "store_unavailable"]);
    } finally { t.control.setStoreDown(false); }
  });

  test("AC-H2 health carries counts only: no owner id, jid, label or free text", async () => {
    const r = await raw("/svc/v1/health");
    assert.deepEqual(Object.keys(r.json).sort(), ["apiVersion", "owners", "service", "sessions", "status", "store", "time"]);
    assert.ok(!/[0-9a-f]{24}/.test(r.text) && !/@g\.us/.test(r.text));
  });
});
