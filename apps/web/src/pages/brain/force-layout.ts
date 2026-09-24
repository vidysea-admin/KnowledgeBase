/**
 * apps/web/src/pages/brain/force-layout.ts — a small, DETERMINISTIC Fruchterman-Reingold layout
 * for the /brain knowledge graph (U-BRAIN [C2]/[I4]).
 *
 * Why hand-rolled instead of the force-graph library that was here before: that library renders
 * to a `<canvas>`, and a canvas cannot carry a node label as a real DOM element. The measured
 * defect this unit exists to fix is exactly that — 13 node shapes, **0** `svg text` labels — so
 * the renderer has to be SVG, and an SVG renderer needs positions it owns. A seeded PRNG keeps
 * the layout reproducible, which is what makes a DOM probe over it meaningful at all.
 *
 * [I4] performance ceiling, stated rather than assumed: this is O(n^2) per iteration. At the
 * real 164-node graph that is ~27k pair computations x `iterations`, a few tens of milliseconds
 * once, memoised thereafter. `MAX_LAID_OUT_NODES` is the explicit ceiling; past it the caller is
 * told to degrade (see `BrainPage`), never left with a silently unusable page.
 */

export interface LayoutNode {
  id: string;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  iterations?: number;
  seed?: number;
}

/** Past this, `BrainPage` degrades to the highest-degree subgraph and says so on screen. */
export const MAX_LAID_OUT_NODES = 400;

/** mulberry32 — 32-bit seeded PRNG. Same seed, same layout, every render and every test run. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function layoutGraph(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions,
): Map<string, Point> {
  const { width, height } = options;
  const iterations = options.iterations ?? 260;
  const rand = seededRandom(options.seed ?? 1);
  const positions = new Map<string, Point>();
  if (nodes.length === 0) return positions;

  for (const n of nodes) {
    positions.set(n.id, { x: rand() * width, y: rand() * height });
  }
  if (nodes.length === 1) {
    positions.set(nodes[0]!.id, { x: width / 2, y: height / 2 });
    return positions;
  }

  const k = Math.sqrt((width * height) / nodes.length);
  const live = edges.filter((e) => positions.has(e.source) && positions.has(e.target) && e.source !== e.target);
  let temperature = width / 8;
  const cooling = temperature / (iterations + 1);
  const disp = new Map<string, Point>();

  for (let step = 0; step < iterations; step++) {
    for (const n of nodes) disp.set(n.id, { x: 0, y: 0 });

    for (let i = 0; i < nodes.length; i++) {
      const a = positions.get(nodes[i]!.id)!;
      const da = disp.get(nodes[i]!.id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = positions.get(nodes[j]!.id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          // Two nodes exactly on top of each other have no direction to separate along; nudge
          // with the SEEDED prng so the tie-break stays deterministic.
          dx = (rand() - 0.5) * 0.1;
          dy = (rand() - 0.5) * 0.1;
          dist = Math.hypot(dx, dy) || 0.01;
        }
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        da.x += fx;
        da.y += fy;
        const db = disp.get(nodes[j]!.id)!;
        db.x -= fx;
        db.y -= fy;
      }
    }

    for (const e of live) {
      const a = positions.get(e.source)!;
      const b = positions.get(e.target)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const da = disp.get(e.source)!;
      const db = disp.get(e.target)!;
      da.x -= fx;
      da.y -= fy;
      db.x += fx;
      db.y += fy;
    }

    for (const n of nodes) {
      const p = positions.get(n.id)!;
      const d = disp.get(n.id)!;
      const len = Math.hypot(d.x, d.y) || 0.01;
      p.x += (d.x / len) * Math.min(len, temperature);
      p.y += (d.y / len) * Math.min(len, temperature);
      p.x = Math.min(width - 12, Math.max(12, p.x));
      p.y = Math.min(height - 12, Math.max(12, p.y));
    }
    temperature -= cooling;
  }

  return positions;
}
