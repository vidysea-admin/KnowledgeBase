import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { hostingPublicAddress, hostingUrl } from "./policy.js";
import { createHostingTransport, validateHostingDestination } from "./transport.js";

test("registration policy refuses hostile schemes, credentials, origins, query secret and private addresses", () => {
  const origins = new Set(["https://hooks.example.test", "https://127.0.0.1", "https://[::1]"]);
  for (const url of ["http://hooks.example.test/", "https://user:pass@hooks.example.test/", "https://hooks.example.test/?key=secret", "https://hooks.example.test/#x", "https://hooks.example.test.evil/", "https://127.0.0.1/", "https://[::1]/", "https://hooks.example.test\n/"]) assert.throws(() => hostingUrl(url, origins));
  assert.equal(hostingUrl("https://hooks.example.test/path", origins).pathname, "/path");
  for (const ip of ["0.0.0.0", "10.0.0.1", "127.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.0.1", "100.64.0.1", "198.18.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "::1", "::ffff:8.8.8.8", "fe80::1", "fc00::1", "2001:db8::1", "2002:7f00:1::", "3fff::1"]) assert.equal(hostingPublicAddress(ip), false, ip);
  assert.equal(hostingPublicAddress("8.8.8.8"), true); assert.equal(hostingPublicAddress("2606:4700:4700::1111"), true);
});

test("mixed hostile DNS and bounded DNS timeout are refused before any connection", async () => {
  const url = new URL("https://hooks.example.test/path");
  await assert.rejects(validateHostingDestination(url, async () => ["8.8.8.8", "127.0.0.1"]), /destination_not_allowed/);
  await assert.rejects(validateHostingDestination(url, async () => ["::ffff:127.0.0.1"]), /destination_not_allowed/);
  await assert.rejects(validateHostingDestination(url, async () => new Promise(() => {}), 5), /dns_timeout/);
});

test("actual transport connects validated numeric address while TLS/Host stay original, never follows redirect", async () => {
  let connections = 0, captured: RequestOptions | undefined, body = "";
  const adapter = ((options: RequestOptions, callback: (response: { statusCode: number; resume(): void }) => void) => {
    connections++; captured = options;
    const req = new EventEmitter() as EventEmitter & { setTimeout(ms: number, cb: () => void): void; destroy(): void; end(value: string): void };
    req.setTimeout = () => {}; req.destroy = () => req.emit("close");
    req.end = (value) => { body = value; callback({ statusCode: 302, resume() {} }); req.emit("close"); };
    return req;
  }) as unknown as typeof httpsRequest;
  const send = createHostingTransport({ resolve: async () => ["8.8.8.8"], request: adapter });
  assert.equal(await send({ url: new URL("https://hooks.example.test/path"), body: '{"x":1}', headers: { "X-LKB-Webhook-Signature": "v1=test" } }), 302);
  assert.equal(captured?.hostname, "8.8.8.8"); assert.equal(captured?.servername, "hooks.example.test");
  assert.equal((captured?.headers as Record<string, string>).Host, "hooks.example.test");
  assert.equal(captured?.rejectUnauthorized, true); assert.equal(captured?.path, "/path");
  assert.equal(body, '{"x":1}'); assert.equal(connections, 1);
  let sent = false;
  await assert.rejects(createHostingTransport({ resolve: async () => ["127.0.0.1"], request: (() => { sent = true; }) as unknown as typeof httpsRequest })({ url: new URL("https://hooks.example.test/path"), body: "{}", headers: {} }), /destination_not_allowed/);
  assert.equal(sent, false);
});
