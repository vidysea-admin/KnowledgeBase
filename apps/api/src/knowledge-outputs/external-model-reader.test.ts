/** W11 part B G3 (R-32): the knowledge-outputs reader (input to the generator and verifier models) never returns a WhatsApp session or claim whose link is not studentData "no". */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMongoOutputReader } from "./reader.js";
import { leaks, PUB_SESSION, TENANT, WA_SESSION, waWorld } from "../visibility/wa-quarantine.testsupport.js";
import { EXCLUDED, linkCase } from "../visibility/external-model.testsupport.js";

for (const kind of EXCLUDED) {
  test(`G3: a ${kind} link refuses a requested WhatsApp session as not found, returning nothing`, async () => {
    const w = waWorld("approved"); linkCase(w, kind);
    const read = createMongoOutputReader(w.db as never);
    for (const ids of [[WA_SESSION], [WA_SESSION, PUB_SESSION]]) {
      await assert.rejects(() => read(TENANT, ids), (e: unknown) => (e as { status?: number }).status === 404 && leaks(String(e) + JSON.stringify(e), { allowApprovedText: false }).length === 0);
    }
  });
}
test("G3: a studentData no link returns the approved WhatsApp claim; a public session is unaffected by a yes link", async () => {
  const w = waWorld("approved"); linkCase(w, "no");
  const result = await createMongoOutputReader(w.db as never)(TENANT, [WA_SESSION]);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.claims.some(c => c.source === "whatsapp"), true);
  const yes = waWorld("approved"); linkCase(yes, "yes");
  assert.equal((await createMongoOutputReader(yes.db as never)(TENANT, [PUB_SESSION])).claims.some(c => c._id === "claim-pub"), true);
});
