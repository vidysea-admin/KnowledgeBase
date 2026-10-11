import { test } from "node:test";
import assert from "node:assert/strict";
import type { TraceRecord } from "../trace.js";
import { toLangfuseBatch, validateBaseUrl } from "./payload.js";

const rec = (o: Partial<TraceRecord> = {}): TraceRecord => ({
  operation: "complete", jobKind: "extract", provider: "gemini", model: "gemini-3.8-flash",
  startedAtMs: 1_760_000_000_000, latencyMs: 1500, inputChars: 1200, outputChars: 800,
  inputTokens: 300, outputTokens: 200, costUsd: 0.0123, retries: 1, outcome: "ok", errorClass: null,
  correlationId: "run-42", tenantId: "tenant-7", ...o,
});
let n = 0;
const gen = (): string => `id${++n}`;

// Allow-list of keys by path. "*" marks a level whose own keys are checked, children listed below.
const ALLOWED: Record<string, string[]> = {
  "": ["batch"],
  "batch[]": ["id", "type", "timestamp", "body"],
  "batch[].body": ["id", "name", "timestamp", "sessionId", "metadata", "traceId", "startTime", "endTime", "level", "model", "statusMessage", "usageDetails", "costDetails"],
  "batch[].body.metadata": ["tenantId", "operation", "provider", "jobKind", "outcome", "errorClass", "inputChars", "outputChars", "retries"],
  "batch[].body.usageDetails": ["input", "output"],
  "batch[].body.costDetails": ["total"],
};
function walk(v: unknown, path: string, seen: string[]): void {
  if (Array.isArray(v)) return v.forEach((x) => walk(x, `${path}[]`, seen));
  if (v === null || typeof v !== "object") return;
  const allowed = ALLOWED[path];
  assert.ok(allowed, `unexpected nested object at "${path}"`);
  for (const [k, c] of Object.entries(v)) {
    assert.ok(allowed.includes(k), `key "${k}" not allowed at "${path}"`);
    seen.push(`${path}.${k}`);
    walk(c, path === "" ? k === "batch" ? "batch" : k : `${path}.${k}`, seen);
  }
}
const check = (b: unknown): string[] => {
  const seen: string[] = [];
  walk(b, "", seen);
  return seen;
};

test("payload: a normal record maps to trace + generation with only allow-listed keys", () => {
  const b = toLangfuseBatch([rec()], gen);
  check(b);
  assert.equal(b.batch.length, 2);
  assert.deepEqual(b.batch.map((e) => e.type), ["trace-create", "generation-create"]);
  const g = b.batch[1]!.body as Record<string, any>;
  assert.equal(g.model, "gemini-3.8-flash");
  assert.deepEqual(g.usageDetails, { input: 300, output: 200 });
  assert.deepEqual(g.costDetails, { total: 0.0123 });
  assert.equal(g.level, "DEFAULT");
  assert.equal(g.endTime, new Date(1_760_000_001_500).toISOString());
  assert.equal(g.traceId, (b.batch[0]!.body as any).id);
  assert.equal((b.batch[0]!.body as any).sessionId, "run-42");
  assert.equal((b.batch[0]!.body as any).metadata.tenantId, "tenant-7");
});

test("payload: error record carries the error CLASS as statusMessage, level ERROR", () => {
  const b = toLangfuseBatch([rec({ outcome: "error", errorClass: "TimeoutError", outputChars: null, costUsd: null })], gen);
  check(b);
  const g = b.batch[1]!.body as Record<string, any>;
  assert.equal(g.level, "ERROR");
  assert.equal(g.statusMessage, "TimeoutError");
});

const FORBIDDEN = [
  "SECRET PROMPT TEXT", "completion text here", "AIzaSyDEADBEEFDEADBEEFDEADBEEF12345", "sk-lf-1234567890abcdef",
  "C:\\Users\\bob\\secret.txt", "/home/bob/secret.txt", "bob@example.com", "passcode 482913", "Bearer abc.def",
];
const PLANT = ["jobKind", "provider", "model", "errorClass", "correlationId", "tenantId", "operation", "outcome"] as const;
const NEEDLES = ["secret prompt", "completion text", "aizasy", "sk-lf", "bob", "secret.txt", "example.com", "482913", "bearer"];

test("payload: forbidden substrings planted in every free-text field never reach the body", () => {
  for (const field of PLANT) {
    for (const bad of FORBIDDEN) {
      const b = toLangfuseBatch([rec({ outcome: "error", errorClass: "E", [field]: bad } as Partial<TraceRecord>)], gen);
      check(b);
      const text = JSON.stringify(b).toLowerCase();
      for (const needle of NEEDLES) assert.ok(!text.includes(needle), `${field}=${bad} leaked "${needle}"`);
    }
  }
});

test("payload: unknown extra properties on a record (prompt, text, headers, path, apiKey) are never copied", () => {
  const hostile = {
    ...rec(), prompt: "SECRET PROMPT TEXT", completion: "completion text here", text: "t", headers: { authorization: "Bearer zzz" },
    path: "C:\\Users\\bob\\x", apiKey: "AIzaSyDEADBEEFDEADBEEFDEADBEEF12345", email: "bob@example.com", errorMessage: "passcode 482913",
  } as unknown as TraceRecord;
  const b = toLangfuseBatch([hostile], gen);
  check(b);
  const text = JSON.stringify(b).toLowerCase();
  for (const needle of NEEDLES) assert.ok(!text.includes(needle), `leaked "${needle}"`);
});

test("payload: hostile numbers (NaN, negative, Infinity, strings) are omitted, never forwarded", () => {
  const b = toLangfuseBatch([rec({ inputTokens: NaN, outputTokens: -5, costUsd: Infinity, inputChars: "9" as never, latencyMs: -1, startedAtMs: NaN })], gen);
  check(b);
  const g = b.batch[1]!.body as Record<string, any>;
  assert.equal(g.usageDetails, undefined);
  assert.equal(g.costDetails, undefined);
  assert.equal(g.metadata.inputChars, undefined);
  assert.equal(g.startTime, "1970-01-01T00:00:00.000Z");
});

test("payload: a record that throws while being mapped is skipped, not forwarded", () => {
  const evil = new Proxy(rec(), { get() { throw new Error("boom SECRET"); } });
  const b = toLangfuseBatch([evil, rec()], gen);
  assert.equal(b.batch.length, 2);
  assert.ok(!JSON.stringify(b).includes("SECRET"));
});

test("validateBaseUrl: table", () => {
  const ok: Array<[string, string]> = [
    ["https://langfuse.example.com", "https://langfuse.example.com"],
    ["https://langfuse.example.com/", "https://langfuse.example.com"],
    ["https://lf.example.com/prefix/", "https://lf.example.com/prefix"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:3000/", "http://127.0.0.1:3000"],
    ["http://[::1]:3000", "http://[::1]:3000"],
  ];
  for (const [i, o] of ok) assert.equal(validateBaseUrl(i), o, i);
  const bad: unknown[] = [
    "http://langfuse.example.com", "http://10.0.0.5:3000", "http://localhost.evil.com", "ftp://localhost",
    "https://user:pw@lf.example.com", "https://user@lf.example.com", "https://lf.example.com?x=1", "https://lf.example.com/?",
    "https://lf.example.com#frag", "not a url", "", "   ", "//lf.example.com", "javascript:alert(1)", undefined, null, 42,
  ];
  for (const i of bad) assert.throws(() => validateBaseUrl(i), /invalid Langfuse base URL/, String(i));
});

test("validateBaseUrl: the error never echoes the input (it may carry a password)", () => {
  try {
    validateBaseUrl("https://admin:hunter2@lf.example.com");
    assert.fail("should throw");
  } catch (e) {
    assert.ok(!String((e as Error).message).includes("hunter2"));
  }
});
