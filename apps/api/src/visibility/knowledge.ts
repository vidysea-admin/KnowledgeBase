/** Read-time knowledge eligibility. No writes, provider calls or durable eligibility cache. */
import type { Db } from "mongodb";
import type { Claims, Sessions, Sources, TreeIndexNode, TreeIndexRootDocument, Turns } from "@lkb/core";
import { assertValidTenantId, withTenant } from "@lkb/db";
import { checkEvidence } from "../whatsapp/review/store.js";
import type { WhatsAppReviewCandidate } from "../whatsapp/review/detection.js";
import { WA_APPROVED_CLAIM_STATUS, WA_CLAIM_SOURCE, whatsAppClaimId, WHATSAPP_REVIEW_LOG } from "../whatsapp/review/publication-contract.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { createHash } from "node:crypto";
import { parseNativeSourceLocator, type NativeEvidenceResolver } from "../native-evidence/resolver.js";

export type VisibilityTurn = Pick<Turns, "_id" | "tenantId" | "sessionId" | "text"> & Partial<Pick<Turns, "speakerRef" | "speakerLabel" | "occurredAt">>;
export type VisibilityClaim = Pick<Claims, "_id" | "tenantId" | "text" | "status" | "evidence"> & Pick<Claims, "source"> & { waReview?: unknown; origin?: unknown };
import { VisibilityDeadlineError, withDeadline, newVisibilityRequestMemo, type VisibilityRequestMemo, type FilterTurnsOptions } from "./request-deadline.js";
export { VisibilityDeadlineError, withDeadline, newVisibilityRequestMemo, type VisibilityRequestMemo, type FilterTurnsOptions };
export interface KnowledgeVisibility {
  filterTurns<T extends VisibilityTurn>(tenantId: string, rows: readonly T[], options?: FilterTurnsOptions): Promise<T[]>;
  sessionVisible(tenantId: string, sessionId: string): Promise<boolean>;
  sourceVisible(tenantId: string, sourceId: string): Promise<boolean>;
  claimVisible(tenantId: string, claim: VisibilityClaim): Promise<boolean>;
  eligibleTurn(tenantId: string, sessionId: string, turnId: string, quote: string): Promise<boolean>;
  safeCitationSession(tenantId: string, sessionId: string, claim?: VisibilityClaim): Promise<Sessions | null>;
  trustedTree(tenantId: string, root: TreeIndexRootDocument | null): Promise<TreeIndexRootDocument | null>;
}
type ReadDb = Pick<Db, "collection">;
type Context = { session: Sessions; source: Sources };
type PendingReviewMarker = { tenantId: string; kind: "pending-invalidation"; groupJid: string };
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const sourceKinds = new Set(["recording", "document", "spreadsheet", "whatsapp-batch", "url"]);
const evidenceKey = (claim: Pick<Claims, "evidence">): string => JSON.stringify(claim.evidence.map(e => [e.sessionId, e.turnId, e.quote]));

export function createKnowledgeVisibility(db: ReadDb, nativeEvidence?: NativeEvidenceResolver): KnowledgeVisibility {
  const one = async <T extends { tenantId: string }>(name: string, tenantId: string, filter: object): Promise<T | null> => {
    const row = await db.collection<T>(name).findOne(withTenant<T>(tenantId, filter as never));
    return row?.tenantId === tenantId ? row as T : null;
  };
  const many = async <T extends { tenantId: string }>(name: string, tenantId: string, filter: object): Promise<T[]> => {
    const rows = await db.collection<T>(name).find(withTenant<T>(tenantId, filter as never)).toArray();
    if (rows.some(row => row.tenantId !== tenantId)) throw new Error("Invalid scoped knowledge rows");
    return rows as T[];
  };
  const context = async (tenantId: string, sessionId: string): Promise<Context | null> => {
    if (!text(sessionId)) return null;
    const session = await one<Sessions>("sessions", tenantId, { _id: sessionId });
    if (!session || session._id !== sessionId || !text(session.sourceId)) return null;
    const source = await one<Sources>("sources", tenantId, { _id: session.sourceId });
    if (!source || source._id !== session.sourceId || !sourceKinds.has(source.kind) || source.consent?.given === false) return null;
    // Existing review provenance cannot be bypassed by relabelling its source or re-pointing its session.
    if (source.kind !== "whatsapp-batch" && await one<WhatsAppReviewCandidate>("whatsapp_candidates", tenantId, { sessionId })) return null;
    return { source, session };
  };
  const pending = async (tenantId: string, ctx: Context): Promise<boolean> => {
    if (!text(ctx.source.path)) return true;
    // A marker precedes raw ingest writes and survives any failed/dead invalidation run.
    return (await db.collection<PendingReviewMarker>(WHATSAPP_REVIEW_LOG).findOne(withTenant<PendingReviewMarker>(tenantId,
      { kind: "pending-invalidation", groupJid: ctx.source.path }))) !== null;
  };
  const approved = async (tenantId: string, claim: VisibilityClaim, ctx: Context): Promise<WhatsAppReviewCandidate | null> => {
    if (ctx.source.kind !== "whatsapp-batch" || claim.source !== WA_CLAIM_SOURCE || claim.status !== WA_APPROVED_CLAIM_STATUS
        || claim.origin !== "speaker-statement" || !record(claim.waReview) || !text(claim.waReview.candidateId)) return null;
    if (await pending(tenantId, ctx)) return null;
    const candidate = await one<WhatsAppReviewCandidate>("whatsapp_candidates", tenantId, { _id: claim.waReview.candidateId });
    if (!candidate || candidate._id !== claim.waReview.candidateId || candidate.status !== "approved" || candidate.decision?.action !== "approved"
        || candidate.sourceId !== ctx.source._id || candidate.sessionId !== ctx.session._id
        || candidate.flags.some(flag => flag.kind === "personal-excluded") || claim._id !== whatsAppClaimId(candidate._id)
        || claim.text !== candidate.text || claim.waReview.kind !== candidate.kind
        || claim.waReview.approvedBy !== candidate.decision.actor || claim.waReview.approvedAt !== candidate.decision.at
        || evidenceKey(claim) !== JSON.stringify(candidate.evidence.map(e => [e.sessionId, e.turnId, e.quote]))) return null;
    // checkEvidence's inspected read path uses only collection().findOne; the read capability supplies no session/client.
    await checkEvidence(db as Db, tenantId, candidate);
    for (const evidence of candidate.evidence) {
      const effective = await currentTurn(tenantId, evidence.sessionId, evidence.turnId);
      if (!effective || effective.text !== evidence.quote || effective.speakerRef !== evidence.speakerRef
          || effective.speakerLabel !== evidence.speakerLabel || effective.occurredAt !== evidence.occurredAt) return null;
    }
    const latest = await one<WhatsAppReviewCandidate>("whatsapp_candidates", tenantId, { _id: candidate._id });
    // Recheck publication/decision after source validation: a withdrawn claim cannot survive as an earlier query snapshot.
    return latest && JSON.stringify(latest) === JSON.stringify(candidate) && await currentClaim(tenantId, claim)
      && !await pending(tenantId, ctx) ? candidate : null;
  };
  const currentClaim = async (tenantId: string, claim: VisibilityClaim): Promise<VisibilityClaim | null> => {
    if (claim.tenantId !== tenantId || !text(claim._id) || !text(claim.text) || !Array.isArray(claim.evidence) || !claim.evidence.length) return null;
    const current = await one<Claims>("claims", tenantId, { _id: claim._id }) as VisibilityClaim | null;
    return current && current._id === claim._id && current.text === claim.text && current.status === claim.status
      && current.source === claim.source && current.origin === claim.origin && evidenceKey(current) === evidenceKey(claim)
      && JSON.stringify(current.waReview) === JSON.stringify(claim.waReview) ? current : null;
  };
  const approvedClaims = async (tenantId: string, ctx: Context, turnId?: string): Promise<{ claim: VisibilityClaim; candidate: WhatsAppReviewCandidate }[]> => {
    const rows = await many<Claims>("claims", tenantId, { source: WA_CLAIM_SOURCE, status: WA_APPROVED_CLAIM_STATUS,
      "evidence.sessionId": ctx.session._id, ...(turnId ? { "evidence.turnId": turnId } : {}) });
    const out: { claim: VisibilityClaim; candidate: WhatsAppReviewCandidate }[] = [];
    for (const row of rows) {
      const candidate = await approved(tenantId, row, ctx);
      if (candidate) out.push({ claim: row, candidate });
    }
    return out;
  };
  const currentTurn = async (tenantId: string, sessionId: string, turnId: string): Promise<Turns | null> => {
    if (!text(turnId) || !text(sessionId)) return null;
    const raw = await one<Turns>("turns", tenantId, { _id: turnId, sessionId });
    if (!raw || raw._id !== turnId || raw.sessionId !== sessionId) return null;
    const [turn] = await readEffectiveTurns(db, tenantId, [raw], sessionId);
    return turn && turn._id === turnId && turn.sessionId === sessionId && text(turn.text) && text(turn.speakerRef)
      && Number.isFinite(turn.tStart) && Number.isFinite(turn.tEnd) && turn.tStart >= 0 && turn.tEnd >= turn.tStart ? turn : null;
  };
  const allowedTurn = async (tenantId: string, sessionId: string, turnId: string, quote: string, raw: boolean): Promise<boolean> => {
    if (!text(quote)) return false;
    const ctx = await context(tenantId, sessionId), turn = await currentTurn(tenantId, sessionId, turnId);
    if (!ctx || !turn || !turn.text.includes(quote)) return false;
    if (ctx.source.kind !== "whatsapp-batch") return true;
    for (const { candidate } of await approvedClaims(tenantId, ctx, turnId)) {
      if (raw && candidate.text !== turn.text) continue; // Metadata-only approval cannot unlock an unreviewed message sibling.
      if (!candidate.text.includes(quote)) continue; // Cited text itself must be in the approved proposal, not just its wider source context.
      if (candidate.evidence.some(e => e.sessionId === sessionId && e.turnId === turnId && e.quote === turn.text)) return true;
    }
    return false;
  };
  const guarded = async <T>(fallback: T, run: () => Promise<T>): Promise<T> => { try { return await run(); } catch { return fallback; } };
  const memoContext = (tenantId: string, sessionId: string, memo: VisibilityRequestMemo | undefined): Promise<Context | null> => {
    const key = JSON.stringify([tenantId, sessionId]);
    let hit = memo?.contexts.get(key) as Promise<Context | null> | undefined;
    if (!hit) { hit = context(tenantId, sessionId); memo?.contexts.set(key, hit); }
    return hit;
  };
  const RAW_CHUNK = 500, CONTEXT_PARALLEL = 8;
  /** Batched equivalent of the former per-row loop (D-206 K1): same verdict per row, one `$in` read of raw turns, one effective pass,
   * source context once per DISTINCT session. A read error rejects into the caller's fail-closed `[]`; WhatsApp-batch rows keep the strict per-turn proof. */
  const filterBatch = async <T extends VisibilityTurn>(tenantId: string, rows: readonly T[], options: FilterTurnsOptions): Promise<T[]> => {
    const candidates = rows.filter(row => row.tenantId === tenantId && text(row.sessionId) && text(row._id));
    if (!candidates.length) return [];
    const wanted = [...new Set(candidates.map(row => row._id))], raw = new Map<string, Turns>();
    const turnsColl = db.collection<Turns>("turns");
    for (let i = 0; i < wanted.length; i += RAW_CHUNK) {
      const ids = new Set(wanted.slice(i, i + RAW_CHUNK));
      const found = await turnsColl.find(withTenant<Turns>(tenantId, { _id: { $in: [...ids] } } as never)).toArray();
      // Re-verify locally: a row outside this tenant or this id set is never trusted, whatever the store returned.
      for (const turn of found) if (turn?.tenantId === tenantId && ids.has(turn._id)) raw.set(turn._id, turn);
    }
    const pairs = candidates.filter(row => raw.get(row._id)?.sessionId === row.sessionId);
    const effective = new Map<string, Turns>();
    if (pairs.length) {
      const projected = await readEffectiveTurns(db, tenantId, [...new Set(pairs.map(row => raw.get(row._id)!))]);
      for (const turn of projected) effective.set(turn._id, turn);
    }
    const survivors = pairs.filter(row => {
      const turn = effective.get(row._id);
      return turn !== undefined && turn._id === row._id && turn.sessionId === row.sessionId && text(turn.text) && text(turn.speakerRef)
        && Number.isFinite(turn.tStart) && Number.isFinite(turn.tEnd) && turn.tStart >= 0 && turn.tEnd >= turn.tStart
        && turn.text === row.text && !["speakerRef", "speakerLabel", "occurredAt"].some(key => Object.hasOwn(row, key)
          && row[key as keyof VisibilityTurn] !== turn[key as keyof VisibilityTurn]);
    });
    const sessions = [...new Set(survivors.map(row => row.sessionId))], contexts = new Map<string, Context | null>();
    for (let i = 0; i < sessions.length; i += CONTEXT_PARALLEL) {
      const slice = sessions.slice(i, i + CONTEXT_PARALLEL);
      const resolved = await Promise.all(slice.map(id => memoContext(tenantId, id, options.memo)));
      slice.forEach((id, index) => contexts.set(id, resolved[index] ?? null));
    }
    const out: T[] = [];
    for (const row of survivors) {
      const ctx = contexts.get(row.sessionId);
      if (!ctx || !text(row.text) || !effective.get(row._id)!.text.includes(row.text)) continue;
      if (ctx.source.kind !== "whatsapp-batch" || await allowedTurn(tenantId, row.sessionId, row._id, row.text, true)) out.push(row);
    }
    return out;
  };
  const claimVisible = (tenantId: string, claim: VisibilityClaim): Promise<boolean> => guarded(false, async () => {
    assertValidTenantId(tenantId, "knowledge.visibility");
    const current = await currentClaim(tenantId, claim);
    if (!current) return false;
    for (const evidence of current.evidence) {
      const ctx = await context(tenantId, evidence.sessionId), turn = await currentTurn(tenantId, evidence.sessionId, evidence.turnId);
      if (!ctx || !turn || (evidence.quote !== undefined && (!text(evidence.quote) || !turn.text.includes(evidence.quote)))) return false;
      if (ctx.source.kind === "whatsapp-batch") { if (!await approved(tenantId, current, ctx)) return false; }
      else if (current.source !== undefined || current.waReview !== undefined) return false;
    }
    return true;
  });
  const safeCitationSession = (tenantId: string, sessionId: string, claim?: VisibilityClaim): Promise<Sessions | null> => guarded(null, async () => {
    assertValidTenantId(tenantId, "knowledge.visibility");
    const ctx = await context(tenantId, sessionId);
    if (!ctx) return null;
    if (ctx.source.kind !== "whatsapp-batch") return ctx.session;
    const hasApproval = claim
      ? claim.tenantId === tenantId && claim.evidence.some(e => e.sessionId === sessionId) && Boolean(await approved(tenantId, claim, ctx))
      : (await approvedClaims(tenantId, ctx)).length > 0;
    if (!hasApproval || !text(ctx.session.date) || !/^\d{4}-\d{2}-\d{2}(?:T|$)/u.test(ctx.session.date)
        || !Number.isFinite(Date.parse(ctx.session.date)) || !ctx.session.status
        || !["pending", "processing", "done", "failed"].includes(ctx.session.status.transcribe)
        || !["pending", "processing", "done", "failed"].includes(ctx.session.status.index)) return null;
    return { _id: ctx.session._id, tenantId, sourceId: ctx.source._id, date: ctx.session.date,
      title: "Reviewed expert guidance", status: { transcribe: ctx.session.status.transcribe, index: ctx.session.status.index } };
  });
  return {
    claimVisible, safeCitationSession,
    eligibleTurn: (tenantId, sessionId, turnId, quote) => guarded(false, () => allowedTurn(tenantId, sessionId, turnId, quote, false)),
    sessionVisible: (tenantId, sessionId) => guarded(false, async () => {
      const ctx = await context(tenantId, sessionId); return ctx !== null && ctx.source.kind !== "whatsapp-batch";
    }),
    sourceVisible: (tenantId, sourceId) => guarded(false, async () => {
      if (!text(sourceId)) return false;
      const source = await one<Sources>("sources", tenantId, { _id: sourceId });
      return source !== null && source._id === sourceId && sourceKinds.has(source.kind) && source.consent?.given !== false && source.kind !== "whatsapp-batch"
        && !await one<WhatsAppReviewCandidate>("whatsapp_candidates", tenantId, { sourceId });
    }),
    filterTurns: async <T extends VisibilityTurn>(tenantId: string, rows: readonly T[], options: FilterTurnsOptions = {}): Promise<T[]> => {
      try {
        assertValidTenantId(tenantId, "knowledge.visibility");
        return await withDeadline(options.deadlineAt, () => filterBatch(tenantId, rows, options));
      } catch (error) { if (error instanceof VisibilityDeadlineError || options.throwOnError) throw error; return []; }
    },
    trustedTree: (tenantId, root) => guarded(null, async () => {
      assertValidTenantId(tenantId, "knowledge.visibility");
      if (root && (root.tenantId !== tenantId || root.node_id !== `tenant:${tenantId}` || root.level !== "tenant")) return null;
      if (root && Buffer.byteLength(JSON.stringify(root), "utf8") > 8_000_000) return null;
      const waSources = await many<Sources>("sources", tenantId, { kind: "whatsapp-batch" });
      const hasWa = waSources.length > 0 || Boolean(await one<WhatsAppReviewCandidate>("whatsapp_candidates", tenantId, {}));
      const seen = new Set<TreeIndexNode>(), ids = new Set<string>(), tainted = new Set<TreeIndexNode>();
      const bounded = (value: string) => { let output = ""; for (const point of value) { if (Buffer.byteLength(output + point, "utf8") > 768) break; output += point; } return output; };
      const prune = async (node: TreeIndexNode, inherited?: string, depth = 0, nativeBinding?: Record<string, unknown>): Promise<TreeIndexNode | null> => {
        if (!node || seen.has(node) || ids.has(node.node_id) || seen.size >= 10000 || depth > 64 || !Array.isArray(node.children)) throw new Error("Invalid knowledge tree");
        seen.add(node);
        ids.add(node.node_id);
        if ((node.tenantId !== undefined && node.tenantId !== tenantId) || !text(node.node_id)
            || !(node.node_id === `tenant:${tenantId}` || node.node_id.startsWith(`${tenantId}/`) || node.node_id.startsWith(`tenant:${tenantId}/`))
            || !text(node.title) || typeof node.summary !== "string") return null;
        if (node.level === "native-source") {
          if (!nativeEvidence || depth !== 1 || inherited || !record(node.evidence) || !node.children.length) return null;
          const keys = node.evidence.documentId !== undefined ? ["sourceId", "documentId", "documentSourceId", "revisionHash", "headRevision"] : ["sourceId", "revisionHash", "threadId", "messageId"];
          if (Object.keys(node.evidence).length !== keys.length || !keys.every(k => Object.hasOwn(node.evidence!, k))) return null;
          const binding = Object.fromEntries(keys.map(k => [k, node.evidence![k]]));
          const encoded = JSON.stringify(binding.documentId !== undefined ? binding : ["message", binding]);
          if (node.node_id !== `${tenantId}/native-source:${createHash("sha256").update(encoded).digest("hex")}`) return null;
          const children: TreeIndexNode[] = [];
          for (const child of node.children) { const safe = await prune(child, undefined, depth + 1, binding); if (safe) children.push(safe); }
          if (!children.length) return null;
          const summary = bounded(children.map(c => c.summary).join("\n"));
          const safe: TreeIndexNode = { node_id: node.node_id, level: "native-source", title: "Current source passages", summary, children,
            evidence: { ...binding, routingSummary: summary } };
          tainted.add(safe); return safe;
        }
        if (node.level === "native-passage") {
          if (!nativeEvidence || !nativeBinding || depth !== 2 || node.children.length || !record(node.evidence)) return null;
          const locator = parseNativeSourceLocator(node.evidence.sourceLocator);
          if (!locator || Object.keys(node.evidence).length !== Object.keys(nativeBinding).length + 1 ||
            !Object.entries(nativeBinding).every(([key, value]) => Object.hasOwn(node.evidence!, key) && node.evidence![key] === value && (locator as unknown as Record<string, unknown>)[key] === value)) return null;
          const parentId = node.node_id.slice(0, node.node_id.lastIndexOf("/passage:"));
          const expected = locator.kind === "document-page" ? `${parentId}/passage:${locator.pageNumber}:${locator.passage.start}` : `${parentId}/passage:${locator.passage.start}`;
          if (node.node_id !== expected || parentId !== `${tenantId}/native-source:${createHash("sha256").update(JSON.stringify(locator.kind === "document-page" ? nativeBinding : ["message", nativeBinding])).digest("hex")}`) return null;
          const resolved = await nativeEvidence.resolve(tenantId, locator);
          if (!resolved || JSON.stringify(resolved.sourceLocator) !== JSON.stringify(locator) || typeof resolved.quote !== "string" || !resolved.quote.trim()) return null;
          const safe: TreeIndexNode = { node_id: node.node_id, level: "native-passage", title: bounded(resolved.title ?? "Current source passage"), summary: resolved.quote, children: [],
            evidence: { ...nativeBinding, sourceLocator: resolved.sourceLocator, routingSummary: bounded(resolved.quote) } };
          tainted.add(safe); return safe;
        }
        if (nativeBinding || !["tenant", "year", "month", "session", "topic", "org"].includes(node.level)) return null;
        const ownRef = node.evidence?.sessionRef;
        if (ownRef !== undefined && !text(ownRef)) return null;
        const refs = node.evidence?.sessionRefs;
        if (refs !== undefined && (!Array.isArray(refs) || !refs.every(text))) return null;
        const direct = ownRef ?? inherited;
        if (["session", "topic", "org"].includes(node.level) && !direct) return null;
        for (const ref of new Set([...(direct ? [direct] : []), ...(Array.isArray(refs) ? refs : [])])) {
          const ctx = await context(tenantId, ref);
          if (!ctx || ctx.source.kind === "whatsapp-batch") return null;
        }
        const children: TreeIndexNode[] = [];
        for (const child of node.children) { const safe = await prune(child, direct, depth + 1); if (safe) children.push(safe); }
        if (node.level !== "tenant" && !direct && !children.length) return null;
        const changed = children.length !== node.children.length || children.some(child => tainted.has(child))
          || (hasWa && ["tenant", "year", "month"].includes(node.level));
        const safe: TreeIndexNode = { node_id: node.node_id, title: changed ? "Reviewed knowledge" : node.title, level: node.level,
          summary: changed ? "" : node.summary, children,
          ...(direct ? { evidence: { sessionRef: direct, ...(Array.isArray(refs) ? { sessionRefs: refs } : {}) } } : {}) };
        if (changed) tainted.add(safe);
        return safe;
      };
      const clean = root ? await prune(root) : null;
      const approvedRows = await many<Claims>("claims", tenantId, { source: WA_CLAIM_SOURCE, status: WA_APPROVED_CLAIM_STATUS });
      const detached = new Map<string, { text: string[]; claimIds: string[]; turnIds: Set<string> }>();
      for (const claim of approvedRows) {
        if (!await claimVisible(tenantId, claim)) continue;
        const sessionId = claim.evidence[0]?.sessionId;
        if (!sessionId) continue;
        const ctx = await context(tenantId, sessionId), candidate = ctx ? await approved(tenantId, claim, ctx) : null;
        // The hydrator consumes real turns. A metadata-only candidate must not admit the unrelated source-message body.
        if (!candidate || candidate.kind === "attachment" || !candidate.evidence.every(e => e.quote === candidate.text)) continue;
        const group = detached.get(sessionId) ?? { text: [], claimIds: [], turnIds: new Set<string>() };
        group.text.push(claim.text); group.claimIds.push(claim._id); candidate.evidence.forEach(e => group.turnIds.add(e.turnId));
        detached.set(sessionId, group);
      }
      if (!clean && !detached.size) return null;
      const result: TreeIndexRootDocument = { ...(clean ?? { node_id: `tenant:${tenantId}`, title: "Knowledge", level: "tenant" as const, summary: "", children: [] }), tenantId };
      for (const [sessionId, group] of detached) result.children.push({
        node_id: `tenant:${tenantId}/reviewed:${encodeURIComponent(sessionId)}`, title: "Reviewed expert guidance", level: "session",
        summary: [...new Set(group.text)].join("\n"), children: [],
        evidence: { sessionRef: sessionId, claimIds: group.claimIds, turnRefs: [...group.turnIds] },
      });
      return Buffer.byteLength(JSON.stringify(result), "utf8") <= 8_000_000 ? result : null;
    }),
  };
}
