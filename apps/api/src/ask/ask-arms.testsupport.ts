/** TEST-ONLY: filter-honouring cursor fakes for the /ask arms tests (shared by ask-arms.test.ts and ask-arms-fast.test.ts). */
import type { TreeIndexNode } from "@lkb/core";
import { chunkContentId } from "../indexing/chunk-integrity.js";

export const TREE: TreeIndexNode = {
  node_id: "tenant:t1", title: "t1", level: "tenant", summary: "", children: [
    { node_id: "tenant:t1/year:2026", title: "2026", level: "year", summary: "", children: [
      { node_id: "tenant:t1/year:2026/month:06/session:s1", title: "S1", level: "session", summary: "Visas.", children: [] },
      { node_id: "tenant:t1/year:2026/month:06/session:s2", title: "S2", level: "session", summary: "Funding.", children: [] },
    ] },
  ],
};

export type Row = Record<string, unknown>;
/**
 * A cursor that honours what the arms now send (D-206): tenantId, the `$or` text prefilter, and `$in` on `_id` / `sessionId`.
 * A fake that ignores filters would hide an arm that reads more than it should, so the filters are applied for real.
 */
export function applyFilter(all: Row[], filter: Row | undefined): Row[] {
  if (!filter) return all;
  const textMatch = (row: Row, clause: Row) => { const t = clause.text as { $regex: string; $options: string } | undefined;
    return !t || (typeof row.text === "string" && new RegExp(t.$regex, t.$options).test(row.text)); };
  return all.filter(row => Object.entries(filter).every(([key, want]) => {
    if (key === "$or") return (want as Row[]).some(clause => textMatch(row, clause));
    if (want && typeof want === "object" && "$in" in (want as object)) return ((want as { $in: unknown[] }).$in).includes(row[key]);
    return row[key] === want;
  }));
}
export function cursor(rows: Row[]) { let max = Number.POSITIVE_INFINITY; const c = { limit(n: number) { max = n; return c; }, toArray: async () => rows.slice(0, max) }; return c; }

/**
 * Completes the shorthand rows to what the production read gate accepts (whole turns, content-bound chunks): the
 * visibility gate drops partial turns and goal-t008 drops chunks whose id does not bind them to their source text.
 */
export function completeRows(rows: { chunks?: unknown[]; turns?: unknown[] }, tenantId = "t1") {
  const turns: Row[] = ((rows.turns ?? []) as Row[]).map(t => ({ tenantId, speakerRef: "spk:0", tStart: 0, tEnd: 1, ...t }));
  const chunks = ((rows.chunks ?? []) as Row[]).map(c => {
    const tenant = (c.tenantId as string | undefined) ?? tenantId;
    const source = turns.filter(t => t.tenantId === tenant && t.sessionId === c.sourceRef);
    const turnRefs = source.map(t => t._id as string);
    return { ...c, tenantId: tenant, turnRefs, embeddingModel: "fake",
      _id: chunkContentId(tenant, c.sourceRef as string, turnRefs, source.map(t => (t.text as string).trim()).join(" ")) };
  });
  return { turns, chunks };
}
