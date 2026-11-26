import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID, randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { createHostBotPrivacyDeps } from "./host-connector.js";
// Mode bits are ignored on Windows: make THIS test's own temp directory private (SYSTEM, Administrators, current identity only).
function makePrivateOnWindows(directory: string): void {
  if (process.platform !== "win32") return;
  const system32 = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  const who = spawnSync(path.join(system32, "whoami.exe"), ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true });
  const sid = /"(S-1-[0-9]+(?:-[0-9]+)+)"/.exec(who.stdout ?? "")?.[1];
  assert.ok(who.status === 0 && sid, "current Windows identity SID required for fixture ACL");
  const acl = spawnSync(path.join(system32, "icacls.exe"), [directory, "/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F", `*${sid}:(OI)(CI)F`], { encoding: "utf8", windowsHide: true });
  assert.equal(acl.status, 0, `fixture ACL setup failed: ${acl.stderr}`);
}
const mac = (secret: string, domain: string, value: unknown) => createHmac("sha256", secret).update(domain + "\n" + JSON.stringify(value)).digest("hex");
test("host connector requests carry Connection: close so a pooled idle socket is never reused (ECONNRESET race)", { timeout: 60000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "host-connector-"));
  const seen: Array<string | undefined> = [];
  const secret = randomBytes(32).toString("hex"), generation = randomUUID();
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      seen.push(req.headers.connection);
      const body = JSON.parse(raw);
      const proof = { version: 1, requestId: body.requestId, generation, result: "status", status: "recording", privacy: "public" };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...proof, mac: mac(secret, "capture-response-v1", proof) }));
    });
  });
  try {
    makePrivateOnWindows(root);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    mkdirSync(path.join(root, "owned"), { mode: 0o700 });
    writeFileSync(path.join(root, "owned", `capture--${generation}.json`), JSON.stringify({ version: 1, tenantId: "owned", sessionId: "capture", generation, host: hostname(), origin: `http://127.0.0.1:${port}`, secret }), { mode: 0o600 });
    const rows = await createHostBotPrivacyDeps(root).list("owned");
    assert.equal(rows.length, 1, "status proof must still be accepted (HMAC verified)");
    assert.equal(rows[0]!.privacy, "public");
    assert.deepEqual(seen.map(value => value?.toLowerCase()), ["close"]);
  } finally {
    server.close();
    server.closeAllConnections?.();
    rmSync(root, { recursive: true, force: true });
  }
});
// Self-heal: a transient failure must be retried once; a final failure keeps the row as "unavailable", never drops it, never claims a privacy state without a verified HMAC.
type Handler = (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, body: { requestId: string }, attempt: number) => void;
async function withRecorder(handler: Handler, run: (list: () => ReturnType<ReturnType<typeof createHostBotPrivacyDeps>["list"]>, generation: string, secret: string, attempts: () => number) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), "host-connector-"));
  const secret = randomBytes(32).toString("hex"), generation = randomUUID();
  let attempts = 0;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => { attempts += 1; handler(req, res, JSON.parse(raw), attempts); });
  });
  try {
    makePrivateOnWindows(root);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    mkdirSync(path.join(root, "owned"), { mode: 0o700 });
    writeFileSync(path.join(root, "owned", `capture--${generation}.json`), JSON.stringify({ version: 1, tenantId: "owned", sessionId: "capture", generation, host: hostname(), origin: `http://127.0.0.1:${port}`, secret }), { mode: 0o600 });
    await run(() => createHostBotPrivacyDeps(root).list("owned"), generation, secret, () => attempts);
  } finally {
    server.close();
    server.closeAllConnections?.();
    rmSync(root, { recursive: true, force: true });
  }
}
const reply = (res: import("node:http").ServerResponse, secret: string, generation: string, requestId: string, privacy: string, badMac = false) => {
  const proof = { version: 1, requestId, generation, result: "status", status: "recording", privacy };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ...proof, mac: badMac ? "0".repeat(64) : mac(secret, "capture-response-v1", proof) }));
};
test("host connector retries a transient status failure once and returns the verified live state", { timeout: 60000 }, async () => {
  let secretRef = "", genRef = "";
  await withRecorder((req, res, body, attempt) => { if (attempt === 1) { req.socket.destroy(); return; } reply(res, secretRef, genRef, body.requestId, "private"); }, async (list, generation, secret, attempts) => {
    secretRef = secret; genRef = generation;
    const rows = await list();
    assert.deepEqual(rows, [{ tenantId: "owned", sessionId: "capture", generation, status: "recording", privacy: "private" }]);
    assert.equal(attempts(), 2);
  });
});
test("host connector keeps the row as interrupted/unavailable when both attempts fail", { timeout: 60000 }, async () => {
  await withRecorder((req) => { req.socket.destroy(); }, async (list, generation, _secret, attempts) => {
    const rows = await list();
    assert.deepEqual(rows, [{ tenantId: "owned", sessionId: "capture", generation, status: "interrupted", privacy: "unavailable" }]);
    assert.equal(attempts(), 2);
  });
});
test("host connector never reports the claimed privacy when the reply mac is bad", { timeout: 60000 }, async () => {
  let secretRef = "", genRef = "";
  await withRecorder((_req, res, body) => { reply(res, secretRef, genRef, body.requestId, "public", true); }, async (list, generation, secret) => {
    secretRef = secret; genRef = generation;
    const rows = await list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.privacy, "unavailable");
    assert.equal(rows[0]!.status, "interrupted");
  });
});
