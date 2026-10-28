import { test } from "node:test";
import assert from "node:assert/strict";
import { createArchiverFetcherFromEnv, createArchiverMessageFetcher, GROUP_PROJECTION, MESSAGE_PROJECTION, type ArchiverCollection } from "./whatsapp-archiver-fetcher.js";
import { createWhatsappCandidateLoader } from "./whatsapp-candidate-loader.js";

const NOW = new Date("2026-10-19T10:00:00Z");
type Opt = { projection: Record<string, 0 | 1>; limit: number; maxTimeMS: number };
function fake(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ filter: Record<string, unknown>; options: Opt }> = [];
  const col: ArchiverCollection = { find: (filter, options) => { calls.push({ filter, options }); return { toArray: async () => rows }; } };
  return { col, calls };
}
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const setup = (groupRows: Array<Record<string, unknown>>, msgRows: Array<Record<string, unknown>>, allowed = ["G1"]) => {
  const g = fake(groupRows), m = fake(msgRows);
  return { g, m, fetch: createArchiverMessageFetcher({ open: async () => ({ groups: g.col, messages: m.col }), allowedGroups: allowed, now: () => NOW }) };
};

test("projection never requests a sender and the output carries only text/ts/group/message ids", async () => {
  const s = setup([{ jid: "G1" }], [{ text: "https://zoom.us/j/84512345678", ts: day(1), groupJid: "G1", messageId: "m1", personId: "SENDER", ownerUserId: "O" }]);
  const out = await s.fetch();
  assert.deepEqual(Object.keys(MESSAGE_PROJECTION).sort(), ["_id", "groupJid", "messageId", "text", "ts"]);
  assert.deepEqual(s.m.calls[0]!.options.projection, MESSAGE_PROJECTION);
  assert.deepEqual(s.g.calls[0]!.options.projection, GROUP_PROJECTION);
  assert.deepEqual(Object.keys(out[0]!).sort(), ["groupId", "messageId", "text", "ts"]);
  assert.ok(!JSON.stringify(out).includes("SENDER"));
});

test("text is discarded by the extractor: candidates carry no message text", async () => {
  const s = setup([{ jid: "G1" }], [{ text: "SECRETTEXT https://zoom.us/j/84512345678", ts: day(1), groupJid: "G1", messageId: "m1" }]);
  const c = await createWhatsappCandidateLoader({ fetchMessages: s.fetch, allowedGroups: ["G1"] })();
  assert.equal(c.length, 1);
  assert.ok(!JSON.stringify(c).includes("SECRETTEXT"));
});

test("allow-list enforced: only tracked AND allow-listed groups are queried and returned", async () => {
  const s = setup([{ jid: "G1" }, { jid: "G-evil" }], [{ text: "a", ts: day(1), groupJid: "G1" }, { text: "b", ts: day(1), groupJid: "G-evil" }]);
  const out = await s.fetch();
  assert.deepEqual(s.g.calls[0]!.filter, { jid: { $in: ["G1"] }, isTracked: true });
  assert.deepEqual(s.m.calls[0]!.filter.groupJid, { $in: ["G1"] });
  assert.deepEqual(out.map(m => m.groupId), ["G1"]);
});

test("no tracked allow-listed group: messages are never queried", async () => {
  const s = setup([], [{ text: "a", ts: day(1), groupJid: "G1" }]);
  assert.deepEqual(await s.fetch(), []);
  assert.equal(s.m.calls.length, 0);
  const empty = setup([{ jid: "G1" }], [], []);
  assert.deepEqual(await empty.fetch(), []);
  assert.equal(empty.g.calls.length, 0);
});

test("only the 7-day window is read, and deleted/textless messages are excluded", async () => {
  const s = setup([{ jid: "G1" }], []);
  await s.fetch();
  const f = s.m.calls[0]!.filter as { ts: { $gte: Date }; deletedAt: null; text: { $ne: null } };
  assert.equal(f.ts.$gte.toISOString(), day(7).toISOString());
  assert.equal(f.deletedAt, null);
  assert.deepEqual(f.text, { $ne: null });
});

test("flag off or empty allow-list: fetcher is never constructed and the opener never called", () => {
  let opened = 0;
  const open = async () => { opened++; throw new Error("x"); };
  assert.equal(createArchiverFetcherFromEnv({}, "/r", () => {}, open), undefined);
  assert.equal(createArchiverFetcherFromEnv({ LKB_WA_DISCOVERY: "0", WA_DISCOVERY_GROUPS: "G1" }, "/r", () => {}, open), undefined);
  assert.equal(createArchiverFetcherFromEnv({ LKB_WA_DISCOVERY: "1", WA_DISCOVERY_GROUPS: " " }, "/r", () => {}, open), undefined);
  assert.equal(opened, 0);
});

test("flag on: connection is lazy; a read failure logs a class only and returns no messages", async () => {
  const logs: string[] = [];
  let opened = 0;
  const f = createArchiverFetcherFromEnv({ LKB_WA_DISCOVERY: "1", WA_DISCOVERY_GROUPS: "G1" }, "/r", m => logs.push(m), async () => { opened++; throw new Error("mongodb://user:pw@host SECRETTEXT"); })!;
  assert.equal(opened, 0);
  assert.deepEqual(await f(), []);
  assert.equal(opened, 1);
  assert.ok(logs.length === 1 && !logs[0]!.includes("SECRETTEXT") && !logs[0]!.includes("pw"));
});
