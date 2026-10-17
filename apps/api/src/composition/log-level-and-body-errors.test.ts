/**
 * apps/api/src/composition/log-level-and-body-errors.test.ts — fix cycle 1.
 * ISS-APILOGGER-003: both branches of the test-mode default level (env injected, independent of how node --test sets it).
 * ISS-APILOGGER-001: body-parser errors log structured without the body, and answer byte-for-byte like Express's
 * production-mode final handler (BASELINE_* literals were captured from the unchanged code at HEAD dc91bc6).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogger, resolveLevel } from "./logger.js";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps } from "../fixtures.js";

function linesFor(env: Record<string, string | undefined>): string[] {
  const lines: string[] = [];
  const log = createLogger({ env, write: (l) => lines.push(l) });
  log.debug("d"); log.info("i"); log.warn("w"); log.error("e");
  return lines.map((l) => (JSON.parse(l) as { level: string }).level);
}

test("level default: LOG_LEVEL unset and NODE_TEST_CONTEXT unset -> info (production writes info/warn/error)", () => {
  assert.equal(resolveLevel(undefined, {}), "info");
  assert.equal(resolveLevel("", {}), "info");
  assert.equal(resolveLevel("   ", { NODE_ENV: "production" }), "info");
  assert.deepEqual(linesFor({}), ["info", "warn", "error"]);
  assert.deepEqual(linesFor({ NODE_ENV: "production" }), ["info", "warn", "error"]);
});

test("level default: LOG_LEVEL unset and NODE_TEST_CONTEXT set -> silent", () => {
  assert.equal(resolveLevel(undefined, { NODE_TEST_CONTEXT: "child-v8" }), "silent");
  assert.equal(resolveLevel("", { NODE_TEST_CONTEXT: "1" }), "silent");
  assert.deepEqual(linesFor({ NODE_TEST_CONTEXT: "child-v8" }), []);
});

test("level default: an explicit LOG_LEVEL wins with and without NODE_TEST_CONTEXT", () => {
  for (const ctx of [undefined, "child-v8"]) {
    const env = { NODE_TEST_CONTEXT: ctx };
    assert.equal(resolveLevel("info", env), "info");
    assert.equal(resolveLevel("debug", env), "debug");
    assert.equal(resolveLevel("silent", env), "silent");
    assert.deepEqual(linesFor({ ...env, LOG_LEVEL: "info" }), ["info", "warn", "error"]);
    assert.deepEqual(linesFor({ ...env, LOG_LEVEL: "debug" }), ["debug", "info", "warn", "error"]);
    assert.deepEqual(linesFor({ ...env, LOG_LEVEL: "error" }), ["error"]);
    assert.deepEqual(linesFor({ ...env, LOG_LEVEL: "silent" }), []);
  }
});

const page = (msg: string) => `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>${msg}</pre>\n</body>\n</html>\n`;
// Captured from the code at HEAD (production mode): status, selected headers, body.
const BASELINE_400 = { status: 400, length: "138", body: page("Bad Request") };
const BASELINE_413 = { status: 413, length: "144", body: page("Payload Too Large") };
const SECRET = "ZZSECRETZZ";
const CASES: Array<[string, string, typeof BASELINE_400]> = [
  ["raw body (checker reproduction)", SECRET, BASELINE_400],
  ["truncated JSON with secret", `{"password":"${SECRET}", oops`, BASELINE_400],
  ["not-json with secret", `{not json ${SECRET}-tail`, BASELINE_400],
  ["too large", "x".repeat(1_100_000), BASELINE_413], // over server.ts express.json limit (1mb)
];

async function post(base: string, body: string) {
  const r = await fetch(`${base}/ask`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer good-ask-key" }, body });
  return { status: r.status, text: await r.text(), h: r.headers };
}

for (const env of ["production", "development"]) {
  test(`body-parser errors (NODE_ENV=${env}): response identical to the production baseline, secret absent from response, stdout log and stderr`, async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = env;
    const lines: string[] = [];
    const errs: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    const origErr = console.error;
    process.stderr.write = ((c: string | Uint8Array) => { errs.push(String(c)); return true; }) as typeof process.stderr.write;
    console.error = (...a: unknown[]) => { errs.push(a.map(String).join(" ")); };
    const server = await startTestServer(buildTestDeps({ logger: createLogger({ level: "debug", write: (l) => lines.push(l) }) }));
    try {
      for (const [name, body, base] of CASES) {
        const r = await post(server.baseUrl, body);
        assert.equal(r.status, base.status, name);
        assert.equal(r.text, base.body, name);
        assert.equal(r.h.get("content-length"), base.length, name);
        assert.equal(r.h.get("content-type"), "text/html; charset=utf-8", name);
        assert.equal(r.h.get("content-security-policy"), "default-src 'none'", name);
        assert.equal(r.h.get("x-content-type-options"), "nosniff", name);
        assert.ok(r.h.get("x-request-id"), name);
      }
      await new Promise((r) => setTimeout(r, 30));
    } finally {
      await server.close();
      process.stderr.write = origWrite;
      console.error = origErr;
      if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev;
    }
    const all = lines.join("") + errs.join("");
    assert.ok(!all.includes(SECRET), "secret must not reach stdout log or stderr");
    assert.ok(!all.includes("not valid JSON") && !all.includes("body-parser"), "no parser message or stack");
    const rejected = lines.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.msg === "request body rejected");
    assert.equal(rejected.length, CASES.length);
    assert.deepEqual(rejected.map((l) => l.errType), ["entity.parse.failed", "entity.parse.failed", "entity.parse.failed", "entity.too.large"]);
    assert.deepEqual(rejected.map((l) => l.status), [400, 400, 400, 413]);
    assert.ok(rejected.every((l) => l.level === "warn" && typeof l.requestId === "string" && !("err" in l)));
    assert.equal(errs.join("").trim(), "", "nothing unstructured on stderr");
  });
}
