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
  const system32 = path.join(process.env.SystemRoot ?? "C:\Windows", "System32");
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
