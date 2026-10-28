/** Local lexical branch ranking; only bounded frontiers leave the process. No vectors. */
import type { TreeIndexNode } from "@lkb/core";

export const ROUTING_LIMITS = Object.freeze({ nodes: 48, bytes: 24 * 1024 });
const tokens = (value: string): Set<string> => new Set(value.toLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []);

export function routingFrontier(query: string, frontier: TreeIndexNode[]): TreeIndexNode[] {
  const terms = tokens(query);
  const scores = new Map<TreeIndexNode, number>();
  const visiting = new Set<TreeIndexNode>();
  const identities = new Set<string>();
  let visited = 0;
  function rank(node: TreeIndexNode, depth = 0): number {
    const cached = scores.get(node);
    if (cached !== undefined) return cached;
    if (visiting.has(node) || depth > 32 || ++visited > 50_000) throw new Error("tree routing traversal budget exceeded");
    if (!node.node_id || /\s/.test(node.node_id) || Buffer.byteLength(node.node_id, "utf8") > 1024
      || identities.has(node.node_id) || typeof node.title !== "string" || typeof node.summary !== "string"
      || !Array.isArray(node.children)) throw new Error("invalid or duplicate tree routing identity");
    identities.add(node.node_id);
    visiting.add(node);
    const words = tokens(node.title.slice(0, 512) + " " + node.summary.slice(0, 768));
    const own = [...terms].filter((term) => words.has(term)).length;
    let best = own;
    for (const child of node.children) best = Math.max(best, rank(child, depth + 1));
    visiting.delete(node);
    scores.set(node, best);
    return best;
  }
  const ranked = frontier.map((node, order) => ({ node, order, score: rank(node) }))
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const result: TreeIndexNode[] = [];
  let bytes = 0;
  for (const { node } of ranked) {
    // Summaries are routing-only and individually bounded, including non-bounded legacy callers.
    const row = { ...node, title: node.title.slice(0, 512), summary: node.summary.slice(0, 768), children: [] };
    const size = Buffer.byteLength(JSON.stringify([row.node_id, row.title, row.summary]), "utf8");
    if (bytes + size > ROUTING_LIMITS.bytes || result.length >= ROUTING_LIMITS.nodes) break;
    bytes += size;
    result.push({ ...row, children: node.children });
  }
  return result;
}
