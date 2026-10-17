/** Approved message authority. All source/decision/effective-text reads share a Mongo snapshot. */
import type { Db, ClientSession } from "mongodb";
import type { Claims, MessageSourceLocator, Sessions, Sources, Turns } from "@lkb/core";
import { assertValidTenantId, withTenant } from "@lkb/db";
import { createKnowledgeVisibility, type VisibilityClaim } from "../visibility/knowledge.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import type { WhatsAppReviewCandidate } from "../whatsapp/review/detection.js";
import type { NativeCurrentUnit } from "./resolver.js";
import { parseNativeSourceLocator } from "./resolver.js";
import { messageRevision, messagePassages } from "./message-revision.js";

type MessageUnit = Extract<NativeCurrentUnit, { kind: "message" }> & { candidateId: string };
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const active = (value: object) => { const v = value as Record<string, unknown>; return v.deletedAt == null && v.published !== false
  && !["revoked", "deleted", "unpublished"].includes(String(v.status)); };
const unavailable = () => new Error("whatsapp_native_authority_unavailable");

export function createWhatsAppNativeAuthority(db: Db, options: { session?: ClientSession; readView?: Pick<Db, "collection"> } = {}) {
  async function snapshot<T>(tenantId: string, run: (reads: Db) => Promise<T>): Promise<T> {
    assertValidTenantId(tenantId, "whatsapp.native");
    let session: ClientSession | undefined; let readFailed = false;
    try {
      if (options.session && options.readView) throw unavailable();
      // A trusted outer snapshot view already pins its active session on every read.
      // It must not create or end a second transaction while that view is in use.
      if (!options.readView) session = options.session ?? db.client.startSession();
      const currentSession = session;
      if (options.session && (typeof options.session.inTransaction !== "function" || !options.session.inTransaction())) throw unavailable();
      // The capability deliberately exposes no write methods or session escape hatch.
      const reads = new Proxy(db, { get(target, key) {
        if (key !== "collection") throw unavailable();
        return (name: string) => {
          const collection = (options.readView ?? target).collection(name);
          return new Proxy(collection, { get(coll, method) {
            if (method === "findOne") return async (filter: object, options: object = {}) => {
              try { return await coll.findOne(filter, { ...options, session: currentSession }); }
              catch { readFailed = true; throw unavailable(); }
            };
            if (method === "find") return (filter: object, options: object = {}) => {
              let cursor: ReturnType<typeof coll.find>;
              try { cursor = coll.find(filter, { ...options, session: currentSession }); }
              catch { readFailed = true; throw unavailable(); }
              const view: unknown = new Proxy(cursor, { get(actual, member) {
                if (member === "toArray") return async () => {
                  try { return await actual.toArray(); } catch { readFailed = true; throw unavailable(); }
                };
                if (member === "limit") return (limit: number) => { actual.limit(limit); return view; };
                throw unavailable();
              } });
              return view;
            };
            throw unavailable();
          } });
        };
      } });
      const execute = async () => {
        if (!options.readView && (!currentSession || typeof currentSession.inTransaction !== "function" || !currentSession.inTransaction())) throw unavailable();
        readFailed = false;
        const value = await run(reads);
        if (readFailed) throw unavailable(); // guarded reader must not hide infrastructure failure.
        return { value };
      };
      let result: { value: T } | undefined;
      if (options.readView || options.session) result = await execute();
      else {
        if (!session) throw unavailable();
        result = await session.withTransaction(execute, { readConcern: { level: "snapshot" }, readPreference: "primary" });
      }
      if (!result) throw unavailable();
      return result.value;
    } catch { throw unavailable(); }
    finally { if (session && !options.session) { try { await session.endSession(); } catch { throw unavailable(); } } }
  }

  async function source(reads: Db, tenantId: string, sourceId: string): Promise<Sources | null> {
    const row = await reads.collection<Sources>("sources").findOne(withTenant<Sources>(tenantId, { _id: sourceId }));
    return row && row.tenantId === tenantId && row._id === sourceId && row.kind === "whatsapp-batch"
      && row.consent?.given === true && active(row) ? row : null;
  }

  async function fromClaim(reads: Db, tenantId: string, src: Sources, claim: VisibilityClaim): Promise<MessageUnit | null> {
    if (claim.tenantId !== tenantId || !active(claim) || !record(claim.waReview) || typeof claim.waReview.candidateId !== "string") return null;
    const candidate = await reads.collection<WhatsAppReviewCandidate>("whatsapp_candidates")
      .findOne(withTenant<WhatsAppReviewCandidate>(tenantId, { _id: claim.waReview.candidateId }));
    if (!candidate || candidate.tenantId !== tenantId || candidate.sourceId !== src._id || candidate.kind === "attachment"
      || !Array.isArray(candidate.evidence) || candidate.evidence.length !== 1 || !active(candidate) || candidate.status !== "approved") return null;
    const evidence = candidate.evidence[0]!;
    const session = await reads.collection<Sessions>("sessions").findOne(withTenant<Sessions>(tenantId, { _id: evidence.sessionId, sourceId: src._id }));
    const raw = await reads.collection<Turns>("turns").findOne(withTenant<Turns>(tenantId, { _id: evidence.turnId, sessionId: evidence.sessionId }));
    if (!session || session.tenantId !== tenantId || !active(session) || !raw || raw.tenantId !== tenantId || !active(raw)) return null;
    let turn: Turns | undefined;
    try { [turn] = await readEffectiveTurns(reads, tenantId, [raw], session._id); } catch { return null; }
    if (!turn || !await createKnowledgeVisibility(reads).claimVisible(tenantId, claim)) return null;
    if (!turn.text.trim() || turn.text.length > 2_000_000) return null;
    const revisionHash = messageRevision(tenantId, src, candidate, turn);
    return { kind: "message", tenantId, sourceId: src._id, revisionHash, currentRevisionHash: revisionHash,
      eligible: true, candidateId: candidate._id, threadId: session._id, messageId: turn._id, text: turn.text, title: "Approved WhatsApp message" };
  }

  return {
    async loadCurrent(tenantId: string, input: MessageSourceLocator): Promise<MessageUnit | null> {
      const locator = parseNativeSourceLocator(input);
      if (!locator || locator.kind !== "message") return null;
      return snapshot(tenantId, async reads => {
        const src = await source(reads, tenantId, locator.sourceId); if (!src) return null;
        const claims = await reads.collection<Claims>("claims").find(withTenant<Claims>(tenantId, { source: "whatsapp", status: "verified",
          "evidence.sessionId": locator.threadId, "evidence.turnId": locator.messageId }), { limit: 129 }).toArray();
        if (claims.length > 128) throw unavailable();
        for (const claim of claims) {
          const unit = await fromClaim(reads, tenantId, src, claim);
          if (unit && unit.threadId === locator.threadId && unit.messageId === locator.messageId && unit.revisionHash === locator.revisionHash) return unit;
        }
        return null;
      });
    },
    async listCurrent(tenantId: string, identity: { sourceId: string; revisionHash?: string }, limit = 128): Promise<readonly MessageSourceLocator[]> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 128) throw unavailable();
      return snapshot(tenantId, async reads => {
        const src = await source(reads, tenantId, identity.sourceId); if (!src) return [];
        const sessions = await reads.collection<Sessions>("sessions").find(withTenant<Sessions>(tenantId, { sourceId: src._id }), { limit: 129 }).toArray();
        if (sessions.length > 128) throw unavailable();
        const claims = await reads.collection<Claims>("claims").find(withTenant<Claims>(tenantId, { source: "whatsapp", status: "verified",
          "evidence.sessionId": { $in: sessions.filter(s => s.tenantId === tenantId && active(s)).map(s => s._id) } }), { limit: 129 }).toArray();
        if (claims.length > 128) throw unavailable();
        const out: MessageSourceLocator[] = []; const seen = new Set<string>();
        for (const claim of claims.sort((a, b) => a._id.localeCompare(b._id))) {
          const unit = await fromClaim(reads, tenantId, src, claim);
          if (!unit || (identity.revisionHash && unit.revisionHash !== identity.revisionHash) || seen.has(unit.messageId)) continue;
          seen.add(unit.messageId);
          for (const { locator } of messagePassages(unit, unit.text)) {
            out.push(locator);
            if (out.length > limit) throw unavailable();
          }
        }
        return out;
      });
    },
  };
}
