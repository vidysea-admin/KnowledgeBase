/**
 * apps/api/src/join-rules/require-scope.test.ts — ISS-T037API-003. Direct unit tests of the shared auth
 * primitives `requireScope` / `requireAuth` (apps/api/src/auth.ts), which the join-rules scope-write tests
 * exercise only through routes. Pins: an EMPTY scope list is refused; near-miss scopes are refused; a refusal
 * is a 403 with `next` never called and no leak of the scopes the key holds; requireAuth 401 paths.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { requireAuth, requireScope, type ApiKeyStore, type VerifiedKey } from "../auth.js";

interface Out { status: number | null; body: unknown; nextCalls: number }
function harness(): { out: Out; res: Response; next: NextFunction } {
  const out: Out = { status: null, body: undefined, nextCalls: 0 };
  const res = { status(n: number) { out.status = n; return this; }, json(b: unknown) { out.body = b; return this; } } as unknown as Response;
  return { out, res, next: (() => { out.nextCalls++; }) as NextFunction };
}
async function drive(scope: string, auth: unknown, hasAuth = true): Promise<Out> {
  const { out, res, next } = harness();
  await requireScope(scope)((hasAuth ? { auth } : {}) as unknown as Request, res, next);
  return out;
}
const key = (scopes: unknown): VerifiedKey => ({ tenantId: "t", scopes: scopes as string[] });
const REQUIRED = "calendar";
const NUL = String.fromCharCode(0);

function assertRefused(o: Out, label: string, held: string[] = []): void {
  assert.equal(o.status, 403, `${label}: status`);
  assert.equal(o.nextCalls, 0, `${label}: next must not be called`);
  const body = o.body as { error: string; message: string };
  assert.equal(body.error, "forbidden", label);
  assert.deepEqual(Object.keys(body).sort(), ["error", "message"], `${label}: body shape`);
  const text = JSON.stringify(o.body);
  for (const h of held) assert.ok(!text.includes(h), `${label}: leaked held scope ${h}`);
}

test("requireScope: the required scope present (alone, among others, duplicated, in a long list) calls next once, no response", async () => {
  for (const scopes of [["calendar"], ["a", "calendar", "b"], ["calendar", "calendar"], ["x", ...Array(5000).fill("y"), "calendar"]]) {
    const o = await drive(REQUIRED, key(scopes));
    assert.equal(o.nextCalls, 1);
    assert.equal(o.status, null);
    assert.equal(o.body, undefined);
  }
});

test("ISS-T037API-003: an EMPTY scope list is refused with 403 and next is never called", async () => {
  assertRefused(await drive(REQUIRED, key([])), "empty list");
  for (const s of ["join-rules", "calendar", "*", ""]) assertRefused(await drive(s, key([])), `empty list vs ${JSON.stringify(s)}`);
});

test("requireScope: no auth on the request, or a key with no scopes field, never reaches next", async () => {
  assertRefused(await drive(REQUIRED, undefined, false), "no req.auth");
  assertRefused(await drive(REQUIRED, undefined, true), "req.auth undefined");
  let r: Out | "threw";
  try { r = await drive(REQUIRED, { tenantId: "t" }); } catch { r = "threw"; }
  if (r !== "threw") assertRefused(r, "missing scopes field"); // a clean 403 or a throw; never a pass
});

test("requireScope: scopes that are not an array never reach next (null/object/number/boolean 403 or throw)", () => {
  for (const bad of [null, {}, { calendar: true }, 7, true]) {
    const { out, res, next } = harness();
    try { void requireScope(REQUIRED)({ auth: key(bad) } as unknown as Request, res, next); } catch { /* a throw is also a refusal */ }
    assert.equal(out.nextCalls, 0, JSON.stringify(bad));
    assert.ok(out.status === null || out.status === 403, JSON.stringify(bad));
  }
});

test("requireScope: a string (not array) scope value that does not contain the scope is refused", async () => {
  for (const s of ["", "other", "join-rules"]) assertRefused(await drive(REQUIRED, key(s)), `string ${JSON.stringify(s)}`);
});

test("requireScope: near-miss scope strings are refused and the body does not reveal the held scopes", async () => {
  const cases: string[][] = [
    ["Calendar"], ["CALENDAR"], ["calendar "], [" calendar"], ["calendar\n"], [`calendar${NUL}`], ["calendar:read"], ["calendars"],
    ["cal"], ["calendar,join-rules"], ["join-rules,calendar"], ["calendar join-rules"], ["*"], ["calendar*"], [""], ["calendar/"],
    ["join-rules", "keys", "ingest"], ["a", "b", "c", "d", ...Array(5000).fill("calendarx")],
  ];
  for (const scopes of cases) {
    assertRefused(await drive(REQUIRED, key(scopes)), JSON.stringify(scopes.slice(0, 5)), scopes.filter((s) => s.length > 0 && !REQUIRED.includes(s) && s !== "a" && s !== "b" && s !== "c" && s !== "d"));
  }
  // holding "calendar" does not grant "calendar:read"; other held scopes are not echoed back
  assertRefused(await drive("calendar:read", key(["calendar"])), "held calendar vs required calendar:read");
  assertRefused(await drive("join-rules", key(["calendar", "ask-secret-scope"])), "other scopes", ["ask-secret-scope"]);
});

function store(result: VerifiedKey | null | Error): ApiKeyStore & { calls: string[] } {
  const calls: string[] = [];
  return { calls, verify: async (k) => { calls.push(k); if (result instanceof Error) throw result; return result; } };
}
async function driveAuth(s: ApiKeyStore, authorization: string | undefined): Promise<Out & { req: { auth?: VerifiedKey } }> {
  const { out, res, next } = harness();
  const req = { header: (n: string) => (n.toLowerCase() === "authorization" ? authorization : undefined) } as unknown as Request;
  await requireAuth(s)(req, res, next);
  return { ...out, req: req as { auth?: VerifiedKey } };
}

test("requireAuth: missing, malformed or non-Bearer headers are 401 and the store is never asked", async () => {
  for (const h of [undefined, "", "Bearer", "Bearer ", "Basic abc", "Token abc", "abc", "bearerabc"]) {
    const s = store(null);
    const o = await driveAuth(s, h);
    assert.equal(o.status, 401, JSON.stringify(h));
    assert.equal(o.nextCalls, 0);
    assert.equal(o.req.auth, undefined);
    assert.equal(s.calls.length, 0, JSON.stringify(h));
  }
});

test("requireAuth: an unknown or revoked key (store returns null) is 401 and req.auth stays unset", async () => {
  const o = await driveAuth(store(null), "Bearer nope");
  assert.equal(o.status, 401);
  assert.equal(o.nextCalls, 0);
  assert.equal(o.req.auth, undefined);
});

test("requireAuth: a store failure never authenticates the request", async () => {
  const r = await driveAuth(store(new Error("db down")), "Bearer k").then((x) => x, () => "threw" as const);
  if (r !== "threw") { assert.equal(r.nextCalls, 0); assert.equal(r.req.auth, undefined); }
});

test("requireAuth: a valid key sets req.auth to the verified key and calls next once; scheme is case-insensitive", async () => {
  const v = { tenantId: "tenant-a", scopes: ["calendar"] };
  for (const h of ["Bearer k1", "bearer k1", "BEARER   k1"]) {
    const s = store(v);
    const o = await driveAuth(s, h);
    assert.equal(o.nextCalls, 1, h);
    assert.equal(o.status, null);
    assert.deepEqual(o.req.auth, v);
    assert.deepEqual(s.calls, ["k1"], h);
  }
});

// ---- auth-require-scope-exact-match (ISS-TESTGAPS-001): exact array-element match only ----
test("ISS-TESTGAPS-001 recorded reproductions, verbatim: a STRING scopes value never substring-matches", async () => {
  const recorded: Array<[string, string]> = [["calendar", "calendar:read"], ["keys", "join-rules calendar keys"]];
  let refused = 0;
  for (const [required, stored] of recorded) { assertRefused(await drive(required, key(stored)), `${stored} vs ${required}`, [stored]); refused++; }
  assert.equal(refused, recorded.length); // reported as ISS-TESTGAPS-001: 2/2
  for (const s of ["calendar", "calendar calendar", "calendar,keys", "keys"]) assertRefused(await drive(REQUIRED, key(s)), `string ${s}`);
});

test("requireScope: every non-array shape is refused with the standard 403 (even when it would 'contain' the scope)", async () => {
  const wrapper = new String(REQUIRED); // eslint-disable-line no-new-wrappers
  const shapes: Array<[string, unknown]> = [
    ["null", null], ["undefined", undefined], ["number", 7], ["boolean", true], ["plain object", { calendar: true }],
    ["array-like with includes", { length: 1, 0: REQUIRED, includes: () => true }],
    ["array-like with length", { length: 1, 0: REQUIRED }], ["Set", new Set([REQUIRED])], ["Map", new Map([[REQUIRED, 1]])],
    ["String wrapper", wrapper], ["function", () => REQUIRED],
  ];
  for (const [label, v] of shapes) assertRefused(await drive(REQUIRED, key(v)), label);
});

test("requireScope: only STRING elements strictly equal to the scope match (nested arrays, toString objects, wrappers, non-strings refused)", async () => {
  const toStr = { toString: () => REQUIRED };
  const lists: Array<[string, unknown[]]> = [
    ["nested array", [[REQUIRED]]], ["toString object", [toStr]], ["String wrapper", [new String(REQUIRED)]], // eslint-disable-line no-new-wrappers
    ["numbers/null/bool", [1, null, undefined, true]], ["object", [{ scope: REQUIRED }]], ["empty", []], ["sparse", new Array(3)],
  ];
  for (const [label, l] of lists) assertRefused(await drive(REQUIRED, key(l)), label);
  // a valid string element still matches next to garbage elements
  for (const l of [[toStr, REQUIRED], [null, 1, REQUIRED, [REQUIRED]]]) {
    const o = await drive(REQUIRED, key(l));
    assert.equal(o.nextCalls, 1);
    assert.equal(o.status, null);
  }
});

test("requireScope: the refusal is byte-identical to the historical missing-scope 403 for every malformed shape", async () => {
  const expected = { error: "forbidden", message: `this key is missing the required "${REQUIRED}" scope` };
  for (const v of ["calendar:read", null, 7, {}, new Set(), [[REQUIRED]], []]) {
    const o = await drive(REQUIRED, key(v));
    assert.equal(o.status, 403);
    assert.deepEqual(o.body, expected);
  }
});

test("requireAuth: a stored record with malformed scopes authenticates with NO scopes (fail closed, no throw, no 500, never split)", async () => {
  const bad: unknown[] = ["calendar:read", "join-rules calendar keys", "calendar,keys", null, undefined, 7, {}, new Set(["calendar"]), [["calendar"]], ["calendar", 1], { length: 1, 0: "calendar" }];
  for (const scopes of bad) {
    const o = await driveAuth(store({ tenantId: "t", scopes } as unknown as VerifiedKey), "Bearer k");
    assert.equal(o.status, null, `no error response for ${JSON.stringify(scopes)}`); // not 500, not 401
    assert.equal(o.nextCalls, 1);
    assert.deepEqual(o.req.auth, { tenantId: "t", scopes: [] });
    for (const required of ["calendar", "keys", "join-rules"]) assertRefused(await drive(required, o.req.auth), `${JSON.stringify(scopes)} vs ${required}`);
  }
});

test("requireAuth: a well-formed record is passed through untouched (same object, duplicates kept)", async () => {
  const v = { tenantId: "t", scopes: ["calendar", "calendar", "keys"] };
  const o = await driveAuth(store(v), "Bearer k");
  assert.equal(o.req.auth, v);
  assert.equal((await drive("keys", o.req.auth)).nextCalls, 1);
});
