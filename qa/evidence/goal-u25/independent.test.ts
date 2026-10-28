import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { Decisions, Turns } from "@lkb/core";
import { extractAndPersistDecisions } from "../../../apps/api/src/indexing/decisions-persist.js";

const source: Turns[] = [{ _id: "turn-1", tenantId: "checker", sessionId: "session-1", speakerRef: "speaker-1", text: "No decision was made.", tStart: 0, tEnd: 4 }];
const empty = async () => ({ text: "[]", usage: { inputTokens: 0, outputTokens: 0 }, provider: "checker-scripted", model: "offline", costUsd: 0 });

for (const race of ["human-review", "foreign-session-evidence"] as const) {
  test(`independent atomic stale-prune boundary: ${race} after read remains intact`, async () => {
    const original: Decisions = { _id: "prior-proposal", tenantId: "checker", text: "Prior decision.", status: "proposed", evidence: [{ turnId: "turn-1", sessionId: "session-1" }] };
    const rows = [structuredClone(original)];
    let reads = 0, deletes = 0, providerCalls = 0;
    const db = { collection(name: string) {
      assert.equal(name, "decisions");
      return {
        find(filter: Record<string, unknown>) {
          reads++;
          assert.equal(filter.tenantId, "checker");
          assert.equal(filter["evidence.sessionId"], "session-1");
          return { toArray: async () => structuredClone(rows) };
        },
        async updateOne() { assert.fail("clean empty extraction must not upsert"); },
        async deleteMany(filter: Record<string, unknown>) {
          deletes++;
          if (race === "human-review") rows[0]!.status = "verified";
          else rows[0]!.evidence.push({ turnId: "other-turn", sessionId: "other-session" });
          // Honor the actual query at deletion time, after the separate read's snapshot.
          const remove = rows.filter((row) => Object.entries(filter).every(([key, value]) => {
            if (key === "_id") return (value as { $in: string[] }).$in.includes(row._id);
            if (key === "evidence.sessionId") return row.evidence.some((item) => item.sessionId === value);
            if (key === "evidence") {
              const other = (value as { $not: { $elemMatch: { sessionId: { $ne: string } } } }).$not.$elemMatch.sessionId.$ne;
              return !row.evidence.some((item) => item.sessionId !== other);
            }
            return row[key] === value;
          }));
          for (const row of remove) rows.splice(rows.indexOf(row), 1);
          return { deletedCount: remove.length };
        },
      };
    } } as unknown as Pick<Db, "collection">;
    const result = await extractAndPersistDecisions("checker", "session-1", source, async () => { providerCalls++; return empty(); }, db);
    assert.deepEqual(result, { count: 0, degraded: null });
    assert.equal(providerCalls, 1); assert.equal(reads, 1); assert.equal(deletes, 1);
    assert.equal(rows.length, 1, "concurrent review/source membership must exclude the row from cleanup");
    const expected = structuredClone(original);
    if (race === "human-review") expected.status = "verified";
    else expected.evidence.push({ turnId: "other-turn", sessionId: "other-session" });
    assert.deepEqual(rows[0], expected);
  });
}
