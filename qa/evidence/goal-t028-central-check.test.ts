import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { Db } from "mongodb";
import { buildHostingIntegrations, type HostingIntegrationInput } from "../../apps/api/src/composition/integrations/hosting.js";
import { createServer } from "../../apps/api/src/server.js";
import { buildTestDeps } from "../../apps/api/src/fixtures.js";
import { HostingWorker } from "../../apps/api/src/hosting/worker.js";
import { createHostingTransport, validateHostingDestination } from "../../apps/api/src/hosting/transport.js";

function fixture() {
  const parent = resolve(tmpdir()), root = mkdtempSync(join(parent, "lkb-t028-checker-"));
  assert.ok(resolve(root).startsWith(parent + sep));
  const scopes = ["hosting", "search", "keys", "webhooks"];
  const rows = new Map([
    ["owner-a", { _id: "owner-a", tenantId: "A", revokedAt: null as string | null, scopes }],
    ["member-a", { _id: "member-a", tenantId: "A", revokedAt: null as string | null, scopes }],
    ["owner-b", { _id: "owner-b", tenantId: "B", revokedAt: null as string | null, scopes }],
    ["plain-a", { _id: "plain-a", tenantId: "A", revokedAt: null as string | null, scopes: ["search"] }],
    ["revoked-a", { _id: "revoked-a", tenantId: "A", revokedAt: "2026-10-14T00:00:00.000Z" as string | null, scopes }],
  ]);
  const queries: Array<Record<string, unknown>> = [];
  const db = { databaseName: "checker_fixture", collection(name: string) {
    assert.equal(name, "api_keys");
    return { find(filter: Record<string, unknown>) {
      assert.ok(filter.tenantId === "A" || filter.tenantId === "B"); queries.push({ ...filter });
      const selected = [...rows.values()].filter(row => Object.entries(filter).every(([key, value]) =>
        key === "scopes" ? typeof value === "string" && row.scopes.includes(value) : row[key as keyof typeof row] === value));
      const cursor = { project: () => cursor, maxTimeMS: () => cursor, limit: () => cursor,
        next: async () => selected[0] ?? null, toArray: async () => selected };
      return cursor;
    } };
  } } as unknown as Db;
  const keyStore = { async verify(token: string) { const row = rows.get(token);
    return !row || row.revokedAt ? null : { tenantId: row.tenantId, keyId: row._id, scopes: [...row.scopes] }; } };
  const unexpected = (): never => { throw new Error("Unexpected provider or write"); };
  const env = { LKB_HOSTING_STATE_DIR: join(root, "hosting"), LKB_COUNSELLOR_STATE_DIR: join(root, "accounts"),
    LKB_HOSTING_ENCRYPTION_KEY: "ab".repeat(32), LKB_HOSTING_BOOTSTRAP_ADMINS: JSON.stringify({ A: ["owner-a"], B: ["owner-b"] }),
    LKB_HOSTING_WEBHOOK_ORIGINS: JSON.stringify(["https://hooks.example.test"]) };
  const input = { db, env, root, keyStore, index: unexpected,
    ask: { tree: { load: unexpected }, askDeps: { complete: unexpected, scoreFn: unexpected, treeSearchFn: unexpected, write: unexpected } },
    routing: { chains: {}, providers: {}, jobWrite: unexpected },
    keys: { listKeys: async () => [], createKey: unexpected, revokeKey: unexpected },
  } as unknown as HostingIntegrationInput;
  const searchCalls: string[] = [];
  async function mount(overrides: Partial<HostingIntegrationInput> = {}, prepare?: (integration: ReturnType<typeof buildHostingIntegrations>) => void) {
    const integration = buildHostingIntegrations({ ...input, ...overrides });
    prepare?.(integration);
    const app = createServer(buildTestDeps({ ...integration, rateLimit: { windowMs: 60000, max: 500 },
      logger: { info() {}, warn() {}, error() {}, debug() {}, child() { return this; } } as any,
      search: { async search(tenant) { searchCalls.push(tenant); return []; } } }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    async function request(path: string, token = "owner-a", method = "GET", body?: unknown) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-tenant-id": "B", "x-actor-id": "owner-b", "x-role": "owner" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
      const text = await response.text();
      return { status: response.status, body: JSON.parse(text) as any,
        contentType: response.headers.get("content-type"), text };
    }
    return { request, integration, close: () => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())) };
  }
  return { root, rows, queries, input, mount, searchCalls, clean() { assert.ok(resolve(root).startsWith(parent + sep)); rmSync(root, { recursive: true, force: true }); } };
}

test("independent real central factory/server lifecycle, role bypass and tenant consumer proof", { timeout: 30000 }, async () => {
  const f = fixture(); let live = await f.mount();
  try {
    assert.equal((await live.request("/counsellor-accounts", "unknown")).status, 401);
    const ids = await live.request("/counsellor-accounts/identities");
    assert.equal(ids.status, 200); assert.deepEqual(ids.body.keyIds.sort(), ["member-a", "owner-a"]);
    assert.ok(f.queries.some(q => q.tenantId === "A" && q.revokedAt === null && q.scopes === "hosting"));
    assert.equal((await live.request("/counsellor-accounts", "owner-a", "POST", { keyId: "plain-a", displayName: "Plain", email: "plain@example.test" })).status, 404);
    const created = await live.request("/counsellor-accounts", "owner-a", "POST", { keyId: "member-a", displayName: "Member", email: "MEMBER@EXAMPLE.TEST" });
    assert.equal(created.status, 201); const id = created.body.account.id;
    assert.equal(created.body.account.email, "member@example.test");
    assert.equal((await live.request(`/counsellor-accounts/${id}`, "owner-b")).status, 404);
    assert.equal((await live.request(`/counsellor-accounts/${id}/role`, "owner-a", "PUT", { expectedRevision: 1, role: "viewer", actorId: "owner-b" })).status, 400);
    assert.equal((await live.request(`/counsellor-accounts/${id}/role`, "owner-a", "PUT", { expectedRevision: 1, role: "viewer" })).status, 200);
    assert.equal((await live.request(`/counsellor-accounts/${id}/role`, "member-a", "PUT", { expectedRevision: 1, role: "admin" })).status, 403);
    assert.equal((await live.request("/search?q=sample", "member-a")).status, 200); assert.equal(f.searchCalls.at(-1), "A");
    assert.equal((await live.request(`/counsellor-accounts/${id}`, "owner-a", "PUT", { expectedRevision: 1, displayName: "Updated", email: "member@example.test" })).status, 200);
    assert.equal((await live.request(`/counsellor-accounts/${id}/deactivate`, "owner-a", "POST", { expectedRevision: 2 })).status, 200);
    const consumed = f.searchCalls.length;
    assert.equal((await live.request("/search?q=sample", "member-a")).status, 401); assert.equal(f.searchCalls.length, consumed);
    assert.equal((await live.request("/hosting/roles/member-a", "owner-a", "PUT", { role: "admin" })).status, 403);
    await live.close(); live = await f.mount();
    assert.equal((await live.request("/search?q=sample", "member-a")).status, 401);
    const restored = await live.request(`/counsellor-accounts/${id}`); assert.equal(restored.body.account.displayName, "Updated"); assert.equal(restored.body.account.status, "inactive");
    assert.equal((await live.request(`/counsellor-accounts/${id}/activate`, "owner-a", "POST", { expectedRevision: 3 })).status, 200);
    assert.equal((await live.request(`/counsellor-accounts/${id}`)).body.account.role, null);
    assert.equal((await live.request("/counsellor-accounts", "member-a")).status, 403);
    // Independently granted API scopes survive profile reactivation; hosted roles require a new grant.
    assert.equal((await live.request("/search?q=existing-scope", "member-a")).status, 200);
    assert.equal(f.searchCalls.at(-1), "A");
    assert.equal((await live.request("/hosting/roles", "member-a")).status, 403);
    assert.equal((await live.request(`/counsellor-accounts/${id}/role`, "owner-a", "PUT", { expectedRevision: 4, role: "editor" })).status, 200);
    assert.equal((await live.request("/counsellor-accounts", "member-a")).status, 200);
    const profileAudit = await live.request("/counsellor-accounts/audit"), roleAudit = await live.request("/hosting/audit");
    assert.deepEqual(profileAudit.body.audit.map((r: any) => r.operation), ["account.create", "account.update", "account.deactivate", "account.activate"]);
    assert.ok(profileAudit.body.audit.every((r: any) => r.actorId === "owner-a"));
    assert.equal(roleAudit.body.records.filter((r: any) => r.operation === "role.set").length, 3);
    assert.ok(!JSON.stringify(profileAudit.body).includes("member@example.test"));
    f.rows.get("member-a")!.revokedAt = "2026-10-14T20:00:00.000Z";
    assert.equal((await live.request("/search?q=revoked", "member-a")).status, 401);
    assert.equal((await live.request(`/counsellor-accounts/${id}/role`, "owner-a", "PUT", { expectedRevision: 4, role: "admin" })).status, 404);
    assert.equal((await live.request(`/counsellor-accounts/${id}/delete`, "owner-a", "POST", { expectedRevision: 4 })).status, 200);
    assert.equal((await live.request("/search?q=sample", "member-a")).status, 401);
    assert.equal((await live.request(`/counsellor-accounts/${id}`)).status, 404);
    assert.equal((await live.request("/counsellor-accounts", "owner-a", "POST", { keyId: "member-a", displayName: "Cannot resurrect", email: "r@example.test" })).status, 404);
  } finally { await live.close(); f.clean(); }
});

test("T060 independent mounted key authority and persisted pending commit fence across unrelated scopes", { timeout: 30000 }, async () => {
  // These are byte-persisted incomplete intent records, modelling a process exit before completion.
  // Every reconstruction uses the real central factory, HostingService and account provider.
  for (const kind of ["account", "key"] as const) {
    const f = fixture(); let live = await f.mount();
    try {
      const denied = await live.request("/keys", "member-a", "POST", { label: "denied", scopes: ["keys"] });
      assert.equal(denied.status, 403);
      assert.match(denied.contentType ?? "", /application\/json/);
      assert.deepEqual(denied.body, { error: "forbidden", message: "service unavailable" });
      const elevation = await live.request("/keys", "owner-a", "POST", { label: "elevation", scopes: ["not-held"] });
      assert.equal(elevation.status, 403);
      const bootstrap = await live.request("/keys/owner-a", "owner-a", "DELETE");
      assert.equal(bootstrap.status, 403);
      assert.equal((await live.request("/search?q=baseline", kind === "account" ? "member-a" : "plain-a")).status, 200);
      const consumed = f.searchCalls.length;
      const journal = live.integration.hosting!.service.options.journal;
      await journal.transaction("A", "owner-a", "2026-10-14T12:00:00.000Z", async () => kind === "account" ? {
        value: undefined, operation: "role.set", target: "member-a", outcome: "account_pending",
        data: { keyId: "member-a", role: null, accountPending: true },
      } : {
        value: undefined, operation: "key.change.intent", target: "interrupted-key-command", outcome: "pending",
        data: { commandId: "interrupted-key-command", kind: "create" },
      });
      await live.close(); live = await f.mount();
      const fenced = await live.request("/search?q=must-not-consume", kind === "account" ? "member-a" : "plain-a");
      assert.equal(fenced.status, 503);
      assert.match(fenced.contentType ?? "", /application\/json/);
      assert.deepEqual(fenced.body, { error: "service_unavailable", message: "service unavailable" });
      assert.equal(f.searchCalls.length, consumed);
      assert.equal(fenced.text.includes("identity_recovery_required"), false);
      assert.equal(fenced.text.includes(f.root), false);
      assert.equal(fenced.text.includes("stack"), false);
      // Another tenant's independently verified key remains usable after tenant A's incomplete intent.
      assert.equal((await live.request("/search?q=tenant-b", "owner-b")).status, 200);
      assert.equal(f.searchCalls.at(-1), "B");
      assert.ok(f.queries.every(query => query.tenantId === "A" || query.tenantId === "B"));
    } finally { await live.close(); f.clean(); }
  }
});

test("T060 independent real mounted registry/event/signed transport/status and restart replay", { timeout: 30000 }, async () => {
  const f = fixture();
  const sent: Array<{ options: RequestOptions; body: string }> = [];
  const adapter = ((options: RequestOptions, callback: (response: { statusCode: number; resume(): void }) => void) => {
    const req = new EventEmitter() as EventEmitter & { setTimeout(ms: number, callback: () => void): void; destroy(): void; end(body: string): void };
    req.setTimeout = () => {}; req.destroy = () => { req.emit("close"); };
    req.end = body => { sent.push({ options, body }); callback({ statusCode: 204, resume() {} }); req.emit("close"); };
    return req;
  }) as unknown as typeof httpsRequest;
  const prepare = (integration: ReturnType<typeof buildHostingIntegrations>) => {
    const hosting = integration.hosting!;
    // Substitute only outbound DNS/socket dependencies. Role, registry, queue, worker,
    // generation fence, journal and exact byte signing remain the real product code.
    hosting.service.options.validateDestination = async url => {
      await validateHostingDestination(url, async () => url.pathname === "/private" ? ["8.8.8.8", "127.0.0.1"] : ["8.8.8.8"]);
    };
    hosting.worker = new HostingWorker(hosting.service, createHostingTransport({ resolve: async () => ["8.8.8.8"], request: adapter }));
  };
  let live = await f.mount({}, prepare);
  try {
    assert.equal((await live.request("/webhooks/register", "member-a", "POST", { url: "https://hooks.example.test/hook", events: ["session.indexed"] })).status, 403);
    assert.equal((await live.request("/webhooks/register", "owner-a", "POST", { url: "https://hooks.example.test/private", events: ["session.indexed"] })).status, 400);
    assert.equal((await live.request("/webhooks/register", "owner-a", "POST", { url: `https://hooks.example.test/${"क".repeat(300)}`, events: ["session.indexed"] })).status, 400);
    assert.deepEqual((await live.request("/webhooks")).body, { subscriptions: [] });
    const registered = await live.request("/webhooks/register", "owner-a", "POST", { url: "https://hooks.example.test/hook", events: ["session.indexed"] });
    assert.equal(registered.status, 201);
    const { id, signingSecret } = registered.body;
    assert.equal(typeof signingSecret, "string");
    assert.equal((await live.request(`/webhooks/${id}`, "owner-b", "DELETE")).status, 404);
    assert.deepEqual((await live.request("/webhooks", "owner-b")).body, { subscriptions: [] });
    const event = { id: "independent-indexed-event", type: "session.indexed", payload: { sessionId: "A-session", privateMarker: "fixture-payload-hidden" } };
    const queued = await live.request("/webhooks/events", "owner-a", "POST", event);
    assert.equal(queued.status, 202); assert.equal(queued.body.deliveryIds.length, 1);
    const dispatched = await live.request("/webhooks/dispatch", "owner-a", "POST", { limit: 1 });
    assert.deepEqual(dispatched.body, { attempted: 1, delivered: 1, uncertain: 0 });
    assert.equal(sent.length, 1);
    const transmitted = sent[0]!, headers = transmitted.options.headers as Record<string, string>;
    assert.equal(transmitted.options.hostname, "8.8.8.8");
    assert.equal(transmitted.options.servername, "hooks.example.test");
    assert.equal(transmitted.options.rejectUnauthorized, true);
    assert.equal(headers.Host, "hooks.example.test");
    assert.equal(headers["X-LKB-Webhook-Id"], queued.body.deliveryIds[0]);
    assert.equal(headers["X-LKB-Webhook-Signature"], `v1=${createHmac("sha256", signingSecret).update(`${headers["X-LKB-Webhook-Timestamp"]}.${headers["X-LKB-Webhook-Id"]}.${transmitted.body}`).digest("hex")}`);
    assert.equal(JSON.parse(transmitted.body).tenantId, "A");
    const publicViews = [];
    for (const path of ["/webhooks", "/webhooks/deliveries", "/hosting/audit"]) publicViews.push(await live.request(path));
    for (const view of publicViews) {
      assert.equal(view.status, 200); assert.equal(view.text.includes(signingSecret), false);
      assert.equal(view.text.includes("sealedSecret"), false); assert.equal(view.text.includes("fixture-payload-hidden"), false);
    }
    assert.equal(publicViews[1]!.body.deliveries[0].status, "delivered");
    assert.deepEqual(publicViews[2]!.body.records.map((row: any) => row.operation), ["webhook.register", "event.publish", "delivery.claim", "delivery.result"]);
    await live.close(); live = await f.mount({}, prepare);
    assert.equal((await live.request("/webhooks/deliveries")).body.deliveries[0].status, "delivered");
    const replay = await live.request("/webhooks/events", "owner-a", "POST", event);
    assert.equal(replay.body.replay, true); assert.deepEqual(replay.body.deliveryIds, queued.body.deliveryIds);
    assert.deepEqual((await live.request("/webhooks/dispatch", "owner-a", "POST", { limit: 1 })).body, { attempted: 0, delivered: 0, uncertain: 0 });
    assert.equal(sent.length, 1);
  } finally { await live.close(); f.clean(); }
});

test("independent central unavailable/corrupt durable account metadata fails closed at unrelated consumer", { timeout: 30000 }, async () => {
  const f = fixture(); let live = await f.mount();
  try {
    assert.equal((await live.request("/counsellor-accounts", "owner-a", "POST", { keyId: "member-a", displayName: "Member", email: "m@example.test" })).status, 201);
    await live.close();
    const path = join(f.root, "accounts", createHash("sha256").update("A").digest("hex"), "audit.jsonl");
    writeFileSync(path, readFileSync(path, "utf8") + "truncated", { encoding: "utf8" });
    live = await f.mount();
    assert.equal((await live.request("/search?q=sample", "member-a")).status, 503);
    assert.equal((await live.request("/counsellor-accounts")).status, 503); assert.equal(f.searchCalls.length, 0);
    await live.close(); live = await f.mount({ env: { ...f.input.env, LKB_COUNSELLOR_STATE_DIR: "relative" } });
    assert.equal((await live.request("/search?q=sample", "member-a")).status, 503); assert.equal(f.searchCalls.length, 0);
  } finally { await live.close(); f.clean(); }
});
