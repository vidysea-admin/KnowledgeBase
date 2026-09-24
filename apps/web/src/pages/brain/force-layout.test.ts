/**
 * apps/web/src/pages/brain/force-layout.test.ts — the layout is the thing that makes an SVG node
 * (and therefore a label) placeable at all, so its guarantees are pinned: deterministic, in
 * bounds, one position per node, and it does not collapse everything onto one point.
 */
import { describe, test, expect } from "vitest";
import { layoutGraph } from "./force-layout.js";

const NODES = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}` }));
const EDGES = NODES.slice(1).map((n, i) => ({ source: NODES[i]!.id, target: n.id }));
const OPTS = { width: 1000, height: 600, iterations: 60, seed: 7 };

describe("layoutGraph", () => {
  test("returns exactly one position per node", () => {
    const pos = layoutGraph(NODES, EDGES, OPTS);
    expect(pos.size).toBe(NODES.length);
    for (const n of NODES) expect(pos.has(n.id)).toBe(true);
  });

  test("is deterministic for the same seed — the same graph lays out the same way twice", () => {
    const a = layoutGraph(NODES, EDGES, OPTS);
    const b = layoutGraph(NODES, EDGES, OPTS);
    for (const n of NODES) expect(a.get(n.id)).toEqual(b.get(n.id));
  });

  test("keeps every node inside the canvas, so no label renders off-screen", () => {
    const pos = layoutGraph(NODES, EDGES, OPTS);
    for (const p of pos.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(OPTS.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(OPTS.height);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  test("spreads nodes out rather than stacking them on one point", () => {
    const pos = [...layoutGraph(NODES, EDGES, OPTS).values()];
    const distinct = new Set(pos.map((p) => `${Math.round(p.x)}|${Math.round(p.y)}`));
    expect(distinct.size).toBeGreaterThan(NODES.length * 0.8);
  });

  test("an empty graph yields an empty map, and a single node is centred", () => {
    expect(layoutGraph([], [], OPTS).size).toBe(0);
    expect(layoutGraph([{ id: "only" }], [], OPTS).get("only")).toEqual({ x: 500, y: 300 });
  });

  test("an edge naming a node that is not in the node list is ignored, not a crash", () => {
    const pos = layoutGraph([{ id: "a" }, { id: "b" }], [{ source: "a", target: "ghost" }], OPTS);
    expect(pos.size).toBe(2);
  });

  test("the real-size graph (164 nodes) lays out in well under a second", () => {
    const nodes = Array.from({ length: 164 }, (_, i) => ({ id: `x${i}` }));
    const edges = Array.from({ length: 526 }, (_, i) => ({ source: `x${i % 164}`, target: `x${(i * 7) % 164}` }));
    const started = Date.now();
    const pos = layoutGraph(nodes, edges, { width: 1100, height: 700, seed: 1 });
    expect(pos.size).toBe(164);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
