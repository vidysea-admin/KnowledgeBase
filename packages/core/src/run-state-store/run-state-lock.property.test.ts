import { test } from "node:test";
import assert from "node:assert/strict";
import { LockWorld, LOCK_FILE, forkWorld, norm, observeRenames, ownerPid, type SimProc } from "./run-state-lock-kit.js";
import { FakeRunStateCrash } from "./run-state-fake-fs.js";
import { runStateRevision } from "./run-state-store.js";
import { runStateWithAttempt, seededRandom } from "./run-state-test-kit.js";
import type { RunState } from "../domain/pipeline-workflow.js";

const CASES = 1000, STEPS = 18, STALE = 30_000, CEIL = 3_600_000;
const DATA = norm("/r/r1.run-state.json");
type Res = { ok: boolean; code?: string };
const code = (r: Res) => (r.ok ? "ok" : r.code!);
const rev = (s: RunState | null) => (s === null ? null : runStateRevision(s));

test(`property: ${CASES} seeded sequences of saves, crashes at any lock step, clock advances, pid reuse and nested racers: CAS holds, never two holders, no permanent lock`, () => {
  const tally = { ok: 0, conflict: 0, locked: 0, crashes: 0, nested: 0, takeovers: 0, emptyDelays: 0 };
  for (let seed = 1; seed <= CASES; seed++) {
    const rnd = seededRandom(seed), pick = (n: number) => Math.floor(rnd() * n);
    const w = new LockWorld();
    let nextPid = 100, nextN = 1, violation = "";
    let model: RunState | null = null;
    const procs: SimProc[] = [];
    const watch = (pid: number, from: string, to: string) => {
      const t = norm(to);
      if (t === DATA && ownerPid(w, LOCK_FILE) !== pid) violation ||= `seed ${seed}: pid ${pid} replaced the data file without holding the lock`;
      if (t === norm(LOCK_FILE)) { tally.takeovers++; if (ownerPid(w, from) !== pid) violation ||= `seed ${seed}: pid ${pid} moved a claim it does not own`; }
    };
    const spawn = () => { const p = w.spawn(nextPid++); observeRenames(p, watch); procs.push(p); return p; };
    const arm = (p: SimProc, extra: (n: number, op: string) => void) => observeRenames(p, watch, extra);
    const load = (p: SimProc) => (p.store.load("r1") as { ok: true; state: RunState | null }).state;
    const hasLeftover = () => w.names().some((n) => /\.lock(\.claim\..*)?$/.test(n));
    const sync = (p: SimProc) => { // after a crash: the target must hold the old or the new state, whole
      const cur = load(p);
      assert.ok(rev(cur) === rev(model) || cur !== null, `seed ${seed}: unreadable state`);
      model = cur;
    };
    spawn(); spawn();
    for (let i = 0; i < STEPS; i++) {
      const p = procs[pick(procs.length)]!;
      const roll = pick(9);
      if (roll <= 2) { // save with the current, a stale, or a null expectation
        const cur = load(p);
        const expected = roll === 0 ? cur : roll === 1 ? model : pick(2) ? null : cur;
        const leftover = hasLeftover();
        const next = runStateWithAttempt(nextN++);
        const r = p.store.save("r1", expected, next) as Res;
        const should = rev(expected) === rev(model);
        if (r.ok) { assert.ok(should, `seed ${seed}: accepted a save whose expected did not match`); model = next; tally.ok++; }
        else if (r.code === "conflict") { assert.ok(!should, `seed ${seed}: refused a matching save`); tally.conflict++; }
        else { assert.equal(r.code, "locked", `seed ${seed}: ${JSON.stringify(r)}`); assert.ok(leftover, `seed ${seed}: locked with no lock on disk`); tally.locked++; }
      } else if (roll === 3) { // crash at a random operation of a save
        const at = p.fs.opLog.length + pick(26);
        arm(p, (n, op) => { if (n === at) { w.kill(p); throw new FakeRunStateCrash(`died at ${op}`); } });
        const next = runStateWithAttempt(nextN++);
        const exp = load(p);
        p.store.save("r1", exp, next);
        arm(p, () => {});
        if (p.fs.crashed) { tally.crashes++; procs.splice(procs.indexOf(p), 1); sync(spawn()); }
        else sync(p);
      } else if (roll === 4) { // a second process races in the middle of one operation
        const q = procs.find((x) => x !== p) ?? spawn();
        const at = p.fs.opLog.length + pick(22);
        const cur = load(p);
        const results: Res[] = [];
        arm(p, (n) => { if (n === at) { arm(p, () => {}); results.push(q.store.save("r1", cur, runStateWithAttempt(nextN++)) as Res); } });
        results.push(p.store.save("r1", cur, runStateWithAttempt(nextN++)) as Res);
        arm(p, () => {});
        assert.ok(results.filter((r) => r.ok).length <= 1, `seed ${seed}: two racers both won with the same expectation`);
        tally.nested++;
        sync(p);
      } else if (roll === 5) w.advance([1_000, STALE + 1, 2 * CEIL][pick(3)]!);
      else if (roll === 6) { const d = [...w.dead]; if (d.length) w.dead.delete(d[pick(d.length)]!); } // pid reuse: a dead pid now looks alive
      else if (roll === 7) w.probeForLive = pick(2) ? "alive" : "unknown";
      else spawn();
      assert.equal(violation, "", violation);
    }
    // NO PERMANENT LOCK, three ways, on forks of the final directory.
    const finish = (f: LockWorld, label: string) => {
      const c = f.spawn(9_999);
      const l = (c.store.load("r1") as { ok: true; state: RunState | null }).state;
      assert.equal(rev(l), rev(model), `seed ${seed} ${label}: state drifted`);
      let r = c.store.save("r1", l, runStateWithAttempt(nextN++));
      if (!r.ok) { // only an EMPTY lock/claim (owner died before writing it) may delay recovery, and only by staleMs
        assert.ok([...f.files.keys()].some((p) => /.lock(.claim..+)?$/.test(norm(p)) && ownerPid(f, p) === undefined), `seed ${seed} ${label}: blocked by a readable owner: ${f.names()}`);
        tally.emptyDelays++; f.advance(STALE + 1);
        r = c.store.save("r1", l, runStateWithAttempt(nextN++));
      }
      assert.equal(r.ok, true, `seed ${seed} ${label}: still locked: ${JSON.stringify(r)} ${f.names()}`);
      assert.deepEqual(f.names().filter((n) => !n.endsWith(".json")), [], `seed ${seed} ${label}: leftovers`);
    };
    const a = forkWorld(w); for (let pid = 100; pid < nextPid; pid++) a.dead.add(pid); finish(a, "all owners dead");
    const b = forkWorld(w); b.probeForLive = "unknown"; b.dead = new Set(); b.advance(STALE + 1); finish(b, "owners unverifiable, past staleMs");
    const c = forkWorld(w); c.probeForLive = "alive"; c.dead = new Set(); c.advance(CEIL + 1); finish(c, "owners look alive, past the ceiling");
  }
  assert.ok(tally.ok > CASES && tally.conflict > 100 && tally.locked > 50 && tally.crashes > 300 && tally.nested > 300 && tally.takeovers > 100, JSON.stringify(tally));
  console.log(`property tally ${JSON.stringify(tally)}`);
});
