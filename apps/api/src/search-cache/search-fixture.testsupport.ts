/** TEST-ONLY: filter-applying fake db for the /search store tests (shared by search-store.test.ts and search-cache.test.ts). */
export const SESSIONS = [
  { _id: "s1", tenantId: "toc", sourceId: "src1", title: "New Zealand Visas", date: "2026-01-01", status: { transcribe: "done", index: "done" } },
  { _id: "s2", tenantId: "toc", sourceId: "src2", title: "Funding and Forex", date: "2026-01-02", status: { transcribe: "done", index: "done" } },
  { _id: "s3", tenantId: "toc", sourceId: "src3", title: "AI in Counselling", date: "2026-01-03", status: { transcribe: "done", index: "done" } },
  // A different tenant's row, present so an unscoped query is DETECTABLE rather than merely wrong.
  { _id: "s9", tenantId: "other", sourceId: "src9", title: "Other Tenant Session", date: "2026-01-04", status: { transcribe: "done", index: "done" } },
];

export const CORPUS = [
  { _id: "t1", tenantId: "toc", sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "New Zealand student visa approval rates for the 2026 intake." },
  { _id: "t2", tenantId: "toc", sessionId: "s2", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "Education loan interest rates and forex markups of 2.5% at banks." },
  { _id: "t3", tenantId: "toc", sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "Completely unrelated small talk about the weather today." },
  { _id: "t4", tenantId: "toc", sessionId: "s3", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "AI is reshaping counselling workflows in 2026." },
  { _id: "t5", tenantId: "toc", sessionId: "s3", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "Is it ok to go without a bank statement?" },
  // Second 2026 turn in s1: makes "2026" a 3-hit / 2-session query, so session dedup is testable.
  { _id: "t6", tenantId: "toc", sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "Deadlines for the 2026 September cohort close in March." },
  // Another tenant's turn — an unscoped turns query would score and return this.
  { _id: "t9", tenantId: "other", sessionId: "s9", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "Another tenant private 2026 visa transcript." },
];

export interface Call { coll: string; op: "find" | "findOne"; filter: Record<string, unknown> }

/** Applies a filter the way Mongo would, so id-keyed and tenant-keyed resolution are falsifiable.
 * The old fake ignored the filter entirely, which is why 5A/5C/5D could not be caught. */
export function matches(filter: Record<string, unknown>, doc: Record<string, unknown>): boolean {
  const values = (value: unknown, keys: string[]): unknown[] => !keys.length ? [value] : Array.isArray(value)
    ? value.flatMap((item) => values(item, keys)) : values(value && typeof value === "object" ? (value as Record<string, unknown>)[keys[0]!] : undefined, keys.slice(1));
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return (condition as Record<string, unknown>[]).some((branch) => matches(branch, doc));
    const found = values(doc, key.split("."));
    if (condition && typeof condition === "object") {
      const operators = condition as Record<string, unknown>;
      if ("$in" in operators) return found.some((value) => (operators.$in as unknown[]).includes(value));
      if ("$regex" in operators) return found.some((value) => typeof value === "string" && new RegExp(String(operators.$regex), String(operators.$options)).test(value));
    }
    return found.some((value) => value === condition);
  });
}

export function capturingDb(extra: { turns?: Record<string, unknown>[]; heads?: Record<string, unknown>[]; sources?: Record<string, unknown>[]; tree?: Record<string, unknown>; more?: Record<string, Record<string, unknown>[]> } = {}) {
  const calls: Call[] = [];
  const data = { turns: structuredClone(extra.turns ?? CORPUS), sessions: structuredClone(SESSIONS),
    sources: structuredClone(extra.sources ?? SESSIONS.map((session) => ({ _id: session.sourceId, tenantId: session.tenantId, kind: "recording", path: `offline-fixture/${session._id}` }))),
    transcript_reviews: structuredClone(extra.heads ?? []), tree_index: extra.tree ? [extra.tree] : [], ...structuredClone(extra.more ?? {}) } as Record<string, Record<string, unknown>[]> & { turns: Record<string, unknown>[]; sessions: Record<string, unknown>[]; sources: Record<string, unknown>[]; transcript_reviews: Record<string, unknown>[] };
  const rows = (name: string): Record<string, unknown>[] => name in data ? data[name]! : [];
  const db = {
    collection: (name: string) => ({
      find: (filter: Record<string, unknown>) => {
        calls.push({ coll: name, op: "find", filter });
        let limit = Number.POSITIVE_INFINITY;
        const cursor = { limit(value: number) { limit = value; return cursor; }, toArray: async () => structuredClone(rows(name).filter((d) => matches(filter, d)).slice(0, limit)) };
        return cursor;
      },
      findOne: async (filter: Record<string, unknown>) => {
        calls.push({ coll: name, op: "findOne", filter });
        return structuredClone(rows(name).find((d) => matches(filter, d)) ?? null);
      },
    }),
  };
  return { db: db as never, calls, data };
}
