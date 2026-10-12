import { test } from "node:test";
import assert from "node:assert/strict";
import { FileJobQueue } from "./file-job-queue.js";
import { QUEUE_FILE, decodeQueue } from "./queue-store.js";
import { MemQueueFs, SimulatedCrash } from "./mem-queue-fs.testkit.js";
import { MAX_QUEUE_ID_LENGTH, validateQueueId } from "./queue-types.js";

const BAD: unknown[] = [
  "", " ", "..", "../x", "x/..", "a/b", "a\\b", "C:", "C:\\x", "c:evil", "/abs", "\\\\server\\share", "CON", "con", "NUL.txt", "aux.json", "COM1", "lpt9", "Prn",
  "a..b", "a.", ".hidden", "-x", "a b", "a\0b", "x".repeat(MAX_QUEUE_ID_LENGTH + 1), "é", "a:b", "a*", "a?", "a<b", "a|b", "~", "%2e%2e", "a\nb", "a/", "\\", ".",
  42, null, undefined, {}, ["a"],
];
const GOOD = ["a", "job-1", "T1.v2", "x".repeat(MAX_QUEUE_ID_LENGTH), "COM10", "console", "a_b", "9"];

test("path-escape corpus (>= 25 ids) is refused for job, tenant and worker ids and the filesystem is never touched", () => {
  assert.ok(BAD.length >= 25);
  const fs = new MemQueueFs(); const q = new FileJobQueue({ dir: "/q", now: () => 5, fs });
  for (const id of BAD) {
    assert.equal(validateQueueId(id, "x")?.code, "invalid-input", JSON.stringify(id));
    assert.equal((q.enqueue({ id: id as string, tenantId: "t", payload: 1 }) as any).error.code, "invalid-input");
    assert.equal((q.enqueue({ id: "ok", tenantId: id as string, payload: 1 }) as any).error.code, "invalid-input");
    assert.equal((q.claim(id as string, { tenantId: "t" }) as any).error.code, "invalid-input");
    if (id !== undefined) assert.equal((q.claim("w", { tenantId: id as string }) as any).error.code, "invalid-input");
    assert.equal((q.heartbeat({ id: id as string, workerId: "w", attempt: 1, tenantId: "t" }) as any).error.code, "invalid-input");
    assert.equal((q.complete({ id: "ok", workerId: id as string, attempt: 1, tenantId: "t" }) as any).error.code, "invalid-input");
    assert.equal((q.fail({ id: "ok", workerId: "w", attempt: 1, tenantId: "t" }, id as string) as any).error.code, "invalid-input");
  }
  assert.equal(fs.calls, 0, "no filesystem call for a refused id");
  for (const id of GOOD) assert.equal(validateQueueId(id, "x"), null, id);
});
test("every path the queue touches stays directly inside its root", () => {
  const fs = new MemQueueFs(); const q = new FileJobQueue({ dir: "/q", now: () => 5, fs });
  for (const id of GOOD) q.enqueue({ id, tenantId: "t", payload: 1 });
  q.claim("w", { tenantId: "t" });
  for (const l of fs.log) { const p = l.split(" ")[1] ?? ""; assert.match(p, /^\/q(\/[^/]+)?$/, l); }
});

type Step = (q: FileJobQueue, ctx: { clock: { t: number } }) => unknown;
const SCRIPT: Step[] = [
  q => q.enqueue({ id: "a", tenantId: "t", payload: { n: 1 }, maxAttempts: 3 }),
  q => q.enqueue({ id: "b", tenantId: "u", payload: 2 }),
  q => q.claim("w1", { tenantId: "t" }),
  (q, c) => { c.clock.t = 110; return q.heartbeat({ id: "a", workerId: "w1", attempt: 1, tenantId: "t" }); },
  q => q.fail({ id: "a", workerId: "w1", attempt: 1, tenantId: "t" }, "boom"),
  (q, c) => { c.clock.t = 610; return q.claim("w2", { tenantId: "t" }); },
  q => q.claim("w3", { tenantId: "u" }),
  q => q.complete({ id: "b", workerId: "w3", attempt: 1, tenantId: "u" }),
  (q, c) => { c.clock.t = 1110; return q.claim("w4", { tenantId: "t" }); }, // a: attempt 2 expired nowhere yet -> reclaim path
  (q, c) => { c.clock.t = 1610; return q.claim("w5", { tenantId: "t" }); }, // a exhausted -> dead
];
function fresh() { const fs = new MemQueueFs(); const clock = { t: 100 }; const wall = { t: 5_000_000 }; fs.wall = () => wall.t; return { fs, clock, wall, q: new FileJobQueue({ dir: "/q", now: () => clock.t, leaseMs: 100, fs, wallNow: () => wall.t }) }; }
const rawOf = (fs: MemQueueFs) => fs.files.get(`/q/${QUEUE_FILE}`) ?? null;

test("crash at every fs call of every write step: the queue file is the old or the new version, never torn; nothing lost; retry converges", () => {
  // reference run: raw after each step, and fs call count per step
  const ref = fresh(); const raws: (string | null)[] = [null]; const counts: number[] = [];
  for (const s of SCRIPT) { ref.fs.calls = 0; s(ref.q, ref); counts.push(ref.fs.calls); raws.push(rawOf(ref.fs)); }
  let crashes = 0, lateCrashes = 0;
  for (let step = 0; step < SCRIPT.length; step++) for (const torn of [false, true]) for (let k = 0; k < (counts[step] ?? 0); k++) {
    const w = fresh();
    for (let i = 0; i < step; i++) SCRIPT[i]!(w.q, w);
    assert.equal(rawOf(w.fs), raws[step]);
    w.fs.calls = 0; w.fs.crashAt = k; w.fs.torn = torn;
    let r: any; try { r = SCRIPT[step]!(w.q, w); } catch (e) { assert.ok(e instanceof SimulatedCrash === false, "crash must surface as a typed error, not a throw"); }
    const crashed = r?.ok === false && r.error.code === "io-error"; if (crashed) crashes++;
    const after = rawOf(w.fs);
    assert.ok(after === raws[step] || after === raws[step + 1], `step ${step} k ${k}: queue file is neither old nor new`);
    if (after !== null) { const d = decodeQueue(after); assert.ok(d.ok, "queue file always decodes"); }
    if (crashed) assert.equal(after, raws[step], "a crash before the rename leaves the old file");
    if (!crashed) { assert.equal(after, raws[step + 1], `step ${step} k ${k}: crash after the commit (lock release) must leave the committed new version`); lateCrashes++; w.fs.restart(); continue; }
    // restart: same step again succeeds and reaches the reference state (temp debris ignored)
    w.fs.restart(); w.wall.t += 31_000; // the restarted process finds a dead holder's lock stale
    SCRIPT[step]!(w.q, w);
    assert.equal(rawOf(w.fs), raws[step + 1], `step ${step} k ${k}: retry did not converge`);
    const leftovers = [...w.fs.files.keys()].filter(p => p !== `/q/${QUEUE_FILE}`);
    assert.ok(leftovers.every(p => p.endsWith(".tmp")), `only .tmp debris (the lock is released or taken over and released): ${leftovers}`);
    if (!torn) assert.ok(leftovers.length === 0, `no debris after a non-torn crash (${leftovers})`);
  }
  assert.ok(crashes >= 20, `injected ${crashes} crashes`); assert.ok(lateCrashes >= 5, `crashes during lock release after the commit: ${lateCrashes}`);
});
test("a crash on the final rename leaves the old queue file and no temp file; a crash inside unlink cleanup leaves only a .tmp", () => {
  const w = fresh(); w.q.enqueue({ id: "a", tenantId: "t", payload: 1 });
  const before = rawOf(w.fs); w.fs.calls = 0; w.fs.log = [];
  w.fs.rename = () => { throw new SimulatedCrash(-1); }; w.fs.unlink = () => { throw new SimulatedCrash(-2); };
  const r = w.q.claim("w", { tenantId: "t" }) as any;
  assert.equal(r.error.code, "io-error"); assert.equal(rawOf(w.fs), before);
  assert.equal([...w.fs.files.keys()].filter(p => p.endsWith(".tmp")).length, 1);
});
