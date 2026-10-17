import type { Collection, Db, Document, Filter, FindOneOptions, FindOptions } from "mongodb";
import type { Turns } from "@lkb/core";
import { scopedCollection } from "@lkb/db";
import { prefilterMatches, type TurnPrefilter } from "../search-prefilter.js";
import { readEffectiveTurns } from "./effective-reader.js";
import { headId, type ReviewHead } from "./store.js";

const MAX_CANDIDATES = 5000;
const MAX_READ_ROWS = 20000;
const MAX_QUERIES = 256;
const READ_TIME_MS = 5000;

/** Bounds include the effective reader's source-ID reconciliation reads, not just search
 * candidates. A ceiling is an error: returning a prefix would silently lose search hits. */
function boundedSearchDb(db: Pick<Db, "collection">): Pick<Db, "collection"> {
  const deadline = Date.now() + READ_TIME_MS;
  let queries = 0, rowsRead = 0;
  const budget = () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || ++queries > MAX_QUERIES) throw new Error("Transcript search read limit exceeded");
    return Math.min(1500, remaining);
  };
  const account = (count: number) => {
    rowsRead += count;
    if (Date.now() > deadline || rowsRead > MAX_READ_ROWS) throw new Error("Transcript search read limit exceeded");
  };
  return { collection(name: string) {
    const raw = db.collection(name);
    return new Proxy(raw, { get(target, property) {
      if (property === "find") return (filter: Document = {}, options: FindOptions = {}) => {
        const timeoutMS = budget();
        const cursor = target.find(filter, { ...options, maxTimeMS: timeoutMS, timeoutMS, timeoutMode: "cursorLifetime" }).limit(MAX_CANDIDATES + 1);
        return new Proxy(cursor, { get(current, key) {
          if (key === "toArray") return async () => {
            const found = await current.toArray();
            account(found.length);
            if (found.length > MAX_CANDIDATES) throw new Error("Transcript search candidate limit exceeded");
            return found;
          };
          const value: unknown = Reflect.get(current, key);
          return typeof value === "function" ? value.bind(current) : value;
        } });
      };
      if (property === "findOne") return async (filter: Document, options: FindOneOptions = {}) => {
        const timeoutMS = budget();
        const found = await target.findOne(filter, { ...options, maxTimeMS: timeoutMS, timeoutMS });
        account(found ? 1 : 0);
        return found;
      };
      throw new Error(`Unsupported transcript search operation: ${String(property)}`);
    } }) as Collection<Document>;
  } } as Pick<Db, "collection">;
}

/** Search retains the existing token/filter semantics. Raw originals provide candidates;
 * current matching overlay text adds corrected-only hits. Scoring must use the returned
 * effective projection, after the caller applies its ordinary source visibility policy. */
export async function readSearchCandidateTurns(db: Pick<Db, "collection">, tenantId: string, prefilter: TurnPrefilter | null): Promise<Turns[]> {
  const bounded = boundedSearchDb(db);
  const turns = scopedCollection<Turns>(bounded as Db, "turns")(tenantId);
  const heads = scopedCollection<ReviewHead>(bounded as Db, "transcript_reviews")(tenantId);
  if (prefilter === null) return [];
  const filter = structuredClone(prefilter);
  if (!Array.isArray(filter.$or) || !filter.$or.length || filter.$or.length > 256 || filter.$or.some((c) =>
    typeof c.text?.$regex !== "string" || c.text.$regex.length > 512 || c.text.$options !== "i")) throw new Error("Invalid transcript search prefilter");
  // Build the driver's typed shape from the already validated canonical clauses. This
  // preserves every regex/options pair; no token derivation or type assertion is needed.
  const rawFilter: Filter<Turns> = { $or: filter.$or.map((clause) => ({ text: { ...clause.text } })) };
  const raw = await turns.find(rawFilter).toArray();
  const matched = await heads.find({ $or: filter.$or.map((c) => ({ "overlay.text": { ...c.text } })) }).toArray();
  const byId = new Map(raw.map((row) => [row._id, row]));
  for (const head of matched) {
    if (head.tenantId !== tenantId || !head.sessionId || head._id !== headId(tenantId, head.sessionId)) throw new Error("Transcript review scope mismatch");
    if (head.overlay.length > MAX_CANDIDATES) throw new Error("Transcript search candidate limit exceeded");
    const ids = head.overlay.filter((o) => prefilterMatches(filter, o.text)).map((o) => o.turnId);
    if (!ids.length) continue;
    const found = await turns.find({ sessionId: head.sessionId, _id: { $in: ids } }).toArray();
    if (found.some((row) => row.tenantId !== tenantId || row.sessionId !== head.sessionId)) throw new Error("Transcript search scope mismatch");
    // Even an entirely vanished matching source must reach reconciliation and fail.
    await readEffectiveTurns(bounded, tenantId, found, head.sessionId);
    for (const row of found) byId.set(row._id, row);
    if (byId.size > MAX_CANDIDATES) throw new Error("Transcript search candidate limit exceeded");
  }
  const effective = await readEffectiveTurns(bounded, tenantId, [...byId.values()]);
  // Query/turn reads and projection are separate operations. Do not present an old matching
  // head as current after a competing correction commits during that read sequence.
  for (const head of matched) {
    const current = await heads.findOne({ _id: head._id, sessionId: head.sessionId });
    if (!current || current.revision !== head.revision) throw new Error("Transcript search review changed; retry search");
  }
  return effective;
}
