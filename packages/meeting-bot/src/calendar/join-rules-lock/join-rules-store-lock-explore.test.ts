/**
 * packages/meeting-bot/src/calendar/join-rules-store-lock-explore.test.ts — unit `t037-join-rules-stale-lock-takeover`, fix cycle 1.
 * Interleaving explorer: several actors run the REAL acquire / takeover / release generators (join-rules-store-lock-steps.ts), one yield at a
 * time, over an in-memory file system (exhaustive + seeded) or a real temp directory (directed plan + seeded subset). Injected clock and probe.
 * Invariants after EVERY step: at most one believer; a believer's token is in the lock file; the lock file exists from the start until the last
 * release (no gap); the data file is written only by the believer while it still owns the lock; no live lock and no foreign claim is ever
 * unlinked or renamed over; at the end no claim / temp / lock is left that nobody owns.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireSteps, releaseSteps, realFs, parseHolder, type LockFs, type Ctx } from "./join-rules-store-lock-steps.js";

const HOST = "h1", DEAD_PID = 424242, T0 = 1_760_000_000_000, STALE = 30000;
interface Backend { fs: LockFs; peek(p: string): string | null; list(): string[]; reset(seed: Record<string, string>): void }
function memBackend(): Backend {
  const m = new Map<string, string>(); let t = 0;
  const err = (code: string) => Object.assign(new Error(code), { code });
  return {
    peek: p => m.get(p) ?? null, list: () => [...m.keys()].sort(), reset: seed => { m.clear(); for (const [k, v] of Object.entries(seed)) m.set(k, v); },
    fs: {
      create: (p, d) => { if (m.has(p)) throw err("EEXIST"); m.set(p, d); }, read: p => m.get(p) ?? null,
      stat: p => { if (!m.has(p)) throw err("ENOENT"); return t++; },
      rename: (a, b) => { if (!m.has(a)) throw err("ENOENT"); m.set(b, m.get(a)!); m.delete(a); },
      unlink: p => { if (!m.has(p)) throw err("ENOENT"); m.delete(p); },
    },
  };
}
function dirBackend(dir: string): Backend {
  return {
    fs: realFs, peek: p => { try { return readFileSync(p, "utf8"); } catch { return null; } }, list: () => readdirSync(dir).map(f => path.join(dir, f)).sort(),
    reset: seed => { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir); for (const [k, v] of Object.entries(seed)) writeFileSync(k, v); },
  };
}

export interface Spec { frozen?: boolean; takers: number; holder: "dead" | "alive"; waitMs: number; aged: boolean; lying?: boolean; kill?: boolean; operator?: boolean }
interface Actor { sig: string; id: string; token: string; pid: number; gen: Generator<string>; done: boolean; killed: boolean; wins: number; kind: "taker" | "holder" | "operator" }
const tokOf = (raw: string | null) => (raw === null ? null : parseHolder(raw)?.token ?? null);

/** Builds a world for `spec` over `be`; returns the actors and a `check` run after every step. */
function build(spec: Spec, be: Backend, lockPath: string) {
  const clock = { t: T0 }, believers = new Set<string>(), violations: string[] = [], writes: string[] = [];
  const body = (token: string, pid: number, at: number) => JSON.stringify({ token, pid, host: HOST, at: new Date(at).toISOString() });
  const at0 = spec.aged ? T0 - 100000 : T0 - 1000;
  const holderTok = spec.holder === "dead" ? "dead-token" : "holder-token", holderPid = spec.holder === "dead" ? DEAD_PID : 555;
  be.reset({ [lockPath]: body(holderTok, holderPid, at0) });
  const actors: Actor[] = [];
  const isAlive = (pid: number) => (pid === DEAD_PID || (spec.lying && pid === 555) ? "dead" : "alive");
  const rec = <T,>(a: Actor, tag: string, f: () => T): T => { // each actor's observations: its behaviour is a function of them (state key for the exhaustive search)
    try { const r = f(); a.sig += `${tag}:${r === null ? "n" : r === undefined ? "ok" : String(r)};`; return r; } catch (e: any) { a.sig += `${tag}!${e?.code};`; throw e; }
  };
  const mkFs = (self: () => Actor): LockFs => ({
    create: (p, d) => rec(self(), "c", () => be.fs.create(p, d)), read: p => rec(self(), "r", () => be.fs.read(p)), stat: p => rec(self(), "s", () => { be.fs.stat(p); }) as any,
    unlink(p) {
      const cur = tokOf(be.peek(p)), a = self();
      if (p === lockPath && cur !== null && believers.has(cur) && cur !== a.token) violations.push(`${a.id} unlinked the LIVE lock of ${cur}`);
      if (p !== lockPath && cur !== a.token) violations.push(`${a.id} unlinked a foreign claim ${p}`);
      rec(a, "u", () => be.fs.unlink(p));
    },
    rename(from, to) {
      const cur = tokOf(be.peek(to)), a = self();
      if (to === lockPath && cur !== null && believers.has(cur) && cur !== a.token) violations.push(`${a.id} renamed over the LIVE lock of ${cur}`);
      if (tokOf(be.peek(from)) !== a.token) violations.push(`${a.id} renamed a foreign file ${from}`);
      rec(a, "m", () => be.fs.rename(from, to));
    },
  });
  const ctxFor = (a: () => Actor, token: string, pid: number): Ctx => ({ fs: mkFs(a), waitMs: spec.waitMs, staleMs: STALE, now: () => clock.t, host: HOST, pid, token, isAlive });
  const phase2 = function* (a: Actor, ctx: Ctx): Generator<string> { // what a holder does with the lock: ownership check, data write, release
    yield "owns"; const owns = tokOf(be.peek(lockPath)) === a.token; a.sig += `o${owns};`;
    yield "write"; a.sig += `w${tokOf(be.peek(lockPath))};`; if (owns) writes.push(`${a.id}|${tokOf(be.peek(lockPath))}|${[...believers].join(",")}`);
    yield* releaseSteps(lockPath, a.token, ctx.fs); believers.delete(a.token); a.wins++;
  };
  for (let i = 0; i < spec.takers; i++) {
    const a: Actor = { sig: "", id: `T${i}`, token: `tok-t${i}`, pid: 1000 + i, gen: null as any, done: false, killed: false, wins: 0, kind: "taker" };
    const ctx = ctxFor(() => a, a.token, a.pid);
    a.gen = (function* () {
      try { yield* acquireSteps(lockPath, ctx); } catch { return; }
      believers.add(a.token); yield* phase2(a, ctx);
    })();
    actors.push(a);
  }
  if (spec.holder === "alive") { // the original holder, slow: still working, then its late save and release
    const h: Actor = { sig: "", id: "H", token: holderTok, pid: 555, gen: null as any, done: false, killed: false, wins: 0, kind: "holder" };
    believers.add(holderTok); h.gen = phase2(h, ctxFor(() => h, holderTok, 555)); actors.push(h);
  }
  if (spec.operator) { // an operator deleting the lock by hand mid-takeover (documented residual; measured, not asserted)
    const o: Actor = { sig: "", id: "OP", token: "operator", pid: 1, gen: null as any, done: false, killed: false, wins: 0, kind: "operator" };
    o.gen = (function* () { yield "operator-delete"; try { be.fs.unlink(lockPath); } catch { /* gone */ } })(); actors.push(o);
  }
  const check = (everBeliever: boolean) => {
    const cur = tokOf(be.peek(lockPath));
    if (believers.size > 1) violations.push(`two believers ${[...believers]}`);
    if (!spec.operator) {
      if (believers.size === 1 && cur !== [...believers][0]) violations.push(`believer ${[...believers][0]} lost the lock (file holds ${cur})`);
      if (!everBeliever && be.peek(lockPath) === null) violations.push("lock file missing before any holder released");
    }
  };
  const finish = () => {
    for (const w of writes) { const [id, lockTok, bel] = w.split("|") as [string, string, string]; if (!bel.split(",").includes(lockTok) || lockTok !== (actors.find(x => x.id === id)!.token)) violations.push(`write without the lock: ${w}`); }
    if (!spec.kill && !spec.operator && spec.holder === "dead" && !actors.some(a => a.wins > 0)) violations.push("no contender recovered the dead lock");
    const left = be.list().filter(f => !actors.some(a => a.killed && a.kind === "taker") || !f.includes(".claim."));
    if (!spec.kill && !spec.operator && left.length) violations.push(`left behind: ${left.map(f => path.basename(f))}`);
  };
  const key = () => JSON.stringify([be.list().map(f => [f, be.peek(f)]), actors.map(a => [a.sig, a.done, a.killed, a.wins]), [...believers], writes, violations.length]);
  return { actors, clock, violations, check, finish, key, steps: 0, ever: false };
}

type World = ReturnType<typeof build>;
const runnableOf = (w: World) => w.actors.map((a, i) => (a.done || a.killed ? -1 : i)).filter(i => i >= 0);
function advance(w: World, spec: Spec, a: Actor) {
  const r = a.gen.next(); a.sig += "|"; w.steps++; w.clock.t += spec.frozen ? 0 : 1;
  if (r.done) a.done = true; else if (r.value.startsWith("nap:")) w.clock.t += Number(r.value.slice(4));
  if (w.actors.some(x => x.kind === "taker" && x.wins > 0)) w.ever = true;
  w.check(w.ever || w.actors.some(x => x.kind !== "operator" && x.wins > 0));
}
type Pick = (runnable: number[], depth: number) => number;
/** One complete run. `pick` chooses the index (into `runnable`) to advance. Returns the violations. */
function run(spec: Spec, be: Backend, lockPath: string, pick: Pick, rnd?: () => number): { violations: string[]; steps: number } {
  const w = build(spec, be, lockPath);
  for (;;) {
    const runnable = runnableOf(w);
    if (!runnable.length || w.steps > 400) break;
    const a = w.actors[runnable[pick(runnable, w.steps)]!]!;
    if (spec.kill && a.kind === "taker" && !w.ever && rnd && rnd() < 0.04) { a.killed = true; continue; }
    advance(w, spec, a);
  }
  if (w.steps > 400) w.violations.push("did not terminate");
  w.finish();
  return { violations: w.violations, steps: w.steps };
}

/**
 * EVERY schedule, by depth-first search over the reachable STATES with replay (the generators cannot be cloned). A state is the file
 * contents + each actor's observation history + who holds what; two prefixes reaching one state have identical futures, so the number of
 * complete orderings below a state is counted once (`orderings` = exact count of distinct full schedules, as plain enumeration would give).
 */
function exhaustive(spec: Spec, be: Backend, lockPath: string, useMemo = true) {
  const memo = new Map<string, number>(), bad: string[] = []; let maxSteps = 0;
  const visit = (prefix: number[]): number => {
    const w = build(spec, be, lockPath);
    for (const i of prefix) advance(w, spec, w.actors[i]!);
    maxSteps = Math.max(maxSteps, w.steps);
    if (w.violations.length) { if (bad.length < 5) bad.push(`${prefix} -> ${w.violations[0]}`); return 1; }
    const k = w.key(), hit = useMemo ? memo.get(k) : undefined; if (hit !== undefined) return hit;
    const next = runnableOf(w); let n = 0;
    if (!next.length) { w.finish(); if (w.violations.length && bad.length < 5) bad.push(`${prefix} -> ${w.violations[0]}`); n = 1; }
    else for (const i of next) n += visit([...prefix, i]);
    memo.set(k, n); return n;
  };
  const orderings = visit([]);
  return { orderings, states: memo.size, maxSteps, bad };
}
const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function seeded(spec: Spec, be: Backend, lockPath: string, seed: number, n: number) {
  let v = 0, steps = 0; const bad: string[] = [];
  for (let i = 0; i < n; i++) {
    const rnd = mulberry(seed + i); let last = -1;
    const r = run(spec, be, lockPath, runnable => { // bursty: stay on the same actor with p=0.6
      const k = last >= 0 && runnable.includes(last) && rnd() < 0.6 ? runnable.indexOf(last) : Math.floor(rnd() * runnable.length); last = runnable[k]!; return k;
    }, rnd);
    steps += r.steps; if (r.violations.length) { v++; if (bad.length < 3) bad.push(`seed ${seed + i}: ${r.violations[0]}`); }
  }
  return { orderings: n, violating: v, steps, bad };
}

const L = "/mem/acme.lock";
const SEED = 20261011;
const spec = (o: Partial<Spec> = {}): Spec => ({ takers: 3, holder: "dead", waitMs: 0, aged: true, ...o });
const EXH = { frozen: true };

for (const [name, s] of [
  ["2 takers over an aged dead lock", spec({ takers: 2 })], ["3 takers over an aged dead lock (ISS-LOCKTAKE-004 shape)", spec({ takers: 3 })],
  ["2 takers + the original holder alive and slow (late save + release), lock older than staleMs", spec({ takers: 2, holder: "alive" })],
] as const)
  test(`EXHAUSTIVE: ${name}: every ordering keeps one holder, no gap, no write without the lock`, () => {
    const r = exhaustive({ ...s, ...EXH }, memBackend(), L);
    console.log(`exhaustive [${name}]: ${r.orderings} complete orderings over ${r.states} distinct states, longest ${r.maxSteps} steps, ${r.bad.length} violating`);
    assert.deepEqual(r.bad, []); assert.ok(r.orderings > 100);
  });

test("EXHAUSTIVE search self-check: memoised state search counts exactly the orderings a plain, un-memoised enumeration finds (2 takers)", () => {
  const a = exhaustive({ ...spec({ takers: 2 }), ...EXH }, memBackend(), L), b = exhaustive({ ...spec({ takers: 2 }), ...EXH }, memBackend(), L, false);
  console.log(`self-check: memoised ${a.orderings} vs plain ${b.orderings} complete orderings`);
  assert.equal(a.orderings, b.orderings); assert.deepEqual(b.bad, []);
});

test("SEEDED: 4 takers + a normal acquirer (5 contenders), retries allowed, 60000 bursty orderings (seed printed)", () => {
  const r = seeded(spec({ takers: 5, waitMs: 40 }), memBackend(), L, SEED, 60000);
  console.log(`seeded [5 contenders, waitMs 40] seed=${SEED}: ${r.orderings} orderings, ${r.steps} steps, ${r.violating} violating`);
  assert.deepEqual(r.bad, []); assert.equal(r.violating, 0);
});

test("SEEDED: ISS-LOCKTAKE-004 recorded scenario, 3 takers, lock aged 100 s, 25000 bursty orderings (seed printed)", () => {
  const r = seeded(spec({ takers: 3, waitMs: 40 }), memBackend(), L, SEED + 1, 25000);
  console.log(`seeded [ISS-004: 3 takers aged lock] seed=${SEED + 1}: ${r.orderings} orderings, ${r.violating} violating (checker saw 35 two-believer + 27 no-lock writes in 12000)`);
  assert.deepEqual(r.bad, []); assert.equal(r.violating, 0);
});

test("SEEDED: live holder (alive, slow) + 3 takers + retries, 25000 orderings: nobody ever takes or destroys the live lock", () => {
  const r = seeded(spec({ takers: 3, holder: "alive", waitMs: 40 }), memBackend(), L, SEED + 2, 25000);
  console.log(`seeded [live holder + 3 takers] seed=${SEED + 2}: ${r.orderings} orderings, ${r.violating} violating`);
  assert.deepEqual(r.bad, []); assert.equal(r.violating, 0);
});

test("SEEDED: a taker may die at any point before it holds (claim left behind): never two holders, never a destroyed claim; 20000 orderings", () => {
  const r = seeded(spec({ takers: 4, waitMs: 30, kill: true }), memBackend(), L, SEED + 3, 20000);
  console.log(`seeded [claimant death] seed=${SEED + 3}: ${r.orderings} orderings, ${r.violating} violating`);
  assert.deepEqual(r.bad, []); assert.equal(r.violating, 0);
});

test("residual, MEASURED not asserted: a probe that lies about a live holder; lock younger than staleMs is never taken (age rule), older is (ISS-LOCKTAKE-005)", () => {
  const young = seeded(spec({ takers: 2, holder: "alive", waitMs: 40, aged: false, lying: true }), memBackend(), L, SEED + 4, 20000);
  const old = seeded(spec({ takers: 2, holder: "alive", waitMs: 40, aged: true, lying: true }), memBackend(), L, SEED + 5, 20000);
  console.log(`lying probe: young lock ${young.violating}/20000 violating (must be 0); old lock ${old.violating}/20000 violating (residual 005/003: owns()->rename)`);
  assert.equal(young.violating, 0, "the age conjunct keeps a young live lock safe even when the probe lies");
});

test("residual, MEASURED not asserted: an operator deleting the dead lock inside the reread->replace gap (ISS-LOCKTAKE-007)", () => {
  const r = seeded(spec({ takers: 3, waitMs: 40, operator: true }), memBackend(), L, SEED + 6, 12000);
  console.log(`operator delete mid-takeover, 3 takers + operator, seed=${SEED + 6}: ${r.orderings} orderings, ${r.violating} violating`);
});

test("REAL FILES: directed plan for ISS-LOCKTAKE-004 (A paused at each step while B and C run to the end), then 400 seeded orderings in a temp dir", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lock-explore-")); const lock = path.join(dir, "acme.lock");
  try {
    const be = dirBackend(dir); let plans = 0;
    for (const first of [0, 1, 2]) for (let k = 0; k <= 12; k++) { // actor `first` runs k steps, the other two run to completion, then `first` resumes
      let taken = 0;
      const r = run(spec({ takers: 3 }), be, lock, runnable => {
        const actors = runnable; const f = actors.indexOf(first);
        if (f >= 0 && taken < k) { taken++; return f; }
        const others = actors.filter(a => a !== first); return others.length ? actors.indexOf(others[0]!) : 0;
      });
      assert.deepEqual(r.violations, [], `first=${first} k=${k}`); plans++;
    }
    const s = seeded(spec({ takers: 3, waitMs: 40 }), be, lock, SEED + 7, 400);
    console.log(`real files: ${plans} directed plans + ${s.orderings} seeded orderings (seed ${SEED + 7}), ${s.violating} violating`);
    assert.deepEqual(s.bad, []); assert.equal(s.violating, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
