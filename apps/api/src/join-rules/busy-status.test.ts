/**
 * apps/api/src/join-rules/busy-status.test.ts — `t037-join-rules-busy-status` (ISS-JRLOCK-001).
 * Every store error code, injected on every route through the real HTTP stack, must land on the status
 * table in router.ts; `locked` is the transient 503 + Retry-After, never the 500; nothing of the store's
 * own message (it names the lock file path) reaches the body or any header.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import type { JoinRulesDeps, JoinRulesStoreCode } from "./deps.js";
import { BUSY_RETRY_AFTER_SECONDS, STORE_FAILURE } from "./router.js";
import { empty } from "./test-store.js";

const SECRET = "C:\secret-state\join-rules\tenant-a.lock";
const FRAGMENTS = ["secret-state", "join-rules\\", "tenant-a.lock", ".lock", "C:\\", "NOT stealing", "delete the file"];
const KEYS = { "a-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] } };
const RULES = { version: 1, ownDomains: [], rules: [] };
const URL_PATH = "/calendar/join-rules";

class StoreError extends Error {
  constructor(public readonly code: string) { super(`stale join-rules lock ${SECRET} still held (content {"pid":99}); NOT stealing it: delete the file ${SECRET} by hand`); this.name = "JoinRulesStoreError"; }
}
/** Which store method throws: `load` fails every read; `write` fails only save / record* (so load-first succeeds). */
function thrower(code: string, where: "load" | "write"): JoinRulesDeps {
  const boom = async (): Promise<never> => { throw new StoreError(code); };
  return {
    load: where === "load" ? boom : async () => empty(),
    save: boom, recordApproval: boom, recordOptOut: boom, removeOptOut: boom,
    validateRuleSet: i => i as ReturnType<JoinRulesDeps["validateRuleSet"]>,
  };
}
const ROUTES: [string, string, string, unknown][] = [
  ["GET", "GET", URL_PATH, undefined], ["PUT", "PUT", URL_PATH, RULES],
  ["approvals", "POST", `${URL_PATH}/approvals`, { kind: "sender", value: "x@y.example" }], ["opt-outs", "POST", `${URL_PATH}/opt-outs`, { eventId: "e1" }],
  ["opt-outs/remove", "POST", `${URL_PATH}/opt-outs/remove`, { eventId: "e1" }],
];
async function hit(deps: JoinRulesDeps | undefined, method: string, path: string, body: unknown) {
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), ...(deps ? { joinRules: deps } : {}) }));
  try {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method, headers: { authorization: "Bearer a-key", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    const headers = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
    return { status: res.status, text, headers, retryAfter: res.headers.get("retry-after"), json: JSON.parse(text) as { error: string; message: string } };
  } finally { await server.close(); }
}
const noLeak = (r: { text: string; headers: string }, label: string) => {
  for (const f of FRAGMENTS) assert.ok(!r.text.includes(f) && !r.headers.includes(f), `${label}: leaked ${JSON.stringify(f)}`);
};

for (const [name, method, path, body] of ROUTES) {
  const where = name === "GET" ? "load" : "write";
  test(`${name}: store code locked -> 503 join_rules_busy + Retry-After ${BUSY_RETRY_AFTER_SECONDS}, no path leak`, async () => {
    const r = await hit(thrower("locked", where), method, path, body);
    assert.equal(r.status, 503);
    assert.equal(r.json.error, "join_rules_busy");
    assert.equal(r.retryAfter, String(BUSY_RETRY_AFTER_SECONDS));
    assert.deepEqual(Object.keys(r.json).sort(), ["error", "message"]);
    noLeak(r, name);
  });
  test(`${name}: store code lock-failed -> 500 join_rules_unavailable, no Retry-After, no path leak`, async () => {
    const r = await hit(thrower("lock-failed", where), method, path, body);
    assert.equal(r.status, 500);
    assert.equal(r.json.error, "join_rules_unavailable");
    assert.equal(r.retryAfter, null);
    noLeak(r, name);
  });
  test(`${name}: an unknown store code and a non-store error -> 500 join_rules_unavailable, no leak`, async () => {
    for (const code of ["brand-new-code", "__proto__", "constructor", "toString"]) {
      const r = await hit(thrower(code, where), method, path, body);
      assert.equal(r.status, 500, code); assert.equal(r.json.error, "join_rules_unavailable", code); assert.equal(r.retryAfter, null, code);
      noLeak(r, `${name}/${code}`);
    }
    const plain = thrower("x", where); const boom = async (): Promise<never> => { throw new Error(`EACCES ${SECRET}`); };
    const r = await hit({ ...plain, load: where === "load" ? boom : plain.load, save: boom, recordApproval: boom, recordOptOut: boom }, method, path, body);
    assert.equal(r.status, 500); assert.equal(r.json.error, "join_rules_unavailable"); noLeak(r, name);
  });
}

test("every other store code (corrupt, not-a-file, write-failed, ...) keeps the fixed 500 on every route", async () => {
  const codes = (Object.keys(STORE_FAILURE) as JoinRulesStoreCode[]).filter(c => c !== "locked" && c !== "too-large" && c !== "invalid");
  for (const code of codes) for (const [name, method, path, body] of ROUTES) {
    const r = await hit(thrower(code, name === "GET" ? "load" : "write"), method, path, body);
    assert.equal(r.status, 500, `${code} ${name}`); assert.equal(r.json.error, "join_rules_unavailable", `${code} ${name}`);
    noLeak(r, `${code} ${name}`);
  }
});

test("too-large stays 413 on PUT save and invalid stays 400 on approvals / opt-outs (unchanged by the table)", async () => {
  const tooLarge = await hit(thrower("too-large", "write"), "PUT", URL_PATH, RULES);
  assert.equal(tooLarge.status, 413); assert.equal(tooLarge.json.error, "payload_too_large"); noLeak(tooLarge, "413");
  const a = await hit(thrower("invalid", "write"), "POST", `${URL_PATH}/approvals`, { kind: "sender", value: "x@y.example" });
  const o = await hit(thrower("invalid", "write"), "POST", `${URL_PATH}/opt-outs`, { eventId: "e1" });
  assert.equal(a.status, 400); assert.equal(o.status, 400); noLeak(a, "400a"); noLeak(o, "400o");
});

test("503 'no store configured' stays distinguishable from 503 busy by its error code", async () => {
  const none = await hit(undefined, "GET", URL_PATH, undefined);
  const busy = await hit(thrower("locked", "load"), "GET", URL_PATH, undefined);
  assert.equal(none.status, 503); assert.equal(busy.status, 503);
  assert.equal(none.json.error, "join_rules_unavailable"); assert.equal(busy.json.error, "join_rules_busy");
  assert.equal(none.retryAfter, null);
});

test("the status table is total over the store's code union and only `locked` is 503", () => {
  const all: JoinRulesStoreCode[] = ["bad-tenant", "corrupt", "too-large", "invalid", "tenant-mismatch", "not-a-file", "write-failed", "locked", "lock-failed"];
  assert.deepEqual(Object.keys(STORE_FAILURE).sort(), [...all].sort());
  assert.deepEqual(all.filter(c => STORE_FAILURE[c].status === 503), ["locked"]);
});
