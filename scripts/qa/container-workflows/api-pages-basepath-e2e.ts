/**
 * ISS-408 end-to-end check: the API-served HTML pages work behind the real web nginx under
 * APP_BASE_PATH=/knowledgebase (nginx strips <base>/api/ before proxying, sends no X-Forwarded-Prefix).
 * Starts the real Express app with test fakes on 0.0.0.0:<ephemeral>, runs the pinned nginx image with
 * the repo's apps/web/nginx.conf template + 18-lkb-base-path.envsh, then does what a browser does:
 * loads each page through <base>/api/..., resolves every nav link / API_ROOT-derived call relative to
 * the page URL and requests it THROUGH nginx. Exit 0 only if every one reaches the API (not the SPA).
 * Usage (needs Docker; nginx:1.27-alpine must be local or pullable; container is removed on exit):
 *   cd apps/api && node --import tsx ../../scripts/qa/container-workflows/api-pages-basepath-e2e.ts
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createServer } from "../../../apps/api/src/server.js";
import { buildTestDeps, fakeKeyStore } from "../../../apps/api/src/fixtures.js";

const NAME = `api-pages-basepath-nginx-${process.pid}`;
const BASE = "/knowledgebase";
const KEY = "e2e-key";
const repo = resolve(import.meta.dirname, "../../..");
const docker = (...a: string[]) => execFileSync("docker", a, { encoding: "utf8" }).trim();

const deps = buildTestDeps({ keyStore: fakeKeyStore({ [KEY]: { tenantId: "tenant-1", scopes: ["ask", "compete", "sessions", "gaps"] } }) });
const api = createServer(deps).listen(0, "0.0.0.0");
await new Promise<void>((r) => api.once("listening", () => r()));
const apiPort = (api.address() as { port: number }).port;
let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failures++; };

try {
  docker("run", "-d", "--rm", "--name", NAME, "-p", "127.0.0.1::8080",
    "--add-host", "host.docker.internal:host-gateway",
    "-e", "PORT=8080", "-e", `APP_BASE_PATH=${BASE}`, "-e", `API_UPSTREAM=http://host.docker.internal:${apiPort}`,
    "-v", `${repo}/apps/web/nginx.conf:/etc/nginx/templates/default.conf.template:ro`,
    "-v", `${repo}/apps/web/docker/18-lkb-base-path.envsh:/docker-entrypoint.d/18-lkb-base-path.envsh:ro`,
    "nginx:1.27-alpine");
  const hostPort = docker("port", NAME, "8080/tcp").split("\n")[0]!.split(":").pop();
  const origin = `http://127.0.0.1:${hostPort}`;
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`${origin}/healthz`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }

  const auth = { authorization: `Bearer ${KEY}` };
  const pages = ["/api/compete", "/api/", "/api/sessions-ui", "/api/sessions-ui/some-id", "/api/dashboard-ui", "/api/docs-ui"];
  for (const p of pages) {
    const pageUrl = `${origin}${BASE}${p}`;
    const res = await fetch(pageUrl);
    const html = await res.text();
    check(res.status === 200 && /<html>/.test(html) && /Living Knowledge Base/.test(html) && !/id="root"/.test(html), `${BASE}${p} is the API page (HTTP ${res.status}), not the SPA`);
    const hrefs = [...html.matchAll(/\bhref="([^"]*)"/g)].map((m) => m[1]!);
    for (const h of hrefs) {
      const r = await fetch(new URL(h, pageUrl));
      const body = await r.text();
      check(r.status === 200 && /Living Knowledge Base/.test(body) && (/<nav class="top-nav">/.test(body) || /id="startBtn"/.test(body)), `nav ${h} -> ${new URL(h, pageUrl).pathname} reaches an API page`);
    }
    const root = /const API_ROOT = "([^"]*)";/.exec(html)?.[1];
    if (root !== undefined && p !== "/api/compete") {
      const target = new URL(`${root}sessions`, pageUrl);
      const r = await fetch(target, { headers: auth });
      check(r.status === 200 && (r.headers.get("content-type") ?? "").includes("json"), `${p}: script fetch ${target.pathname} reaches the API JSON route (HTTP ${r.status})`);
    }
    if (p === "/api/compete") {
      const target = new URL(`${root}compete/start`, pageUrl);
      const r = await fetch(target, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ question: "q", counsellor: { name: "e2e" } }) });
      check((r.headers.get("content-type") ?? "").includes("json") && r.status !== 404, `compete: POST ${target.pathname} reaches the API (HTTP ${r.status}, ${r.headers.get("content-type")})`);
    }
  }
} finally {
  try { docker("rm", "-f", NAME); } catch { /* already gone (--rm) */ }
  api.close();
}
console.log(failures === 0 ? "api-pages-basepath e2e: ALL PASS" : `api-pages-basepath e2e: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
