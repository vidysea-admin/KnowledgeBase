/** ISS-WA-REVIEW-WIRE-006 (T-007 criterion 9): the /ask source hydrator must not quote unreviewed WhatsApp turns even when a stale tree admits the node. Test only; source-context.ts is not edited. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TreeIndexNode } from "@lkb/core";
import { createSourceHydrator } from "./source-context.js";
import { leaks, PUB_SESSION, TENANT, WA_SESSION, waWorld, type WaState } from "../visibility/wa-quarantine.testsupport.js";
import { linkCase } from "../visibility/external-model.testsupport.js";

const sessionNode = (sessionId: string, summary: string): TreeIndexNode => ({ node_id: `tenant:${TENANT}/session:${sessionId}`, level: "session", title: sessionId,
  summary, children: [], evidence: { sessionRef: sessionId } });

for (const state of ["pending", "rejected"] as WaState[]) {
  test(`source hydration refuses a stale tree node of a ${state} WhatsApp session without quoting it, and still hydrates the public session`, async () => {
    const w = waWorld(state);
    const hydrate = createSourceHydrator(TENANT, { db: w.db });
    const query = "PLANTZEBRA scholarship deadline engineering admissions";
    // Fail closed: an admitted session with no citable rows refuses the whole request, and the refusal text carries no planted content.
    await assert.rejects(() => hydrate(query, [sessionNode(WA_SESSION, "stale summary"), sessionNode(PUB_SESSION, "public")]),
      (error: unknown) => (error as { code?: string }).code === "source_context_unavailable" && leaks(String(error) + JSON.stringify(error)).length === 0);
    const control = await hydrate(query, [sessionNode(PUB_SESSION, "public")]);
    assert.deepEqual(leaks(control), []);
    assert.equal(JSON.stringify(control).includes("pub-turn-1"), true, "control: the public session is still hydrated");
  });
}
test("approved WhatsApp hydrates only reviewed text, never the unreviewed sibling or the group title", async () => {
  const w = waWorld("approved"); linkCase(w, "no"); // W11 gate H-10: the default studentData "no" admits approved text
  const result = await createSourceHydrator(TENANT, { db: w.db })("PLANTZEBRA UNREVIEWEDOCELOT scholarship tuition", [sessionNode(WA_SESSION, "x")]);
  assert.deepEqual(leaks(result, { allowApprovedText: true }), []);
  assert.equal(JSON.stringify(result).includes("wa-turn-2"), false);
});
