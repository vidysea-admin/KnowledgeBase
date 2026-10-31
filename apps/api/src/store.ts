/**
 * apps/api/src/store.ts — T-009 C3. Real Mongo-backed `ApiKeyStore` and `TreeStore` (the
 * production side of the injected `auth.ts`/`routes/ask.ts` interfaces). API key lookup resolves
 * the initially unknown tenant; `api_keys` and `tree_index` use the existing `@lkb/db.getDb()`
 * accessor while other collections use their tenant-scoped accessors.
 */
import { randomUUID, randomBytes } from "node:crypto";
import {
  getDb, assertValidTenantId, scopedCollection, jobs as jobsColl, createEvalRun, recordScore as recordEvalRunScore,
  sessions as sessionsColl, sources as sourcesColl, gaps as gapsColl,
  claims as claimsColl, turns as turnsColl, sessionPages as sessionPagesColl, graphEdges as graphEdgesColl,
  listAll as listAllMeetingCandidates, createIfNew as createMeetingCandidateIfNew,
  decide as decideMeetingCandidate, get as getTrustedSender, recordApproval as recordSenderApproval,
} from "@lkb/db";
import type { ApiKeys, Jobs, TreeIndexNode, TreeIndexRootDocument } from "@lkb/core";
import type { WriteJobFn } from "@lkb/ai";
import { buildKnowledgeGraph, treeIndexRootFilter, type KnowledgeGraph } from "@lkb/index";
import type { ApiKeyStore, VerifiedKey } from "./auth.js";
import type { TreeStore } from "./routes/ask/ask.js";
import { createKnowledgeVisibility } from "./visibility/knowledge.js";
import type { EvalRunStore } from "./routes/compete/compete.js";
import { createHash } from "node:crypto";
import { createWatchedSource, listActive as listActiveWatchedSources, recordFetch as recordWatchedFetch } from "@lkb/db";
import { createGuardedFetcher, resolveAll, httpRequest, runWatchedSources, type WatchedRunDeps } from "@lkb/ingest";
import type { WatchedSourceDeps } from "./routes/watched-sources.js";
import type { BrainReadDeps, SessionDetail } from "./routes/brain.js";
import type { Citation, CitationEvidence, CitationsDeps } from "./routes/citations.js";
import type { HealthDeps } from "./routes/health.js";
import { probeMongoHealth } from "./health-probe.js";
import type { GraphReadDeps } from "./routes/graph.js";
import type { ApiKeySummary, KeysDeps } from "./routes/keys.js";
import { cleanGmailSummary, type MeetingCandidatesDeps, type MeetingCandidate } from "./routes/meeting-candidates.js";
import type { GmailScanSummary } from "@lkb/core";
import type { JoinRulesDeps } from "./join-rules/deps.js";
import { evaluateJoinRules, normalizeDomain, normalizeEmail, validateJoinRuleSet, validateJoinRuleState } from "../../../packages/ingest/src/join-policy/join-rules.js";
import { recognise } from "./join-rules/calendar-link-extract.js";
import { scanGmailForMeetingCandidates } from "./gws/gws-gmail.js";
import { isRefusedWorkDb } from "./db-name.js";
import { sha256Hex } from "./hash.js";
import { trustedBrainReads, trustedCitationReads, trustedTreeReads, trustedGraphReads } from './composition/integrations/trusted-readers.js';

/** `schema/index.json`'s top-level keys ARE the canonical list of real Mongo collections (its
 * own comment excludes `features_event` deliberately — a JSONL-file schema, not a collection) —
 * reused here instead of a second hand-maintained list that could drift from it. */

/** `tree_index` roots through the shared tenant scope (ISS-AUTHTENANT-002): the accessor validates the
 * tenant and merges it into every filter, so a root can no longer be read for an unvalidated or missing tenant. */
type TreeRoot = TreeIndexRootDocument & { _id: string };
const treeIndexColl = (tenantId: string) => scopedCollection<TreeRoot>(getDb(), "tree_index")(tenantId);
const apiKeysColl = (tenantId: string) => scopedCollection<ApiKeys>(getDb(), "api_keys")(tenantId);

export function createMongoApiKeyStore(): ApiKeyStore {
  return {
    async verify(key: string): Promise<VerifiedKey | null> {
      const doc = await getDb().collection<ApiKeys>("api_keys").findOne({ keyHash: sha256Hex(key) });
      if (!doc || doc.revokedAt) return null;
      return { tenantId: doc.tenantId, scopes: doc.scopes ?? [], keyId: doc._id };
    },
  };
}

/** W11/R-32 (G1): drops from the tree /ask and /route read every node whose evidence names a WhatsApp source or session not studentData "no" (or unresolvable). One visibility (one memo) per load. */
export function createExternalModelTreeStore(inner: TreeStore, database: () => Parameters<typeof createKnowledgeVisibility>[0] = getDb): TreeStore {
  const prune = async (tenantId: string, tree: TreeIndexNode | null): Promise<TreeIndexNode | null> => {
    if (!tree) return tree;
    const visibility = createKnowledgeVisibility(database());
    const keep = async (node: TreeIndexNode): Promise<TreeIndexNode | null> => {
      const ev = (node.evidence ?? {}) as Record<string, unknown>, many = ev.sessionRefs === undefined ? [] : Array.isArray(ev.sessionRefs) ? ev.sessionRefs : [null];
      const checks = [...(String(node.level).startsWith('native-') ? [visibility.externalModelEligible(tenantId, ev.sourceId as string)] : []),
        ...[...(ev.sessionRef === undefined ? [] : [ev.sessionRef]), ...many].map(ref => visibility.externalModelEligibleSession(tenantId, ref as string))];
      if (!(await Promise.all(checks)).every(Boolean)) return null;
      return { ...node, children: (await Promise.all(node.children.map(keep))).filter((child): child is TreeIndexNode => child !== null) };
    };
    return keep(tree);
  };
  return {
    load: async (tenantId) => prune(tenantId, await inner.load(tenantId)),
    ...(inner.loadWithExclusions ? { loadWithExclusions: async (tenantId: string) => { const r = await inner.loadWithExclusions!(tenantId); return { ...r, tree: await prune(tenantId, r.tree) }; } } : {}),
  };
}

/** One root node per tenant, `level: "tenant"`, `node_id` == tenantId (buildTree's output shape). */
export function createMongoTreeStore(nativeEvidence?: Parameters<typeof trustedTreeReads>[1]): TreeStore {
  const guarded = trustedTreeReads(getDb, nativeEvidence);
  const valid = (tenantId: string): boolean => { try { assertValidTenantId(tenantId, 'treeStore.load'); return true; } catch { return false; } };
  return {
    async load(tenantId) { return valid(tenantId) ? guarded.load(tenantId) : null; },
    async loadWithExclusions(tenantId) { return valid(tenantId) ? guarded.loadWithExclusions!(tenantId) : { tree: null, excluded: { total: 0, reasons: {} } }; },
  };
}

/** Mongo-backed `EvalRunStore` (T-012 C3) — thin wrapper over `@lkb/db`'s `eval-runs.ts`
 * accessor, same composition-root pattern as the two stores above. */
export function createMongoEvalRunStore(): EvalRunStore {
  return {
    create: (tenantId, doc) => createEvalRun(tenantId, doc),
    recordScore: (tenantId, id, update) => recordEvalRunScore(tenantId, id, update),
  };
}

/** `askV2`'s own audit-trail writer (T-019 C5 `jobs` ledger) — separate from the router's
 * per-attempt writes in `production.ts`; both land in the same collection. */
export function createMongoJobWriter(): WriteJobFn {
  return async (entry) => {
    assertValidTenantId(entry?.tenantId, "jobWriter");
    await jobsColl(entry.tenantId).insertOne({ _id: randomUUID(), ...entry });
  };
}

/** Real `BrainReadDeps` (routes/brain.ts) — wraps the already-real `@lkb/db` accessors, same
 * composition-root pattern as every store above. Claims/turns don't carry a bare `sessionId`
 * field (claims relate via `evidence[].sessionId`; turns via their own `sessionId`), so the
 * session-detail join queries each accordingly rather than assuming a shared shape. */
export function createMongoBrainReadDeps(): BrainReadDeps {
  return trustedBrainReads({
    async listSessions(tenantId) {
      return sessionsColl(tenantId).find({}).toArray();
    },
    async getSessionDetail(tenantId, sessionId): Promise<SessionDetail | null> {
      const session = await sessionsColl(tenantId).findOne({ _id: sessionId });
      if (!session) return null;
      const [page, sessionClaims, sessionTurns] = await Promise.all([
        sessionPagesColl(tenantId).findOne({ sessionId }),
        claimsColl(tenantId).find({ "evidence.sessionId": sessionId }).toArray(),
        turnsColl(tenantId).find({ sessionId }).toArray(),
      ]);
      return { session, page: page ?? null, claims: sessionClaims, turns: sessionTurns };
    },
    async listSources(tenantId) {
      return sourcesColl(tenantId).find({}).toArray();
    },
    async listGaps(tenantId) {
      return gapsColl(tenantId).find({}).toArray();
    },
  }, getDb);
}

/** Real `CitationsDeps` (routes/citations.ts) — same composition-root pattern as the brain deps
 * above. A claim's `evidence[]` is a small, bounded array (JSON Schema `@minItems 1`, never
 * thousands of rows), so resolving each turn/session in parallel is the right shape — no batching
 * layer needed at this scale. */
export function createMongoCitationsDeps(): CitationsDeps {
  return trustedCitationReads(getDb);
}

/** Real `GraphReadDeps` — unions the `tree_index` root (same `treeIndexRootFilter` as
 * `createMongoTreeStore`) with the real `graph_edges` rows and `sessions`, via `@lkb/index`'s pure
 * `buildKnowledgeGraph`. Both new reads use `packages/db` `coll(tenantId)`, so [I1] holds by
 * construction; full disclosure of what is and is not read lives in `routes/graph.ts`. */
export function createMongoGraphReadDeps(): GraphReadDeps {
  return trustedGraphReads(getDb);
}

export { createGwsCalendarReadDeps } from "./gws/gws-calendar.js";

/** Acquisition, review and approval share canonical tenant policy; source rows remain private and unchanged. */
export function createMeetingCandidatesDeps(owner = process.env.LKB_TENANT_ID, scan = scanGmailForMeetingCandidates, databaseName = () => getDb().databaseName,
  persistence: {getTrustedSender: typeof getTrustedSender; createMeetingCandidateIfNew: typeof createMeetingCandidateIfNew} & {listAllMeetingCandidates?: (tenant:string)=>Promise<MeetingCandidate[]>; decideMeetingCandidate?: (tenant:string,id:string,status:"approved"|"rejected")=>Promise<boolean>; recordSenderApproval?: (tenant:string,domain:string)=>Promise<unknown>} = {getTrustedSender, createMeetingCandidateIfNew},
  remoteScan?: (tenantId: string) => ReturnType<typeof scanGmailForMeetingCandidates>,
  policy?: {joinRules?: Pick<JoinRulesDeps,"load">; ownedDomains?: (tenantId: string) => readonly string[]; gmailSummary?: (tenantId: string) => Promise<GmailScanSummary | undefined>}): MeetingCandidatesDeps {
  const list = persistence.listAllMeetingCandidates ?? listAllMeetingCandidates, decide = persistence.decideMeetingCandidate ?? decideMeetingCandidate;
  const approval = persistence.recordSenderApproval ?? recordSenderApproval;
  async function eligibility(tenant: string) {
    if (policy && !policy.joinRules) throw new Error("Candidate policy unavailable");
    const loaded = policy?.joinRules ? await policy.joinRules.load(tenant) : {ruleSet:{version:1,ownDomains:[],rules:[]},state:{approvedSenders:[],approvedDomains:[],optedOutEventIds:[]}};
    const ruleSet = validateJoinRuleSet(loaded.ruleSet), state = validateJoinRuleState(loaded.state);
    const rawDomains = policy?.ownedDomains ? policy.ownedDomains(tenant) : [];
    if (!Array.isArray(rawDomains) || rawDomains.length > 20 || rawDomains.some(d => !normalizeDomain(d))) throw new Error("Candidate domain policy unavailable");
    const domains = [...ruleSet.ownDomains,...rawDomains].map(d => normalizeDomain(d)!);
    const eligible = (row: Pick<MeetingCandidate,"subject"|"senderEmail"|"senderDomain"> & Partial<MeetingCandidate>) => {
      const email=normalizeEmail(row.senderEmail), domain=email?.split("@")[1];
      if (!email || domain !== normalizeDomain(row.senderDomain) || domains.some(d => domain === d || domain?.endsWith("."+d))) return false;
      if (row.kind === "past-recording" || row.recordingUrl || (row.startTime && (!Number.isFinite(Date.parse(row.startTime)) || Date.parse(row.startTime) <= Date.now()))) return false;
      const link = row.meetingUrl && recognise(row.meetingUrl)?.kind === "join" || row.registrationUrl && /^https:\/\//.test(row.registrationUrl) || row.youtubeWatch || row.meetingLinkIssue || row.youtubeWatchIssue || row.evidenceIssue;
      const invite = /\b(?:invit(?:ation|ed|e)|you(?:['’]re| are)\s+(?:in|registered|on the list))\b/i.test(row.subject) || /\b(?:webinar|seminar|webcast|workshop|conference|meeting|session)\b/i.test(row.subject) && (/\b(?:join|register|attend|registration|reminder|confirmation|confirmed|reserve|watch live)\b/i.test(row.subject) || Boolean(row.meetingUrl && recognise(row.meetingUrl)?.kind === "join"));
      if (!link || !(invite || row.startTime || row.registrationOnly) || /\b(?:newsletter|digest|roundup|promotional|weekly update|product update|recording|recap|watch again)\b/i.test(row.subject)) return false;
      const decision=evaluateJoinRules({id:row._id ?? row.messageId ?? "",senderEmail:email,title:row.subject,meetingUrl:row.meetingUrl},ruleSet,state);
      return !["deny-rule","meeting-opt-out","invalid-rule-set"].includes(decision.reason);
    }; return Object.assign(eligible,{ownDomains:[...new Set(domains)]});
  }
  const refused = (r: Partial<MeetingCandidate>) => Boolean(r.evidenceIssue || r.meetingLinkIssue || r.youtubeWatchIssue || r.registrationOnly);
  async function summary(tenant: string) { return cleanGmailSummary(await policy?.gmailSummary?.(tenant)); }
  return {
    getWorkDatabase(tenantId) {
      if (!owner || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(owner) || owner !== tenantId) return undefined;
      const work = process.env.MONGO_WORK_DB?.trim(), actual = databaseName();
      return work && !isRefusedWorkDb(work) && actual === work ? actual : undefined;
    },
    gmailSummary: summary,
    async scanGmail(tenantId) {
      if (!remoteScan && (!owner || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(owner) || owner !== tenantId)) throw new Error("Connected Gmail owner mismatch");
      const eligible=await eligibility(tenantId); let nativeSummary: GmailScanSummary | undefined;
      const found=remoteScan ? await remoteScan(tenantId) : await scan(500,undefined,{aliases:process.env.LKB_GMAIL_ALIASES,labelIds:process.env.LKB_GMAIL_LABEL_IDS,ownDomains:eligible.ownDomains,onSummary:value=>{nativeSummary=cleanGmailSummary(value);}});
      const gmailSummary=nativeSummary ?? await summary(tenantId); if(gmailSummary?.complete === false)throw new Error("Candidate acquisition incomplete");
      let created = 0, autoApproved = 0;
      const optional = ["meetingUrl","kind","startTime","endTime","recordingUrl","registrationOnly","registrationUrl","threadId","senderAuthenticated","receivedAt","youtubeWatch","youtubeWatchIssue","meetingLinkIssue","evidenceIssue"] as const;
      for (const candidate of found.filter(eligible)) {
        const trusted=candidate.senderAuthenticated === true && !refused(candidate) ? await persistence.getTrustedSender(tenantId,candidate.senderDomain) : undefined;
        const status=trusted?.autoApprove ? "auto_approved" : "pending";
        const extra=Object.fromEntries(optional.filter(k=>candidate[k]!==undefined).map(k=>[k,candidate[k]]));
        const wrote=await persistence.createMeetingCandidateIfNew(tenantId,{_id:randomUUID(),messageId:candidate.messageId,subject:candidate.subject,senderEmail:candidate.senderEmail,senderDomain:candidate.senderDomain,status,detectedAt:new Date().toISOString(),...extra});
        if(wrote){created++;if(status === "auto_approved")autoApproved++;}
      }
      return {created,autoApproved,...(gmailSummary ? {gmailSummary}: {})};
    },
    async listCandidates(tenantId) { const eligible=await eligibility(tenantId); return (await list(tenantId)).filter(eligible); },
    async approve(tenantId,id) {
      const eligible=await eligibility(tenantId), candidate=(await list(tenantId)).find(r=>r._id === id);
      if(!candidate || !eligible(candidate) || refused(candidate) || candidate.status !== "pending")return false;
      const ok=await decide(tenantId,id,"approved");
      if(ok && candidate.senderAuthenticated === true)await approval(tenantId,candidate.senderDomain);
      return ok;
    },
    reject: (tenantId,id)=>decide(tenantId,id,"rejected"),
  };
}

/** Real `KeysDeps` (routes/keys.ts) — the only place that generates or hashes a raw API key
 * outside `scripts/seed-demo-server.mjs`. `listKeys` projects out `keyHash` explicitly (never
 * relies on the caller to remember not to serialize it) so a masked list can never accidentally
 * leak the one thing that must never leave this function. */
export function createMongoKeysDeps(): KeysDeps {
  return {
    async listKeys(tenantId): Promise<ApiKeySummary[]> {
      assertValidTenantId(tenantId, "apiKeys.list");
      const docs = await apiKeysColl(tenantId).find({}).toArray();
      return docs.map((d) => ({
        _id: d._id,
        label: d.label ?? "(unlabeled)",
        scopes: d.scopes ?? [],
        createdAt: d.createdAt,
        revokedAt: d.revokedAt ?? null,
      }));
    },
    async createKey(tenantId, label, scopes) {
      assertValidTenantId(tenantId, "apiKeys.create");
      const id = randomUUID();
      const rawKey = `lkb_${randomBytes(24).toString("hex")}`;
      await apiKeysColl(tenantId).insertOne({
        _id: id,
        keyHash: sha256Hex(rawKey),
        label,
        scopes,
        createdAt: new Date().toISOString(),
        revokedAt: null,
      });
      return { id, rawKey };
    },
    async revokeKey(tenantId, id) {
      assertValidTenantId(tenantId, "apiKeys.revoke");
      const result = await apiKeysColl(tenantId).updateOne(
        { _id: id, revokedAt: null },
        { $set: { revokedAt: new Date().toISOString() } },
      );
      return result.matchedCount > 0;
    },
  };
}

/** Real `HealthDeps` (routes/health.ts). `db.command({ping: 1})` is the standard MongoDB
 * liveness probe. LIVENESS ONLY: no countDocuments here (ISS-T057SCREEN-001) — the route is
 * unauthenticated, so it reports reachability and nothing about data. A ping failure returns
 * `db: "error"` rather than throwing. */
export function createMongoHealthDeps(): HealthDeps {
  return { checkHealth: () => probeMongoHealth(() => getDb().command({ ping: 1 })) };
}

/**
 * A13. Delegates to the tenant-scoped accessors T-027 already shipped and checker-PASSed
 * (`createWatchedSource`, `listActive`) rather than reaching Mongo directly — this file supplies
 * the wiring the feature was missing, not a second implementation of it.
 */
/**
 * The production `WatchedRunDeps`, built as a NAMED value rather than inline in the handler.
 *
 * ISS-C-UNRUN-WRITERS-017: while this object was constructed inside `run`, replacing the guarded
 * fetcher with a bare one left the whole suite green — nothing could reach the composition to
 * assert on it. Exported, `watched-run-deps.test.ts` can assert `isGuardedFetcher(deps.fetcher)`,
 * so that mutant dies. This is the feature's SSRF boundary: every control in guarded-fetch.ts is
 * bypassed if this one line changes.
 */
export function createWatchedRunDeps(): WatchedRunDeps {
  return {
    listActive: listActiveWatchedSources,
    fetcher: createGuardedFetcher({ lookup: resolveAll, request: httpRequest }),
    hasher: (text: string) => createHash("sha256").update(text, "utf8").digest("hex"),
    recordFetch: recordWatchedFetch,
    now: () => new Date().toISOString(),
  };
}

export function createMongoWatchedSourceDeps(): WatchedSourceDeps {
  return {
    async create(tenantId, doc) {
      await createWatchedSource(tenantId, doc);
    },
    async listActive(tenantId) {
      return listActiveWatchedSources(tenantId);
    },
    async run(tenantId) {
      return runWatchedSources(tenantId, createWatchedRunDeps());
    },
  };
}
