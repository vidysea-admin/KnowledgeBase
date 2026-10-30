/** T-057 E4 `GET /setup/status`: booleans only, authenticated, never a secret value. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps } from "../fixtures.js";

const SECRETS = { GEMINI_API_KEY: "AIzaFAKE-gemini-secret-123", TAVILY_API_KEY: "tvly-FAKE-secret-456", LANGFUSE_SECRET_KEY: "sk-lf-FAKE-789", LANGFUSE_PUBLIC_KEY: "pk-lf-FAKE-012", LANGFUSE_BASE_URL: "https://fake-langfuse.example" };
const NAMES = Object.keys(SECRETS) as Array<keyof typeof SECRETS>;

async function withEnv(set: Partial<Record<keyof typeof SECRETS, string>>, fn: (url: string) => Promise<void>) {
  const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  for (const n of NAMES) delete process.env[n];
  Object.assign(process.env, set);
  const server = await startTestServer(buildTestDeps());
  try { await fn(server.baseUrl); } finally {
    await server.close();
    for (const n of NAMES) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; }
  }
}
const get = (url: string, key: string | null) => fetch(`${url}/setup/status`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });

test("all configured: exact shape, literal booleans, no secret text anywhere in the body or headers", async () => {
  await withEnv(SECRETS, async (url) => {
    const res = await get(url, "good-ask-key");
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(text), { configured: { gemini: true, webSearch: true, langfuse: true } });
    for (const v of Object.values(SECRETS)) assert.ok(!text.includes(v) && !JSON.stringify([...res.headers]).includes(v), `leaked ${v}`);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  });
});

test("nothing configured: all false; blank/whitespace values count as not configured", async () => {
  await withEnv({}, async (url) => {
    assert.deepEqual(await (await get(url, "good-ask-key")).json(), { configured: { gemini: false, webSearch: false, langfuse: false } });
  });
  await withEnv({ GEMINI_API_KEY: "   ", TAVILY_API_KEY: "" }, async (url) => {
    assert.deepEqual(await (await get(url, "good-ask-key")).json(), { configured: { gemini: false, webSearch: false, langfuse: false } });
  });
});

test("langfuse needs all three variables; partial config is false", async () => {
  await withEnv({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" }, async (url) => {
    assert.equal(((await (await get(url, "good-ask-key")).json()) as { configured: { langfuse: boolean } }).configured.langfuse, false);
  });
});

test("authentication required: no key and a bad key get 401 with no configuration data", async () => {
  await withEnv(SECRETS, async (url) => {
    for (const key of [null, "nope"]) {
      const res = await get(url, key);
      assert.equal(res.status, 401);
      assert.equal(JSON.parse(await res.text()).configured, undefined);
    }
  });
});

test("source shape: mounted after requireAuth; reads only env presence, no request input", () => {
  const server = readFileSync(fileURLToPath(new URL("../server.ts", import.meta.url)), "utf8");
  assert.ok(server.indexOf("createSetupStatusRouter()") > server.indexOf("requireAuth(deps.keyStore"));
  const route = readFileSync(fileURLToPath(new URL("./setup-status.ts", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(route, /req\.(query|body|params|headers)/);
});

test("[C5] webSearch follows GEMINI_API_KEY alone (Gemini grounded web fallback); a Tavily key no longer counts", async () => {
  await withEnv({ GEMINI_API_KEY: SECRETS.GEMINI_API_KEY }, async (url) => {
    assert.deepEqual(await (await get(url, "good-ask-key")).json(), { configured: { gemini: true, webSearch: true, langfuse: false } });
  });
  await withEnv({ TAVILY_API_KEY: SECRETS.TAVILY_API_KEY }, async (url) => {
    const body = await (await get(url, "good-ask-key")).json() as { configured: Record<string, boolean> };
    assert.equal(body.configured.webSearch, false);
    assert.equal("tavily" in body.configured, false);
  });
});
