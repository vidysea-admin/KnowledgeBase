import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { hostingFixture } from "./test-kit.js";
import { HostingWorker } from "./worker.js";
import { createHostingTransport } from "./transport.js";
import type { request } from "node:https";

test("signed delivery consumes durable event and registry then survives restart/replay without ordinary duplicate", async () => {
  const f = hostingFixture();
  try {
    const registered = await f.service.register(f.ownerA, "https://hooks.example.test/receiver", ["session.indexed"]);
    const published = await f.service.publish(f.ownerA, "session-a-indexed", "session.indexed", { sessionId: "a-session" });
    let sent = 0;
    const worker = new HostingWorker(f.make(), async (request) => {
      sent++; assert.equal(request.url.href, "https://hooks.example.test/receiver");
      const timestamp = request.headers["X-LKB-Webhook-Timestamp"]!, id = request.headers["X-LKB-Webhook-Id"]!;
      assert.equal(id, published.deliveryIds[0]);
      assert.equal(request.headers["X-LKB-Webhook-Signature"], `v1=${createHmac("sha256", registered.signingSecret).update(`${timestamp}.${id}.${request.body}`).digest("hex")}`);
      assert.equal(JSON.parse(request.body).tenantId, "A"); return 204;
    });
    assert.deepEqual(await worker.dispatch(f.ownerA), { attempted: 1, delivered: 1, uncertain: 0 });
    assert.equal((await f.make().deliveries(f.ownerA)).deliveries[0]?.status, "delivered");
    await f.make().publish(f.ownerA, "session-a-indexed", "session.indexed", { sessionId: "a-session" });
    await new HostingWorker(f.make(), async () => { sent++; return 200; }).dispatch(f.ownerA);
    assert.equal(sent, 1);
    assert.deepEqual((await f.make().deliveries(f.ownerB)).deliveries, []);
  } finally { f.close(); }
});

test("retry/restart preserves identity and reports non-2xx, private error and redirect without secrets", async () => {
  const f = hostingFixture();
  try {
    const r = await f.service.register(f.ownerA, "https://hooks.example.test/receiver", ["claim.verified"]);
    await f.service.publish(f.ownerA, "ev", "claim.verified", { secretPayload: "payload-not-public" });
    const ids: string[] = [];
    for (let n = 0; n < 5; n++) {
      const worker = new HostingWorker(f.make(), async (request) => { ids.push(request.headers["X-LKB-Webhook-Id"]!); if (n === 1) throw new Error(r.signingSecret); return n === 2 ? 302 : 500; });
      await worker.dispatch(f.ownerA); f.tick(65000);
    }
    assert.equal(new Set(ids).size, 1);
    const view = await f.service.deliveries(f.ownerA);
    assert.equal(view.deliveries[0]?.status, "failed"); assert.equal(view.deliveries[0]?.attempts, 5);
    assert.equal(JSON.stringify(view).includes(r.signingSecret), false);
    assert.equal(JSON.stringify(view).includes("payload-not-public"), false);
    assert.equal(JSON.stringify(await f.service.audit(f.ownerA)).includes(r.signingSecret), false);
  } finally { f.close(); }
});

test("expired sending lease is honest ACK-uncertainty retry and revoke generation fences acknowledgement", async () => {
  const f = hostingFixture();
  try {
    const r = await f.service.register(f.ownerA, "https://hooks.example.test/receiver", ["retention.completed"]);
    const ev = await f.service.publish(f.ownerA, "ev", "retention.completed", {});
    await f.service.operate(f.ownerA, "deliveries:dispatch", async () => ({ value: undefined, operation: "delivery.claim", target: ev.deliveryIds[0]!, outcome: "attempting",
      data: { id: ev.deliveryIds[0], attemptId: "crashed-attempt", leaseUntil: f.service.now() + 30000 } }));
    f.tick(30001);
    const worker = new HostingWorker(f.make(), async () => { await f.service.revoke(f.ownerA, r.id); return 200; });
    assert.deepEqual(await worker.dispatch(f.ownerA, 1), { attempted: 1, delivered: 0, uncertain: 1 });
    assert.equal((await f.make().deliveries(f.ownerA)).deliveries[0]?.status, "cancelled");
    assert.ok((await f.make().audit(f.ownerA)).records.some((r) => r.outcome === "acknowledgement_uncertain_retry"));
  } finally { f.close(); }
});

test("viewer cannot enqueue or dispatch; editor cannot deliver or read mutation audit", async () => {
  const f = hostingFixture();
  try {
    await f.service.setRole(f.ownerA, "memberA", "viewer");
    await f.service.setRole(f.ownerA, "editorA", "editor");
    await assert.rejects(f.service.publish(f.memberA, "x", "session.indexed", {}), /forbidden/);
    await assert.rejects(new HostingWorker(f.service, async () => 200).dispatch(f.editorA), /forbidden/);
    await assert.rejects(f.service.audit(f.editorA), /forbidden/);
    assert.deepEqual(await f.service.publish(f.editorA, "x", "session.indexed", {}), { deliveryIds: [], replay: false });
  } finally { f.close(); }
});

test("revoke while DNS is paused prevents TLS initialization across fresh runtimes and persisted-only fencing", async () => {
  for (const persistedOnly of [false, true]) {
    const f = hostingFixture();
    let resume!: (addresses: string[]) => void;
    let started!: () => void;
    const resolving = new Promise<void>((resolve) => { started = resolve; });
    let initialized = 0;
    try {
      const subscription = await f.service.register(f.ownerA, "https://hooks.example.test/hook", ["session.indexed"]);
      await f.service.publish(f.ownerA, "event-before-revoke", "session.indexed", {});
      const transport = createHostingTransport({
        resolve: async () => { started(); return new Promise<string[]>((resolve) => { resume = resolve; }); },
        request: (() => { initialized++; throw new Error("unexpected TLS initialization"); }) as typeof request,
      });
      const dispatch = new HostingWorker(f.make(), transport).dispatch(f.ownerA, 1);
      await resolving;
      if (persistedOnly) {
        // Models another process: no in-memory revoke notification reaches the worker.
        await f.make().options.journal.transaction("A", "ownerA", new Date(f.service.now()).toISOString(), async () => ({
          value: undefined, operation: "webhook.revoke", target: subscription.id, outcome: "revoked", data: { id: subscription.id, generation: 2 },
        }));
      } else await f.make().revoke(f.ownerA, subscription.id);
      resume(["93.184.216.34"]);
      assert.deepEqual(await dispatch, { attempted: 1, delivered: 0, uncertain: 1 });
      assert.equal(initialized, 0);
      assert.equal((await f.make().deliveries(f.ownerA)).deliveries[0]?.status, "cancelled");
    } finally { f.close(); }
  }
});
