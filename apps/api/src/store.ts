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
import type { MeetingCandidatesDeps } from "./routes/meeting-candidates.js";
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

/** Real `MeetingCandidatesDeps` (routes/meeting-candidates.ts) — wraps the already-real
 * `@lkb/db` `meeting-candidates`/`trusted-senders` accessors plus the `gws`-backed Gmail scan.
 * `scanGmail`'s per-message trust check is why this composes the two collections here rather
 * than in the route: a candidate whose sender already crossed `AUTO_APPROVE_THRESHOLD` is filed
 * straight in as `auto_approved`, never sitting in the pending review queue Umesh has to clear
 * by hand for a sender he's already trusted three times over. */
export function createMeetingCandidatesDeps(owner = process.env.LKB_TENANT_ID, scan = scanGmailForMeetingCandidates, databaseName = () => getDb().databaseName,
  persistence = {getTrustedSender, createMeetingCandidateIfNew}): MeetingCandidatesDeps {
  return {
    getWorkDatabase(tenantId) {
      if (!owner || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(owner) || owner !== tenantId) return undefined;
      const work = process.env.MONGO_WORK_DB?.trim(), actual = databaseName();
      return work && !isRefusedWorkDb(work) && actual === work ? actual : undefined;
    },
    async scanGmail(tenantId) {
      if (!owner || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(owner) || owner !== tenantId) throw new Error("Connected Gmail owner mismatch");
      const found = await scan();
      let created = 0, autoApproved = 0;
      // U2: pass through every optional scan field the same way meetingUrl already was — present -> included.
      const OPTIONAL_CANDIDATE_FIELDS = ["meetingUrl", "kind", "startTime", "endTime", "recordingUrl", "registrationOnly", "registrationUrl", "threadId", "senderAuthenticated", "receivedAt", "youtubeWatch", "youtubeWatchIssue", "meetingLinkIssue"] as const;
      for (const candidate of found) {
        // ISS-322/333: a From header is not trust. Only an authenticated sender can reach auto_approved; the rest wait for a human.
        const trusted = candidate.senderAuthenticated === true ? await persistence.getTrustedSender(tenantId, candidate.senderDomain) : undefined;
        const status = trusted?.autoApprove ? "auto_approved" : "pending";
        const extra = Object.fromEntries(OPTIONAL_CANDIDATE_FIELDS.filter((k) => candidate[k] !== undefined).map((k) => [k, candidate[k]]));
        const wrote = await persistence.createMeetingCandidateIfNew(tenantId, {
          _id: randomUUID(),
          messageId: candidate.messageId,
          subject: candidate.subject,
          senderEmail: candidate.senderEmail,
          senderDomain: candidate.senderDomain,
          status,
          detectedAt: new Date().toISOString(),
          ...extra,
        });
        if (wrote) { created += 1; if (status === "auto_approved") autoApproved += 1; }
      }
      return { created, autoApproved };
    },
    listCandidates: (tenantId) => listAllMeetingCandidates(tenantId),
    async approve(tenantId, id) {
      const candidate = await listAllMeetingCandidates(tenantId).then((rows) => rows.find((r) => r._id === id));
      const ok = await decideMeetingCandidate(tenantId, id, "approved");
      if (ok && candidate) await recordSenderApproval(tenantId, candidate.senderDomain);
      return ok;
    },
    reject: (tenantId, id) => decideMeetingCandidate(tenantId, id, "rejected"),
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
