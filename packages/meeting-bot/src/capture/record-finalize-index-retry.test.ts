/** Live 2026-11-27: the --index child failed once (cause lost with inherited stdio) and nobody retried.
 * The index step now keeps a durable index.log in the session dir and retries a bounded number of times. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processRecordingArtifacts, redactSecrets } from "./record-finalize.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ARGV = ["--process-video", "--transcribe", "--index"];

function withSession(fn: (sessionId: string, dir: string) => void): void {
  const sessionId = `idx-retry-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(root, "data", "toc-migrated", sessionId);
  mkdirSync(dir, { recursive: true });
  try { fn(sessionId, dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const isSync = (args: readonly string[]) => args[0]!.endsWith("sync-session.mjs");
const state = (dir: string) => JSON.parse(readFileSync(path.join(dir, "pipeline-state.json"), "utf8"));

test("index retry: first attempt exits 1, second exits 0 -> two calls, no throw, backoff slept once", () => {
  withSession((sessionId, dir) => {
    let syncCalls = 0;
    const slept: number[] = [];
    const run = ((_c: string, args: readonly string[]) => {
      if (!isSync(args)) return { status: 0 };
      syncCalls += 1;
      return syncCalls === 1 ? { status: 1, stdout: "", stderr: "LLM 503 transient\n" } : { status: 0, stdout: "indexed ok\n", stderr: "" };
    }) as never;
    // index-proof validation is a separate concern (needs a real proof); a failure there is not what this test checks.
    try { processRecordingArtifacts("x.webm", sessionId, ARGV, run, { backoffMs: [30_000, 90_000], sleep: ms => slept.push(ms) }); } catch (e) {
      assert.match(String(e), /index proof|proof/i, "only the proof validation may throw here, never the index child");
    }
    assert.equal(syncCalls, 2);
    assert.deepEqual(slept, [30_000]);
    const log = readFileSync(path.join(dir, "index.log"), "utf8");
    assert.match(log, /LLM 503 transient/);
    assert.match(log, /indexed ok/);
  });
});

test("index retry: every attempt fails -> throws after 3 calls with index.log path in the message, state failed", () => {
  withSession((sessionId, dir) => {
    let syncCalls = 0;
    const slept: number[] = [];
    const run = ((_c: string, args: readonly string[]) => {
      if (!isSync(args)) return { status: 0 };
      syncCalls += 1;
      return { status: 1, stdout: `out ${syncCalls}\n`, stderr: `err ${syncCalls}\n` };
    }) as never;
    assert.throws(() => processRecordingArtifacts("x.webm", sessionId, ARGV, run, { backoffMs: [30_000, 90_000], sleep: ms => slept.push(ms) }),
      (e: Error) => /knowledge indexing failed/.test(e.message) && e.message.includes("index.log") && e.message.includes(sessionId));
    assert.equal(syncCalls, 3);
    assert.deepEqual(slept, [30_000, 90_000]);
    assert.equal(state(dir).status, "failed");
    assert.match(state(dir).error, /index\.log/);
    const log = readFileSync(path.join(dir, "index.log"), "utf8");
    for (const n of [1, 2, 3]) { assert.match(log, new RegExp(`out ${n}`)); assert.match(log, new RegExp(`err ${n}`)); }
  });
});

test("index log: child is spawned with piped output (so it can be teed), never discarded", () => {
  withSession((sessionId) => {
    let opts: Record<string, unknown> | undefined;
    const run = ((_c: string, args: readonly string[], o: Record<string, unknown>) => { if (isSync(args)) opts = o; return { status: isSync(args) ? 1 : 0 }; }) as never;
    assert.throws(() => processRecordingArtifacts("x.webm", sessionId, ARGV, run, { backoffMs: [0, 0], sleep: () => {} }));
    assert.deepEqual(opts!.stdio, ["ignore", "pipe", "pipe"]);
  });
});

test("index log: credentials are redacted and only the last ~200 KB is kept", () => {
  withSession((sessionId, dir) => {
    const big = "x".repeat(300 * 1024);
    const run = ((_c: string, args: readonly string[]) => isSync(args)
      ? { status: 1, stdout: big, stderr: "connect mongodb+srv://admin:s3cret@host.example/db failed; Authorization: Bearer abc.def.ghi TAILMARK\n" }
      : { status: 0 }) as never;
    assert.throws(() => processRecordingArtifacts("x.webm", sessionId, ARGV, run, { backoffMs: [0, 0], sleep: () => {} }));
    const file = path.join(dir, "index.log");
    assert.ok(existsSync(file));
    const log = readFileSync(file, "utf8");
    assert.ok(statSync(file).size <= 200 * 1024 + 1024, `size ${statSync(file).size}`);
    assert.ok(!log.includes("s3cret") && !log.includes("abc.def.ghi"), "secrets must not reach the log");
    assert.match(log, /mongodb\+srv:\/\/\*\*\*@host\.example/);
    assert.match(log, /TAILMARK/);
  });
});

test("redactSecrets: URL userinfo, bearer tokens and key=value secrets", () => {
  assert.equal(redactSecrets("mongodb://u:p%40ss@h:27017/db"), "mongodb://***@h:27017/db");
  assert.equal(redactSecrets("https://user@host/x"), "https://***@host/x");
  assert.equal(redactSecrets("Authorization: Bearer abc123"), "Authorization: Bearer ***");
  assert.equal(redactSecrets("GEMINI_API_KEY=AIzaSyABC123 ok"), "GEMINI_API_KEY=*** ok");
  assert.equal(redactSecrets("no secrets here, https://example.com/a?b=c"), "no secrets here, https://example.com/a?b=c");
});

test("redactSecrets: review 2026-11-27 leak corpus (quoted/JSON keys, headers, query keys, bare token shapes)", () => {
  const cases: Array<[string, string]> = [
    ['{"apiKey":"sk-ant-AAAA1234"}', "sk-ant-AAAA1234"],
    ['{"apiKey": "sk-ant-abc12345"}', "sk-ant-abc12345"],
    ['OPENAI_API_KEY="sk-proj-abc12345"', "sk-proj-abc12345"],
    ['password: "hunter2"', "hunter2"],
    ['{"password":"hunter2"}', "hunter2"],
    ['{"refresh_token":"1//abcdefghijklmnopqrstuvwxyz"}', "1//abcdefghijklmnopqrstuvwxyz"],
    ["x-api-key: abc123secret", "abc123secret"],
    ["x-goog-api-key: AIzaSyDUMMY1234567890abcdefgh", "AIzaSyDUMMY1234567890abcdefgh"],
    ["POST https://generativelanguage.googleapis.com/v1/models/x:generateContent?key=AIzaSyDUMMY123", "AIzaSyDUMMY123"],
    ["Authorization: Basic dXNlcjpwYXNz", "dXNlcjpwYXNz"],
    ["failed with sk-ant-api03-XYZXYZXYZXYZ in it", "sk-ant-api03-XYZXYZXYZXYZ"],
    ['api_key="abc999"', "abc999"],
    ['token = "tok999"', "tok999"],
    ["mongodb://u:p@ss@h/db", "p@ss"],
    ["mongodb://u:pa/ss@h/db", "pa/ss"],
  ];
  for (const [input, secret] of cases) assert.ok(!redactSecrets(input).includes(secret), `leaked ${secret} from ${input} -> ${redactSecrets(input)}`);
  // over-redaction guard: the next query parameter survives
  assert.match(redactSecrets("access_token=ya29.abc&x=1"), /&x=1$/);
  assert.ok(!redactSecrets("access_token=ya29.abc&x=1").includes("ya29.abc"));
});
