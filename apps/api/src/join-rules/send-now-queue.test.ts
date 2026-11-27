import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { checkHostedLink, createQueuedSendNowDeps, parseHostedUntil, servedTenants } from "./send-now-queue.js";

const now = new Date("2026-11-26T10:00:00.000Z");

test("until: ISO with offset only, future, at most 24 h; HH:MM is refused (server zone is not the user's)", () => {
  assert.deepEqual(parseHostedUntil("2026-11-26T17:00:00+05:30", now), { iso: "2026-11-26T11:30:00.000Z" });
  assert.deepEqual(parseHostedUntil("2026-11-26T12:00Z", now), { iso: "2026-11-26T12:00:00.000Z" });
  for (const bad of ["18:30", "2026-11-26T12:00:00", "2026-11-26T09:00:00Z", "2026-11-27T10:00:01Z", "2026-02-30T10:00:00Z", "2026-11-26T24:00:00Z", "soon"]) {
    assert.ok("problem" in parseHostedUntil(bad, now), bad);
  }
});

test("link: supported meeting links pass with a normalised URL and key; unsafe links are refused with a reason", () => {
  const ok = checkHostedLink(" https://meet.google.com/abc-defg-hij?authuser=0 ");
  assert.deepEqual(ok, { ok: true, meetingUrl: "https://meet.google.com/abc-defg-hij?authuser=0", meetingKey: "meet:abc-defg-hij", platform: "meet" });
  const zoom = checkHostedLink("https://us02web.zoom.us/j/123456789?pwd=x");
  assert.equal(zoom.ok && zoom.platform, "zoom");
  const cases: [string, string][] = [
    ["http://meet.google.com/abc-defg-hij", "not-https"],
    ["https://u:p@meet.google.com/abc-defg-hij", "credentials-in-url"],
    ["https://meet.google.com:8443/abc-defg-hij", "unexpected-port"],
    ["https://meet.google.com/abc-defg-hij?continue=https://evil.example", "embedded-redirect"],
    ["https://meet.google.com/abc-defg-hij?x=%2F%2Fevil.example", "embedded-redirect"],
    ["https://evil.example/abc-defg-hij", "not-a-meeting-url"],
    ["https://meet.google.com/", "not-a-meeting-url"],
    ["https://meet.google.com/abc defg", "malformed-url"],
    ["", "malformed-url"],
    ["not a url", "malformed-url"],
  ];
  for (const [url, reason] of cases) {
    const r = checkHostedLink(url);
    assert.equal(r.ok ? "ok" : r.reason, reason, url);
  }
});

test("served tenants: explicit list, else LKB_TENANT_ID, else vidysea; malformed names dropped", () => {
  assert.deepEqual(servedTenants({}), ["vidysea"]);
  assert.deepEqual(servedTenants({ LKB_TENANT_ID: "acme" }), ["acme"]);
  assert.deepEqual(servedTenants({ LKB_SEND_NOW_TENANTS: "a, b ,,../x" }), ["a", "b"]);
});

test("plan refuses before touching the database: wrong tenant, bad until, bad link", async () => {
  const db = { collection() { throw new Error("database must not be touched"); } } as unknown as Db;
  const deps = createQueuedSendNowDeps({ db, env: { LKB_SEND_NOW_TENANTS: "a" }, now: () => now });
  const kind = async (tenant: string, meetingUrl: string, until: string) => { const r = await deps.plan(tenant, { meetingUrl, until }); return r.ok ? "ok" : r.kind; };
  assert.equal(await kind("b", "https://meet.google.com/abc-defg-hij", "2026-11-26T12:00:00Z"), "forbidden");
  assert.equal(await kind("a", "https://meet.google.com/abc-defg-hij", "18:30"), "invalid");
  assert.equal(await kind("a", "https://evil.example/x", "2026-11-26T12:00:00Z"), "invalid");
});

test("plan fails closed (unreadable) when the queue cannot be read", async () => {
  const db = { collection() { return { createIndex: async () => { throw new Error("down"); } }; } } as unknown as Db;
  const deps = createQueuedSendNowDeps({ db, env: { LKB_SEND_NOW_TENANTS: "a" }, now: () => now });
  const r = await deps.plan("a", { meetingUrl: "https://meet.google.com/abc-defg-hij", until: "2026-11-26T12:00:00Z" });
  assert.equal(r.ok ? "ok" : r.kind, "unreadable");
});

test("production wiring: off unless LKB_SEND_NOW_QUEUE=1, and never replaces an injected launcher", async () => {
  const { withHostedSendNow } = await import("./send-now-queue.js");
  const db = {} as Db, base: { x: number; sendNow?: never } = { x: 1 };
  assert.equal(withHostedSendNow(base, db, {}), base);
  assert.equal(withHostedSendNow(base, db, { LKB_SEND_NOW_QUEUE: "true" }), base);
  const on = withHostedSendNow(base, db, { LKB_SEND_NOW_QUEUE: "1" }) as { sendNow?: { durableDispatch?: true } };
  assert.equal(on.sendNow?.durableDispatch, true);
  const injected = { sendNow: { plan: () => ({ ok: false as const, kind: "invalid" as const, reason: "x", message: "x" }), launch: async () => ({ jobId: "x" }) } };
  assert.equal(withHostedSendNow(injected, db, { LKB_SEND_NOW_QUEUE: "1" }), injected);
});
