import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FileJobQueue } from "./file-job-queue.js";
import { canonicalQueuePayload } from "./queue-payload.js";
import { QUEUE_FILE } from "./queue-store.js";
import { MemQueueFs, seeded } from "./mem-queue-fs.testkit.js";
import type { QueueJob } from "./queue-types.js";

function setup() { const fs = new MemQueueFs(); const clock = { t: 1000 }; return { fs, clock, q: new FileJobQueue({ dir: "/q", now: () => clock.t, leaseMs: 100, fs }) }; }
const raw = (fs: MemQueueFs) => fs.files.get(`/q/${QUEUE_FILE}`);
const code = (r: unknown) => (r as any).error?.code;

test("ISS-JOBQUEUE-001 D-015: the ledger row's own recorded reproduction, replayed verbatim, no longer reports success", () => {
  const row = readFileSync(fileURLToPath(new URL("../../../../qa/issues.jobqueue.jsonl", import.meta.url)), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).find(r => r.id === "ISS-JOBQUEUE-001");
  assert.ok(row, "ledger row present");
  const calls = [...String(row.evidence).matchAll(/q\.enqueue\((\{[^}]*\})\)/g)].map(m => new Function(`return (${m[1]})`)() as any);
  assert.equal(calls.length, 2, "the row records two enqueue calls");
  const { q, fs } = setup();
  const results = calls.map(c => q.enqueue(c));
  assert.deepEqual(results[0], { ok: true, value: "enqueued" });
  const after1 = raw(fs);
  assert.equal(results[1]!.ok, false, "second enqueue (other tenant) must not be ok");
  assert.equal(code(results[1]), "id-conflict");
  assert.equal(raw(fs), after1, "refusal writes nothing");
  // the row's third claim: tenant tb never has a job and must not be told it is queued
  assert.deepEqual(q.claim("w", { tenantId: calls[1].tenantId }), { ok: true, value: null });
  console.log(`ISS-JOBQUEUE-001: ${calls.length}/${calls.length} recorded enqueue reproductions behave per contract (+ claim for tb returns null)`);
});
test("same id, same tenant: equal payload is idempotent 'exists'; different payload is payload-mismatch; stored job never overwritten", () => {
  const { q, fs } = setup();
  q.enqueue({ id: "j", tenantId: "ta", payload: { a: 1, b: [1, 2], c: { x: 1, y: 2 } } });
  const before = raw(fs);
  assert.deepEqual(q.enqueue({ id: "j", tenantId: "ta", payload: { c: { y: 2, x: 1 }, b: [1, 2], a: 1 } }), { ok: true, value: "exists" }, "key order is irrelevant");
  for (const p of [{ a: 1, b: [2, 1], c: { x: 1, y: 2 } }, { a: 2, b: [1, 2], c: { x: 1, y: 2 } }, null, 1, "x", { a: 1 }]) assert.equal(code(q.enqueue({ id: "j", tenantId: "ta", payload: p })), "payload-mismatch", JSON.stringify(p));
  assert.equal(raw(fs), before);
});
test("canonical payload: sorted keys recursively, arrays ordered, undefined/NaN follow JSON", () => {
  assert.equal(canonicalQueuePayload({ b: 1, a: { d: 1, c: 2 } }), canonicalQueuePayload({ a: { c: 2, d: 1 }, b: 1 }));
  assert.notEqual(canonicalQueuePayload([1, 2]), canonicalQueuePayload([2, 1]));
  assert.equal(canonicalQueuePayload([{ b: 1, a: [{ y: 1, x: 2 }] }]), canonicalQueuePayload([{ a: [{ x: 2, y: 1 }], b: 1 }]), "key order inside arrays");
  assert.notEqual(canonicalQueuePayload({ a: "1" }), canonicalQueuePayload({ a: 1 }));
  assert.notEqual(canonicalQueuePayload({ a: null }), canonicalQueuePayload({}));
});
test("id-conflict is the same fixed answer for every state of the other tenant's job", () => {
  const { q, fs } = setup();
  const answers = new Set<string>();
  for (const step of ["ready", "leased", "done", "dead"]) {
    const id = `j-${step}`; q.enqueue({ id, tenantId: "ta", payload: { secret: step }, maxAttempts: 1 });
    if (step !== "ready") { const j = q.claim("w1", { tenantId: "ta" }) as any; const ref = { id, workerId: "w1", attempt: j.value.attempt, tenantId: "ta" };
      if (step === "done") q.complete(ref); if (step === "dead") q.fail(ref, "x"); }
    const before = raw(fs);
    answers.add(JSON.stringify(q.enqueue({ id, tenantId: "tb", payload: { secret: step }, maxAttempts: 5 })));
    assert.equal(raw(fs), before);
  }
  assert.equal(answers.size, 1, [...answers].join("|"));
  assert.ok(![...answers][0]!.includes("secret"));
});
test("ref with a tenant: the owner works, another tenant gets not-found (same as a missing job) and nothing is written; a missing/empty tenant is refused", () => {
  const { q, fs } = setup();
  q.enqueue({ id: "a", tenantId: "ta", payload: 1 }); const j = (q.claim("w1", { tenantId: "ta" }) as any).value as QueueJob;
  const ref = { id: "a", workerId: "w1", attempt: j.attempt, tenantId: "ta" }; const before = raw(fs);
  const missing = q.complete({ id: "nope", workerId: "w1", attempt: 1, tenantId: "tb" });
  for (const op of [(r: any) => q.heartbeat(r), (r: any) => q.complete(r), (r: any) => q.fail(r, "x")]) {
    const r = op({ ...ref, tenantId: "tb" });
    assert.equal(code(r), "not-found"); assert.equal(raw(fs), before);
    assert.deepEqual(r, op({ id: "nope", workerId: "w1", attempt: 1, tenantId: "tb" }), "indistinguishable from a missing job");
  }
  assert.equal(code(missing), "not-found");
  assert.equal(code(q.heartbeat({ ...ref, tenantId: "../x" })), "invalid-input");
  assert.equal(q.heartbeat({ ...ref, tenantId: "ta" }).ok, true);
  { const { tenantId: _t, ...noTenant } = ref; assert.equal(code(q.heartbeat(noTenant as never)), "invalid-input"); } // ISS-JOBQTENANT-001 (was: omitted tenant matched any job)
  assert.equal(q.heartbeat(ref).ok, true);
  assert.equal(q.complete({ ...ref, tenantId: "ta" }).ok, true);
});

test("property: 1,000 seeded cases: tenant B learns nothing about tenant A's ids from any operation's result", () => {
  let refused = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const r = seeded(seed * 104729), pick = <T>(a: T[]) => a[Math.floor(r() * a.length)]!;
    const { q, fs, clock } = setup();
    const SECRET = `SECRET-${seed}`, ids = ["a1", "a2", "a3", "a4"];
    for (const id of ids) q.enqueue({ id, tenantId: "ta", payload: { [SECRET]: id, n: Math.floor(r() * 9) }, maxAttempts: 1 + Math.floor(r() * 3) });
    const refs: { id: string; workerId: string; attempt: number; tenantId: string }[] = [];
    for (let i = 0; i < 3 + Math.floor(r() * 6); i++) { // drive A's jobs into mixed states
      clock.t += Math.floor(r() * 150);
      const c = (q.claim(pick(["wa", "wb"]), { tenantId: "ta" }) as any).value as QueueJob | null;
      if (!c) continue; const ref = { id: c.id, workerId: c.workerId!, attempt: c.attempt, tenantId: "ta" }; refs.push(ref);
      const k = r(); if (k < 0.3) q.complete(ref); else if (k < 0.6) q.fail(ref, "e");
    }
    const conflict = JSON.stringify({ ok: false, error: { code: "id-conflict", message: "job id is not available" } });
    const absent = (op: string, ref: any) => op === "h" ? q.heartbeat({ ...ref, id: "missing", tenantId: "tb" }) : op === "c" ? q.complete({ ...ref, id: "missing", tenantId: "tb" }) : q.fail({ ...ref, id: "missing", tenantId: "tb" }, "e");
    for (let i = 0; i < 12; i++) {
      const before = raw(fs); const k = r(); let res: unknown;
      if (k < 0.35) { res = q.enqueue({ id: pick(ids), tenantId: "tb", payload: r() < 0.5 ? { [SECRET]: "a1" } : r(), maxAttempts: 1 + Math.floor(r() * 5) }); assert.equal(JSON.stringify(res), conflict); }
      else if (k < 0.55) { res = q.claim(pick(["wb", "wc"]), { tenantId: "tb" }); assert.deepEqual(res, { ok: true, value: null }); }
      else {
        const base = refs.length ? pick(refs) : { id: pick(ids), workerId: "wa", attempt: 1 }; const op = pick(["h", "c", "f"]);
        const tref = { ...base, tenantId: "tb" };
        res = op === "h" ? q.heartbeat(tref) : op === "c" ? q.complete(tref) : q.fail(tref, "e");
        assert.deepEqual(res, absent(op, base), "A's job answers exactly like a missing one");
      }
      refused++;
      assert.equal(raw(fs), before, "B's calls never change A's data");
      assert.ok(!JSON.stringify(res).includes(SECRET) && !/"ta"|"wa"|leaseExpiresAt|payload/.test(JSON.stringify(res)), `result leaks: ${JSON.stringify(res)}`);
    }
  }
  assert.ok(refused >= 12000);
});
