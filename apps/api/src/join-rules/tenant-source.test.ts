/**
 * apps/api/src/join-rules/tenant-source.test.ts — T-037 fix cycle 1 (ISS-T037API-001). The tenant used for
 * EVERY read and write must be the authenticated key's tenant, even when the request also names another
 * tenant in a header, the query string, the path, or the body (top level / nested / __proto__ / constructor).
 * Assertions are on WHICH tenant's data was touched (spy on every dep call's tenant argument; tenant-b's
 * stored bytes unchanged; tenant-a's changed), never on the status code alone: a 200 can still be a write
 * to the wrong tenant. Kills the mutants "tenant from x-tenant-id header" (M1) and "tenant from body" (M8).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { spyStore, empty } from "./test-store.js";

const P = "/calendar/join-rules";
const KEYS = { "a-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] } };
const A_SEED = { ruleSet: { version: 1 as const, ownDomains: ["a-own.example"], rules: [] }, state: { approvedSenders: ["a@a.example"], approvedDomains: [], optedOutEventIds: ["a-ev"] } };
const B_SEED = { ruleSet: { version: 1 as const, ownDomains: ["b-own.example"], rules: [{ id: "b1", effect: "deny" as const, match: { domain: "evil.example" } }] }, state: { approvedSenders: ["b@b.example"], approvedDomains: ["b.example"], optedOutEventIds: ["b-ev"] } };
const RULES = { version: 1, ownDomains: ["new-a.example"], rules: [{ id: "n1", effect: "allow", match: { domain: "trusted.example" } }] };
const HEADERS = ["x-tenant-id", "x-tenant", "tenant-id", "x-forwarded-tenant", "x-tenantid", "tenantid", "tenant"];
const QUERIES = ["?tenantId=tenant-b", "?tenant=tenant-b", "?tenant_id=tenant-b", "?x-tenant-id=tenant-b", "?tenantId=tenant-b&tenant=tenant-b&tenantId=tenant-b"];
const HOSTILE_FIELDS = ["tenantId", "tenant", "tenant_id", "__proto__", "constructor", "prototype"];

type Spy = ReturnType<typeof spyStore>;
type Raw = (method: string, path: string, body?: string, headers?: Record<string, string>) => Promise<{ status: number; text: string }>;

async function harness(fn: (ctx: { s: Spy; bBefore: string; raw: Raw }) => Promise<void>) {
  const s = spyStore();
  s.put("tenant-a", A_SEED); s.put("tenant-b", B_SEED);
  const bBefore = s.bytes.get("tenant-b")!;
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), joinRules: s.deps }));
  const raw: Raw = async (method, path, body, headers = {}) => {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method, headers: { authorization: "Bearer a-key", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, ...(body !== undefined ? { body } : {}),
    });
    return { status: res.status, text: await res.text() };
  };
  try { await fn({ s, bBefore, raw }); } finally { await server.close(); }
}

const otherTenants = (s: Spy) => [...new Set(s.calls.map(c => c.tenantId))].filter(t => t !== "tenant-a");

/** The spy invariant: no dep call ever named a tenant other than tenant-a, and tenant-b is byte-identical. */
function assertOnlyA(s: Spy, bBefore: string, label: string) {
  assert.ok(s.calls.length > 0, `${label}: expected the deps to be called`);
  assert.deepEqual(otherTenants(s), [], `${label}: a dep call named another tenant`);
  assert.equal(s.bytes.get("tenant-b"), bBefore, `${label}: tenant-b bytes changed`);
}

test("every tenant-naming HEADER is ignored: reads return tenant-a's data, writes land only on tenant-a", async () => {
  for (const h of HEADERS) {
    await harness(async ({ s, bBefore, raw }) => {
      const hdr = { [h]: "tenant-b" };
      const get = await raw("GET", P, undefined, hdr);
      assert.equal(get.status, 200, h);
      assert.deepEqual(JSON.parse(get.text), A_SEED, `${h}: GET must return tenant-a's stored value`);
      assert.equal((await raw("PUT", P, JSON.stringify(RULES), hdr)).status, 200, h);
      assert.equal((await raw("POST", `${P}/approvals`, JSON.stringify({ kind: "domain", value: "ok.example" }), hdr)).status, 200, h);
      assert.equal((await raw("POST", `${P}/opt-outs`, JSON.stringify({ eventId: "ev-new" }), hdr)).status, 200, h);
      assertOnlyA(s, bBefore, `header ${h}`);
      const a = JSON.parse(s.bytes.get("tenant-a")!);
      assert.deepEqual(a.ruleSet, RULES, `${h}: PUT landed on tenant-a`);
      assert.ok(a.state.approvedDomains.includes("ok.example") && a.state.optedOutEventIds.includes("ev-new"), `${h}: POSTs landed on tenant-a`);
    });
  }
});

test("every tenant-naming QUERY string is ignored on all four routes", async () => {
  for (const q of QUERIES) {
    await harness(async ({ s, bBefore, raw }) => {
      assert.deepEqual(JSON.parse((await raw("GET", `${P}${q}`)).text), A_SEED, q);
      assert.equal((await raw("PUT", `${P}${q}`, JSON.stringify(RULES))).status, 200, q);
      assert.equal((await raw("POST", `${P}/approvals${q}`, JSON.stringify({ kind: "sender", value: "n@a.example" }))).status, 200, q);
      assert.equal((await raw("POST", `${P}/opt-outs${q}`, JSON.stringify({ eventId: "ev-q" }))).status, 200, q);
      assertOnlyA(s, bBefore, `query ${q}`);
      const a = JSON.parse(s.bytes.get("tenant-a")!);
      assert.deepEqual(a.ruleSet, RULES, q);
      assert.ok(a.state.approvedSenders.includes("n@a.example") && a.state.optedOutEventIds.includes("ev-q"), q);
    });
  }
});

test("a tenant in the PATH never selects the tenant: no route matches, nothing is called", async () => {
  await harness(async ({ s, bBefore, raw }) => {
    const probes: [string, string, string?][] = [
      ["GET", `${P}/tenant-b`], ["PUT", `${P}/tenant-b`, JSON.stringify(RULES)],
      ["POST", `${P}/tenant-b/approvals`, JSON.stringify({ kind: "domain", value: "x.example" })], ["POST", `/tenants/tenant-b${P}`, "{}"], ["GET", `/tenant-b${P}`],
    ];
    for (const [m, p, b] of probes) {
      const r = await raw(m, p, b);
      assert.ok(r.status === 404 || r.status === 403, `${m} ${p} -> ${r.status}`);
    }
    assert.equal(s.calls.length, 0);
    assert.equal(s.bytes.get("tenant-b"), bBefore);
  });
});

test("a tenant named in the BODY (top level, nested, __proto__, constructor) never selects the tenant", async () => {
  await harness(async ({ s, bBefore, raw }) => {
    const valid: [string, string, Record<string, unknown>][] = [
      ["PUT", P, RULES], ["POST", `${P}/approvals`, { kind: "domain", value: "ok.example" }], ["POST", `${P}/opt-outs`, { eventId: "ev-b" }],
    ];
    for (const [m, p, base] of valid) {
      for (const f of HOSTILE_FIELDS) {
        // raw JSON so `__proto__` / `constructor` stay OWN keys exactly as an attacker would send them
        for (const hostile of [`"tenant-b"`, `{"tenantId":"tenant-b","tenant":"tenant-b"}`, `["tenant-b"]`]) {
          const body = JSON.stringify(base).replace(/\}$/, `,${JSON.stringify(f)}:${hostile}}`);
          const r = await raw(m, p, body);
          assert.ok(r.status === 400 || r.status === 200, `${m} ${p} ${f} -> ${r.status}`);
          assert.deepEqual(otherTenants(s), [], `${m} ${p} body.${f}=${hostile}: a dep call named another tenant`);
          assert.equal(s.bytes.get("tenant-b"), bBefore, `${m} ${p} body.${f}=${hostile}: tenant-b changed`);
        }
      }
      const nested = JSON.stringify(base).replace(/\}$/, `,"meta":{"tenantId":"tenant-b"},"state":{"tenantId":"tenant-b"}}`);
      const r = await raw(m, p, nested);
      assert.ok(r.status === 400 || r.status === 200);
    }
    assertOnlyA(s, bBefore, "body");
  });
});

test("a valid approval/opt-out/PUT body carrying `tenant` or `tenantId` is refused 400 and writes nothing, anywhere", async () => {
  await harness(async ({ s, bBefore, raw }) => {
    const aBefore = s.bytes.get("tenant-a")!;
    for (const f of ["tenant", "tenantId"]) {
      assert.equal((await raw("POST", `${P}/approvals`, JSON.stringify({ kind: "domain", value: "ok.example", [f]: "tenant-b" }))).status, 400, f);
      assert.equal((await raw("POST", `${P}/opt-outs`, JSON.stringify({ eventId: "ev", [f]: "tenant-b" }))).status, 400, f);
      assert.equal((await raw("PUT", P, JSON.stringify({ ...RULES, [f]: "tenant-b" }))).status, 400, f);
    }
    assert.equal(s.calls.filter(c => c.op === "save").length, 0);
    assert.equal(s.bytes.get("tenant-a"), aBefore);
    assert.equal(s.bytes.get("tenant-b"), bBefore);
  });
});

test("fixture sanity: the two seeds and the empty value all differ (the checks above are not vacuous)", () => {
  assert.notDeepEqual(A_SEED, B_SEED); assert.notDeepEqual(A_SEED, empty()); assert.notDeepEqual(B_SEED, empty());
});
