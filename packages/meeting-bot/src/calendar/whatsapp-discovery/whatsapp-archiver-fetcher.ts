/**
 * whatsapp-archiver-fetcher.ts (w29-wafetch, D-184). The real, READ-ONLY message fetcher for the WhatsApp candidate loader.
 * Reads the archiver's `groups` (tracked AND allow-listed jids) and `messages` (last 7 days) with a fixed projection
 * {text, ts, groupJid, messageId}: no sender/person field is ever requested. The text goes only to the extractor, in memory.
 * Default OFF: nothing is constructed or connected unless LKB_WA_DISCOVERY=1 and WA_DISCOVERY_GROUPS is non-empty; the Mongo
 * connection is opened lazily on the first fetch. Any failure logs a class only (never text) and yields no messages.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { parseWaDiscoveryGroups, type WaRawMessage } from "./whatsapp-candidate-loader.js";

export interface ArchiverCollection {
  find(filter: Record<string, unknown>, options: { projection: Record<string, 0 | 1>; limit: number; maxTimeMS: number }): { toArray(): Promise<unknown[]> };
}
export interface ArchiverCollections { groups: ArchiverCollection; messages: ArchiverCollection }

export const WA_WINDOW_DAYS = 7;
export const GROUP_PROJECTION = { _id: 0, jid: 1 } as const;
export const MESSAGE_PROJECTION = { _id: 0, text: 1, ts: 1, groupJid: 1, messageId: 1 } as const;
const MAX_MESSAGES = 5000, MAX_TIME_MS = 15000;

export function createArchiverMessageFetcher(deps: { open: () => Promise<ArchiverCollections>; allowedGroups: readonly string[]; now: () => Date }): () => Promise<WaRawMessage[]> {
  const allowed = deps.allowedGroups.filter(g => g.length > 0);
  return async () => {
    if (allowed.length === 0) return [];
    const { groups, messages } = await deps.open();
    const tracked = (await groups.find({ jid: { $in: allowed }, isTracked: true }, { projection: GROUP_PROJECTION, limit: allowed.length, maxTimeMS: MAX_TIME_MS }).toArray())
      .map(g => (g as { jid?: unknown }).jid).filter((j): j is string => typeof j === "string" && allowed.includes(j));
    if (tracked.length === 0) return [];
    const since = new Date(deps.now().getTime() - WA_WINDOW_DAYS * 86_400_000);
    const rows = await messages.find({ groupJid: { $in: tracked }, deletedAt: null, text: { $ne: null }, ts: { $gte: since } },
      { projection: MESSAGE_PROJECTION, limit: MAX_MESSAGES, maxTimeMS: MAX_TIME_MS }).toArray();
    const out: WaRawMessage[] = [];
    for (const r of rows as Array<{ text?: unknown; ts?: unknown; groupJid?: unknown; messageId?: unknown }>) {
      if (typeof r.text !== "string" || typeof r.groupJid !== "string" || !tracked.includes(r.groupJid)) continue;
      const ts = r.ts instanceof Date ? r.ts.toISOString() : typeof r.ts === "string" || typeof r.ts === "number" ? r.ts : undefined;
      if (ts === undefined) continue;
      out.push({ text: r.text, ts, groupId: r.groupJid, ...(typeof r.messageId === "string" ? { messageId: r.messageId } : {}) });
    }
    return out;
  };
}

/** Lazily opens the archiver Mongo (WHATSAPP_MONGO_URL / WHATSAPP_MONGO_DB). The driver lives in apps/api, so it is resolved from there. */
export function mongoArchiverOpener(env: NodeJS.ProcessEnv, repoRoot: string): () => Promise<ArchiverCollections> {
  let cached: Promise<ArchiverCollections> | undefined;
  return () => (cached ??= (async () => {
    const url = env.WHATSAPP_MONGO_URL?.trim();
    if (!url) throw new Error("WHATSAPP_MONGO_URL not set");
    const { MongoClient } = createRequire(path.join(repoRoot, "apps", "api", "package.json"))("mongodb") as { MongoClient: new (u: string, o: object) => { connect(): Promise<unknown>; db(n: string): { collection(n: string): ArchiverCollection } } };
    const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(env.WHATSAPP_MONGO_DB?.trim() || "whatsapp_msg");
    return { groups: db.collection("groups"), messages: db.collection("messages") };
  })().catch(e => { cached = undefined; throw e; }));
}

/** Production wiring. Undefined unless LKB_WA_DISCOVERY=1 AND WA_DISCOVERY_GROUPS is non-empty (then the loader's default empty fetcher stays). */
export function createArchiverFetcherFromEnv(env: NodeJS.ProcessEnv, repoRoot: string, log: (msg: string) => void,
  open: () => Promise<ArchiverCollections> = mongoArchiverOpener(env, repoRoot), now: () => Date = () => new Date()): (() => Promise<WaRawMessage[]>) | undefined {
  if (env.LKB_WA_DISCOVERY !== "1") return undefined;
  const allowedGroups = parseWaDiscoveryGroups(env.WA_DISCOVERY_GROUPS);
  if (allowedGroups.length === 0) return undefined;
  const fetcher = createArchiverMessageFetcher({ open, allowedGroups, now });
  return async () => {
    try { return await fetcher(); } catch (e) { log(`wa-discovery: archiver read failed (${e instanceof Error ? e.name : "error"}); no messages this tick`); return []; }
  };
}
