/**
 * ISS-WA-REVIEW-WIRE-006 (T-007, criterion 9): the production read perimeter (brain, session detail, grounded content, citations,
 * the /ask tree and /graph) must not serve pending, rejected or old-wiring WhatsApp material. Imports the composition readers; edits none.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import type { BrainReadDeps } from "../routes/brain.js";
import { createGroundedContentDeps } from "../grounded-content/reader.js";
import { trustedBrainReads, trustedCitationReads, trustedGraphReads, trustedTreeReads } from "../composition/integrations/trusted-readers.js";
import { leaks, PUB_SESSION, TENANT, WA_SESSION, waWorld, type Row, type WaState } from "./wa-quarantine.testsupport.js";

const UNAPPROVED: WaState[] = ["pending", "rejected"];
function baseBrain(w: ReturnType<typeof waWorld>): BrainReadDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (name: string): any[] => structuredClone(w.data[name] ?? []);
  return {
    async listSessions() { return rows("sessions"); },
    async listSources() { return rows("sources"); },
    async listGaps() { return []; },
    async getSessionDetail(_t: string, sessionId: string) {
      const session = rows("sessions").find(s => s._id === sessionId);
      if (!session) return null;
      return { session, page: rows("session_pages").find(p => p.sessionId === sessionId) ?? null,
        claims: rows("claims").filter(c => (c.evidence as Row[]).some(e => e.sessionId === sessionId)),
        turns: rows("turns").filter(t => t.sessionId === sessionId) } as never;
    },
  };
}

for (const state of UNAPPROVED) {
  test(`brain list/detail reads hide the ${state} WhatsApp session, source, page, claims and turns`, async () => {
    const w = waWorld(state);
    const brain = trustedBrainReads(baseBrain(w), () => w.db as unknown as Db);
    const sessions = await brain.listSessions(TENANT), sources = await brain.listSources(TENANT);
    assert.deepEqual(sessions.map(s => s._id), [PUB_SESSION]);
    assert.deepEqual(sources.map(s => s._id), ["source-pub"]);
    assert.equal(await brain.getSessionDetail(TENANT, WA_SESSION), null);
    const control = await brain.getSessionDetail(TENANT, PUB_SESSION);
    assert.ok(control && control.turns.length === 1);
    assert.deepEqual(leaks([sessions, sources, control]), []);
  });

  test(`grounded content returns nothing for the ${state} WhatsApp session`, async () => {
    const w = waWorld(state);
    const grounded = createGroundedContentDeps(trustedBrainReads(baseBrain(w), () => w.db as unknown as Db));
    assert.equal(await grounded.getGroundedContent(TENANT, WA_SESSION), null);
    assert.deepEqual(leaks(await grounded.getGroundedContent(TENANT, PUB_SESSION)), []);
  });

  test(`citations never resolve the old-wiring WhatsApp claim while ${state}`, async () => {
    const w = waWorld(state);
    const cite = trustedCitationReads(() => w.db as unknown as Db);
    assert.equal(await cite.getCitation(TENANT, "claim-wa-old"), null);
    const control = await cite.getCitation(TENANT, "claim-pub");
    assert.ok(control && control.evidence[0]?.turn);
    assert.deepEqual(leaks(control), []);
  });

  test(`the /ask tree and /graph omit the ${state} WhatsApp node, title and edges`, async () => {
    const w = waWorld(state);
    const tree = await trustedTreeReads(() => w.db as unknown as Db).load(TENANT);
    assert.deepEqual(leaks(tree), []);
    const graph = await trustedGraphReads(() => w.db as unknown as Db).loadGraph(TENANT);
    assert.deepEqual(leaks(graph), []);
    assert.equal(JSON.stringify(graph ?? null).includes("edge-wa"), false);
    assert.equal(JSON.stringify(graph ?? null).includes(WA_SESSION), false);
  });
}

test("approved WhatsApp: only the reviewed claim text is reachable through brain detail and citation; sibling turn and group title are not", async () => {
  const w = waWorld("approved");
  const brain = trustedBrainReads(baseBrain(w), () => w.db as unknown as Db);
  const detail = await brain.getSessionDetail(TENANT, WA_SESSION);
  assert.ok(detail);
  assert.deepEqual(detail.turns.map(t => t._id), ["wa-turn-1"]);
  assert.equal(detail.claims.some(c => c._id === "claim-wa-old"), false);
  assert.equal(detail.page, null, "aggregate pages never include a chat session");
  assert.deepEqual(leaks(detail, { allowApprovedText: true }), []);
  assert.equal(await trustedCitationReads(() => w.db as unknown as Db).getCitation(TENANT, "claim-wa-old"), null);
  assert.deepEqual((await brain.listSessions(TENANT)).map(s => s.title).filter(t => /PRIVATE/.test(t)), []);
});
