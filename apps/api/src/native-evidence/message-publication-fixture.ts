/** Offline fixture uses actual ingest/review repository/materializer; no invented approval success. */
import type { Db, ClientSession } from "mongodb";
import type { WhatsAppMessage } from "@lkb/ingest";
import { createWhatsAppReviewWiring } from "../whatsapp/review/compose.js";
import { wireMongoFixture } from "../whatsapp/review/wire-fixtures.js";
export async function messagePublicationFixture(texts = ["Scholarship closes Friday.", "Visa applications open Monday."]) {
  const fx = wireMongoFixture(); let failTree = false; let onOperation: ((name: string, operation: string) => void) | undefined;
  const operations: { name: string; operation: string; session?: ClientSession }[] = [];
  const db = new Proxy(fx.db, { get(target, key) {
    if (key !== "collection") return Reflect.get(target, key, target);
    return (name: string) => { const coll = target.collection(name); return new Proxy(coll, { get(collection, method) {
      const value = Reflect.get(collection, method, collection);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const options = args[typeof method === "string" && ["updateOne", "replaceOne"].includes(method) ? 2 : 1] as { session?: ClientSession } | undefined;
        operations.push({ name, operation: String(method), ...(options?.session ? { session: options.session } : {}) });
        const result = onOperation?.(name, String(method)); void result;
        if (name === "tree_index" && method === "updateOne" && failTree) throw new Error("fixture tree publication failed");
        return value.apply(collection, args);
      };
    } }); };
  } });
  let messages: WhatsAppMessage[] = texts.map((text, i) => ({ messageId: `m${i}`, personId: "expert", displayName: "Expert", text,
    ts: new Date(Date.parse("2026-10-14T10:00:00Z") + i * 1000).toISOString() }));
  const wiring = createWhatsAppReviewWiring({ appDb: () => db,
    resolveOwner: async () => "111111111111111111111111", now: () => "2026-10-14T11:00:00Z",
    listGroups: async () => [{ groupJid: "group@g.us", ownerUserId: "111111111111111111111111", subject: "Private group title", trackedPersonCount: 1 }],
    fetchMessages: async () => messages });
  const result = await wiring.whatsapp.ingestGroup("tenant-a", "group@g.us");
  // W11 (R-32): a real link stamps `sourceMeta.whatsappLinkId`; the default studentData "no" (D-206, gate H-10) keeps the source eligible for external models.
  const ingested = fx.rows("sources").find(row => row._id === result.sourceId)!;
  await fx.db.collection("sources").updateOne({ _id: result.sourceId, tenantId: "tenant-a" } as never, { $set: { sourceMeta: { ...(ingested.sourceMeta as object | undefined), whatsappLinkId: "link-w" } } });
  fx.put("whatsapp_links", { _id: "link-w", tenantId: "tenant-a", studentData: "no", state: "active", live: true });
  operations.length = 0;
  return { fx, db, wiring, result, operations, failTree: () => { failTree = true; },
    /** Test hook: runs synchronously before each repository operation (e.g. to withdraw consent mid-transaction). */
    onOperation: (hook: ((name: string, operation: string) => void) | undefined) => { onOperation = hook; },
    edit: (i: number, text: string) => { messages = messages.map((m, j) => i === j ? { ...m, text } : m); } };
}
