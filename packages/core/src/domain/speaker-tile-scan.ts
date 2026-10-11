/**
 * packages/core/src/domain/speaker-tile-scan.ts — T-042 slice 1 (cycle 1). The per-shift scan and the
 * per-label threshold chain for `speaker-tile-alignment.ts`. Pure; no I/O.
 *
 * LAG MODEL. An observation at time t shows who was speaking at t - lag. `scanShift(lag)` therefore
 * credits each hold [from, to) to the speech interval [from - lag, to - lag), i.e. it compares the turns
 * with the log shifted EARLIER by `lag`. The holds are built once; a shift costs one binary search per
 * effective turn plus the holds it covers. Seconds per (label, name) are piecewise linear in `lag`, so a
 * grid of step s misses the exact worst case by at most s per turn boundary (see the manifest).
 */
import { foldKey, nonPerson } from "./speaker-tile-names.js";

export interface Hold { from: number; to: number; name: string }
export interface Eff { s: number; e: number; id: string }
export interface Acc { sec: number; turns: Set<string>; from: number; to: number }
export interface LabelScan { total: number; observed: number; cands: { name: string; sec: number }[]; acc: Map<string, Acc> }
export type TileRefusal = "no-observations" | "insufficient-coverage" | "insufficient-duration" | "insufficient-fraction"
  | "runner-up-too-strong" | "two-strong-names" | "non-person-name" | "bot-own-name";
export interface Gates { minSec: number; minFrac: number; maxRun: number; minCov: number; botKey: string; extra?: (n: string) => boolean }
export type Verdict = { name: string; agreeSec: number; topFrac: number; runFrac: number } | { reason: TileRefusal };

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const EPS = 1e-9;

export function scanShift(holds: Hold[], byLabel: Map<string, Eff[]>, lag: number, tick: () => void): Map<string, LabelScan> {
  const firstEndingAfter = (x: number): number => {
    let lo = 0, hi = holds.length;
    while (lo < hi) { tick(); const mid = (lo + hi) >> 1; if (holds[mid]!.to - lag <= x) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const out = new Map<string, LabelScan>();
  for (const label of [...byLabel.keys()].sort(cmp)) {
    const acc = new Map<string, Acc>();
    let total = 0;
    for (const { s, e, id } of byLabel.get(label)!) {
      total += e - s;
      for (let j = firstEndingAfter(s); j < holds.length && holds[j]!.from - lag < e; j++) {
        tick();
        const h = holds[j]!, from = Math.max(s, h.from - lag), to = Math.min(e, h.to - lag);
        if (to <= from) continue;
        let a = acc.get(h.name);
        if (!a) acc.set(h.name, (a = { sec: 0, turns: new Set(), from, to }));
        a.sec += to - from; a.turns.add(id); a.from = Math.min(a.from, from); a.to = Math.max(a.to, to);
      }
    }
    const cands = [...acc.entries()].map(([name, a]) => ({ name, sec: a.sec })).sort((x, y) => y.sec - x.sec || cmp(x.name, y.name));
    out.set(label, { total, observed: cands.reduce((n, c) => n + c.sec, 0), cands, acc });
  }
  return out;
}

/** The v0 threshold chain, unchanged, applied to one label at one shift. */
export function decide(l: LabelScan, g: Gates): Verdict {
  const top = l.cands[0], second = l.cands[1];
  if (!top || l.observed <= 0) return { reason: "no-observations" };
  if (l.observed + EPS < g.minCov * l.total) return { reason: "insufficient-coverage" };
  if (g.botKey !== "" && foldKey(top.name) === g.botKey) return { reason: "bot-own-name" };
  if (nonPerson(top.name, g.extra)) return { reason: "non-person-name" };
  if (top.sec + EPS < g.minSec) return { reason: "insufficient-duration" };
  if (second && second.sec > g.maxRun * l.observed + EPS) return { reason: second.sec + EPS >= g.minSec ? "two-strong-names" : "runner-up-too-strong" };
  if (top.sec + EPS < g.minFrac * l.observed) return { reason: "insufficient-fraction" };
  return { name: top.name, agreeSec: top.sec, topFrac: top.sec / l.observed, runFrac: second ? second.sec / l.observed : 0 };
}
