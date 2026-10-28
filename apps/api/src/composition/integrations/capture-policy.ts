import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDomain, parseStrictEmail } from "../../../../../packages/ingest/src/join-policy/join-rules.js";
import type { JoinRulesDeps } from "../../join-rules/deps.js";
import { createJoinPolicyDeps } from "@lkb/ingest";

/** Explicit opt-in; construction binds functions only and never creates files or starts capture. */
export function buildCapturePolicyIntegrations({root, env}: {root: string; env: Record<string, string | undefined>}): {joinRules?: JoinRulesDeps} {
  if (env.LKB_JOIN_RULES_ENABLED !== "1" || typeof root !== "string" || !path.isAbsolute(root) ||
    /[\x00-\x1f\x7f]/.test(root) || root !== root.trim()) return {};
  const repository = path.resolve(root), configured = env.LKB_JOIN_RULES_STATE_DIR;
  if (configured !== undefined && (!path.isAbsolute(configured) || configured !== configured.trim() || /[\x00-\x1f\x7f]/.test(configured))) return {};
  const stateDir = configured === undefined ? path.resolve(repository, "raw", "webinars") : path.resolve(configured);
  if (configured === undefined && path.relative(repository, stateDir) !== path.join("raw", "webinars")) return {};
  return {joinRules: createJoinPolicyDeps({stateDir})};
}


import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Db } from "mongodb";
import { Ajv2020 } from "ajv/dist/2020.js";
import { createRequire } from "node:module";
import type { FormatsPlugin } from "ajv-formats";
import type { ApiKeys, WatchState, WatchHeartbeat } from "@lkb/core";
import type { VerifiedKey } from "../../auth.js";
import type { CalendarReadDeps, CalendarWorkerState, CalendarWorkerHealth, CalendarWorkerAck } from "../../routes/calendar.js";
import { projectWebinarOperations, type WebinarOperations } from "../../routes/brain.js";

type Binding = {tenantId: string; keyId: string; account: string; hostId: string};
type Fence = NonNullable<ApiKeys["workerFence"]>;
const WORKER_MAX_AGE_MS = 10 * 60_000;
function workerError(statusCode: number): never { throw Object.assign(new Error("Calendar worker state refused"), {statusCode}); }
const canonicalWorkerJson = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const workerDigest = (value: unknown) => createHash("sha256").update(canonicalWorkerJson(value)).digest("hex");

/** Standalone-Mongo publication: immutable private staging followed by one active-key CAS.
 * Construction is lazy and performs no database/network/file writes. Invalid configuration
 * stays in worker mode and fails closed, never falling back to a host's local Google identity. */
export function buildCalendarWorkerIntegrations({db, env, now = () => new Date()}: {
  db: Db; env: Record<string, string | undefined>; now?: () => Date;
}): {calendar: CalendarReadDeps; listWebinarOperations(tenantId: string): Promise<WebinarOperations>;
  listGmailCandidates(tenantId: string): Promise<CalendarWorkerState["candidates"]>;
  mergeHeartbeats(tenantId: string, rows: WatchHeartbeat[]): Promise<WatchHeartbeat[]>;
  listWorkerHeartbeats(tenantId: string): Promise<WatchHeartbeat[]>; workerHealth(tenantId: string): Promise<CalendarWorkerHealth>;
  ownedDomains(tenantId: string): string[]; gmailSummary(tenantId: string): Promise<CalendarWorkerState["gmailSummary"]>} | undefined {
  if (env.LKB_CALENDAR_WORKER_ENABLED === undefined && env.LKB_CALENDAR_WORKER_BINDINGS === undefined) return undefined;
  if (env.LKB_CALENDAR_WORKER_ENABLED === "0" && !env.LKB_CALENDAR_WORKER_BINDINGS?.trim()) return undefined;
  const policy = buildCapturePolicyIntegrations({root: fileURLToPath(new URL("../../../../../", import.meta.url)), env}).joinRules;
  let bindings: Binding[] = [];
  try {
    const raw: unknown = JSON.parse(env.LKB_CALENDAR_WORKER_BINDINGS ?? "null");
    if (env.LKB_CALENDAR_WORKER_ENABLED !== "1" || !Array.isArray(raw) || !raw.length || raw.length > 50) throw new Error();
    const tenants = new Set<string>(), keys = new Set<string>();
    bindings = raw.map(item => {
      if (!item || typeof item !== "object" || Object.keys(item).sort().join() !== "account,hostId,keyId,tenantId" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(item.tenantId) || typeof item.tenantId !== "string" ||
        typeof item.keyId !== "string" || !/^[a-zA-Z0-9._-]{1,150}$/.test(item.keyId) ||
        typeof item.hostId !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/.test(item.hostId) ||
        typeof item.account !== "string" || item.account !== item.account.toLowerCase() || !/^[^\s@]{1,200}@[^\s@]{1,100}\.[^\s@]{2,30}$/.test(item.account) ||
        !parseStrictEmail(item.account) || tenants.has(item.tenantId) || keys.has(item.keyId)) throw new Error();
      tenants.add(item.tenantId); keys.add(item.keyId); return item as Binding;
    });
  } catch { bindings = []; }
  const keys = () => db.collection<ApiKeys>("api_keys"), states = () => db.collection<WatchState>("watch_state");
  const bindingFor = (tenantId: string) => bindings.find(item => item.tenantId === tenantId) ?? workerError(403);
  const keyFilter = (binding: Binding) => ({tenantId: binding.tenantId, _id: binding.keyId, revokedAt: null,
    scopes: {$all: ["calendar", "operations:write"]}});
  async function active(binding: Binding) {
    const key = await keys().findOne(keyFilter(binding));
    return key ?? workerError(403);
  }
  async function authority(principal: VerifiedKey) {
    const binding = bindingFor(principal.tenantId);
    if (principal.keyId !== binding.keyId || !principal.scopes.includes("calendar") || !principal.scopes.includes("operations:write")) workerError(403);
    return {binding, key: await active(binding)};
  }
  let validateRow: ReturnType<Ajv2020["compile"]> | undefined;
  function validateState(body: unknown): CalendarWorkerState {
    if (Buffer.byteLength(JSON.stringify(body) ?? "") > 512 * 1024) workerError(400);
    if (!validateRow) {
      const schema = JSON.parse(readFileSync(new URL("../../../../../schema/watch_state.schema.json", import.meta.url), "utf8"));
      if (!schema.properties.workerSnapshot) workerError(503);
      const ajv = new Ajv2020({strict: false}), formats: unknown = createRequire(import.meta.url)("ajv-formats");
      if (typeof formats !== "function") workerError(503);
      (formats as FormatsPlugin)(ajv);
      validateRow = ajv.compile(schema);
    }
    const row = {_id: "validation", tenantId: "validation", sourceType: "calendar", sourceId: "validation", status: "seen", seenAt: now().toISOString(),
      workerSnapshot: {keyId: "validation", digest: "a".repeat(64), receivedAt: now().toISOString(), state: body}};
    if (!validateRow(row)) workerError(400);
    return body as CalendarWorkerState;
  }
  const health = (fence: Fence | undefined): CalendarWorkerHealth => {
    if (!fence?.snapshotId || !fence.receivedAt) return {status: "unavailable", complete: false};
    const age = now().getTime() - Date.parse(fence.receivedAt), providerAge = now().getTime() - Date.parse(fence.checkedAt ?? "");
    return {status: fence.complete && age >= 0 && age < WORKER_MAX_AGE_MS && providerAge >= 0 && providerAge < WORKER_MAX_AGE_MS ? "fresh" : "stale",
      receivedAt: fence.receivedAt, checkedAt: fence.checkedAt, complete: fence.complete};
  };
  async function load(tenantId: string) {
    const binding = bindingFor(tenantId), key = await active(binding), fence = key.workerFence;
    let snapshot: WatchState["workerSnapshot"], operationSnapshot: WatchState["workerSnapshot"];
    if (!fence) return {binding, fence, snapshot, operationSnapshot, worker: health(fence)};
    if (fence.snapshotId) {
      snapshot = (await states().findOne({_id: fence.snapshotId, tenantId}))?.workerSnapshot;
      if (!snapshot || snapshot.keyId !== binding.keyId || snapshot.state.account !== binding.account || snapshot.state.hostId !== binding.hostId ||
        snapshot.state.generation !== fence.coverageGeneration || snapshot.state.sequence !== fence.coverageSequence || !snapshot.state.complete ||
        snapshot.digest !== fence.snapshotDigest || workerDigest(snapshot.state) !== fence.snapshotDigest || snapshot.receivedAt !== fence.receivedAt || snapshot.state.checkedAt !== fence.checkedAt) workerError(503);
    }
    if (fence.submissionId) {
      operationSnapshot = fence.submissionId === fence.snapshotId ? snapshot : (await states().findOne({_id: fence.submissionId, tenantId}))?.workerSnapshot;
      if (!operationSnapshot || operationSnapshot.keyId !== binding.keyId || operationSnapshot.state.account !== binding.account || operationSnapshot.state.hostId !== binding.hostId ||
        operationSnapshot.state.generation !== fence.generation || operationSnapshot.state.sequence !== fence.sequence || operationSnapshot.state.complete !== fence.complete ||
        operationSnapshot.digest !== fence.digest || workerDigest(operationSnapshot.state) !== fence.digest || operationSnapshot.receivedAt !== fence.ackAt) workerError(503);
    } else if (fence.sequence > 0) workerError(503);
    if ((fence.complete && fence.submissionId !== fence.snapshotId) || !await keys().findOne({...keyFilter(binding), workerFence: fence})) workerError(503);
    return {binding, fence, snapshot, operationSnapshot: operationSnapshot ?? snapshot, worker: health(fence)};
  }
  const ack = (fence: Fence): CalendarWorkerAck => ({generation: fence.generation, sequence: fence.sequence, digest: fence.digest,
    receivedAt: fence.ackAt, complete: fence.complete});
  const receiptId = (binding: Binding, generation: string, sequence: number) => binding.tenantId + ":calendar:worker-snapshot:receipt:" + workerDigest({keyId: binding.keyId, generation, sequence});
  async function remember(binding: Binding, fence: Fence) {
    if (fence.sequence === 0) return;
    const _id = receiptId(binding, fence.generation, fence.sequence), receipt = {keyId: binding.keyId, account: binding.account, hostId: binding.hostId, ...ack(fence)};
    try { await states().insertOne({_id, tenantId: binding.tenantId, sourceType: "calendar", sourceId: _id.slice((binding.tenantId+":calendar:").length), status: "seen",
      seenAt: fence.ackAt, workerReceipt: receipt});
    } catch (error) {
      if ((error as {code?: unknown})?.code !== 11000) throw error;
      const prior = await states().findOne({_id, tenantId: binding.tenantId});
      if (canonicalWorkerJson(prior?.workerReceipt) !== canonicalWorkerJson(receipt)) workerError(503);
    }
  }
  const calendar: CalendarReadDeps = {
    async inventory(tenantId) { const value = await load(tenantId); if (!value.snapshot) workerError(503);
      const meetings = value.snapshot.state.meetings.map(row => ({...row}));
      for (const source of value.snapshot.state.sourceEvents.filter(row => !row.recurrence || row.cancelled || row.status === "cancelled")) {
        const {recurrence: _series, ...cancelled} = source;
        const index = meetings.findIndex(row => row.id === cancelled.id || (row.originalStartTime && cancelled.originalStartTime && row.recurringEventId && row.recurringEventId === cancelled.recurringEventId &&
          JSON.stringify(row.originalStartTime) === JSON.stringify(cancelled.originalStartTime)));
        if (index < 0) meetings.push(cancelled);
        else { const known = meetings[index]!; meetings[index] = {...known, ...cancelled, title: cancelled.title || known.title,
          startTime: cancelled.startTime || known.startTime, endTime: cancelled.endTime || known.endTime, ...((cancelled.cancelled || cancelled.status === "cancelled") ? {cancelled: true} : {})}; }
      }
      // Derive a private display reason after authenticated load, never from worker payload fields.
      if (env.LKB_JOIN_RULES_ENABLED === "1" && !policy) workerError(503);
      const canonical = policy ? policy.validateRuleSet((await policy.load(tenantId)).ruleSet).ownDomains : [];
      const ownDomains = [parseStrictEmail(value.binding.account)!.domain, ...canonical.map(d => normalizeDomain(d)!)];
      return {meetings: meetings.map(row => {
        const domain = parseStrictEmail(row.organizer)?.domain;
        return domain && ownDomains.some(own => domain === own || domain.endsWith("." + own))
          ? {...row, attendanceSkipReason: "office-internal" as const} : row;
      }), worker: value.worker}; },
    async listUpcoming(tenantId, changedSince) {
      const value = await calendar.inventory!(tenantId); if (changedSince !== undefined && value.worker.status !== "fresh") workerError(503);
      return value.meetings;
    },
    async acquire(tenantId, syncToken) {
      const value = await load(tenantId); if (!value.snapshot || value.worker.status !== "fresh") workerError(503);
      return {version: 1, mode: syncToken ? "reset" : "baseline", complete: true, checkedAt: value.snapshot.state.checkedAt, tenantId,
        scope: "available-connected-source-state", syncToken: value.snapshot.digest, ...(syncToken ? {requestedSyncToken: syncToken} : {}),
        sourceEvents: value.snapshot.state.sourceEvents, meetings: value.snapshot.state.meetings,
        snapshot: {version: 1, kind: "worker-snapshot", receivedAt: value.snapshot.receivedAt, servedAt: now().toISOString(), digest: value.snapshot.digest}};
    },
    worker: {
      async read(principal) { const {binding} = await authority(principal), value = await load(binding.tenantId);
        return {generation: value.fence?.generation ?? null, sequence: value.fence?.sequence ?? 0, digest: value.fence?.digest, worker: value.worker}; },
      async begin(principal, raw) {
        const {binding, key} = await authority(principal), body = raw as Record<string, unknown> | null, before = key.workerFence;
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join() !== "account,expectedGeneration,hostId" ||
          body.account !== binding.account || body.hostId !== binding.hostId || body.expectedGeneration !== (before?.generation ?? null)) workerError(409);
        if (before && now().getTime() - Date.parse(before.ackAt) < WORKER_MAX_AGE_MS) workerError(409);
        const fence: Fence = {...before, generation: randomUUID(), sequence: 0, digest: "", ackAt: now().toISOString(), complete: false};
        delete fence.submissionId;
        const result = await keys().updateOne({...keyFilter(binding), workerFence: before ?? {$exists: false}}, {$set: {workerFence: fence}});
        if (result.matchedCount !== 1) workerError(409);
        return {generation: fence.generation, sequence: 0};
      },
      async publish(principal, raw) {
        const {binding, key} = await authority(principal), body = validateState(raw), before = key.workerFence;
        if (body.account !== binding.account || body.hostId !== binding.hostId) workerError(403);
        if (!before || body.generation !== before.generation) workerError(409);
        const digest = workerDigest(body);
        if (body.sequence === before.sequence) { if (digest !== before.digest) workerError(409); return ack(before); }
        if (body.sequence < before.sequence) {
          const stored = await states().findOne({_id: receiptId(binding, body.generation, body.sequence), tenantId: binding.tenantId}), receipt = stored?.workerReceipt;
          if (!receipt || receipt.keyId !== binding.keyId || receipt.account !== binding.account || receipt.hostId !== binding.hostId ||
            receipt.generation !== body.generation || receipt.sequence !== body.sequence || receipt.digest !== digest || receipt.complete !== body.complete ||
            !Number.isFinite(Date.parse(receipt.receivedAt))) workerError(409);
          const {generation, sequence, receivedAt, complete} = receipt;
          return {generation, sequence, digest, receivedAt, complete};
        }
        const time = now().toISOString(), scanAge = Date.parse(time) - Date.parse(body.checkedAt);
        if (body.complete && (scanAge < 0 || scanAge >= WORKER_MAX_AGE_MS ||
          (before.checkedAt && Date.parse(body.checkedAt) <= Date.parse(before.checkedAt)))) workerError(422);
        await remember(binding, before);
        const sourceId = "worker-snapshot:" + workerDigest({tenantId: binding.tenantId, keyId: binding.keyId, generation: body.generation, sequence: body.sequence, digest});
        const id = binding.tenantId + ":calendar:" + sourceId;
        const staged: WatchState = {_id: id, tenantId: binding.tenantId, sourceType: "calendar", sourceId, status: "seen", seenAt: time,
          workerSnapshot: {keyId: binding.keyId, digest, receivedAt: time, state: body}};
        try { await states().insertOne(staged); } catch (error) { if ((error as {code?: unknown})?.code !== 11000) throw error; }
        const stored = await states().findOne({_id: id, tenantId: binding.tenantId}), snapshot = stored?.workerSnapshot;
        if (!snapshot || snapshot.digest !== digest || workerDigest(snapshot.state) !== digest || snapshot.keyId !== binding.keyId ||
          now().getTime() - Date.parse(snapshot.receivedAt) >= WORKER_MAX_AGE_MS || (body.complete && now().getTime() - Date.parse(body.checkedAt) >= WORKER_MAX_AGE_MS)) workerError(409);
        let fence: Fence = {...before, sequence: body.sequence, digest, ackAt: snapshot.receivedAt, complete: body.complete, submissionId: id};
        if (body.complete) fence = {...fence, snapshotId: id, snapshotDigest: digest, coverageGeneration: body.generation, coverageSequence: body.sequence,
          receivedAt: snapshot.receivedAt, checkedAt: body.checkedAt};
        const result = await keys().updateOne({...keyFilter(binding), workerFence: before}, {$set: {workerFence: fence}});
        if (result.matchedCount !== 1) {
          const current = (await active(binding)).workerFence;
          if (current?.generation === body.generation && current.sequence === body.sequence && current.digest === digest) return ack(current);
          workerError(409);
        }
        return ack(fence);
      },
    },
  };
  async function workerHeartbeats(tenantId: string): Promise<WatchHeartbeat[]> {
    if (!bindings.some(item => item.tenantId === tenantId)) return [];
      const {fence} = await load(tenantId); if (!fence) return [];
      return (["calendar", "gmail"] as const).map(sourceType => ({_id: tenantId+":"+sourceType, tenantId, sourceType, lastHeartbeatAt: fence.ackAt,
        providerScanStatus: fence.complete ? "healthy" as const : "failed" as const, providerCheckedAt: fence.checkedAt, coverageReceivedAt: fence.receivedAt}));
    }
  return {calendar,
    ownedDomains(tenantId) { return bindings.filter(item => item.tenantId === tenantId).map(item => item.account.split("@")[1]!); },
    async gmailSummary(tenantId) {
      const value = await load(tenantId); if (!value.snapshot || value.worker.status !== "fresh") return undefined;
      return value.snapshot.state.gmailSummary;
    },
    async listGmailCandidates(tenantId) {
      const value = await load(tenantId); if (!value.snapshot || value.worker.status !== "fresh") workerError(503);
      return value.snapshot.state.candidates;
    },
    async workerHealth(tenantId) { return bindings.some(item => item.tenantId === tenantId) ? (await load(tenantId)).worker : {status: "unavailable"}; },
    listWorkerHeartbeats: workerHeartbeats,
    async mergeHeartbeats(tenantId, rows) {
      if (!bindings.some(item => item.tenantId === tenantId)) return rows;
      return [...rows.filter(row => !["calendar", "gmail"].includes(row.sourceType)), ...await workerHeartbeats(tenantId)];
    },
    async listWebinarOperations(tenantId) {
      const value = await load(tenantId); if (!value.operationSnapshot) workerError(503);
      const operations = projectWebinarOperations(value.operationSnapshot.state.operations);
      const discovery = Object.fromEntries((["calendar", "gmail"] as const).map(feed => [feed, {status: value.worker.status === "fresh" ? "healthy" : "failed",
        checkedAt: value.operationSnapshot!.state.checkedAt, lastSuccessAt: value.fence!.receivedAt}])) as NonNullable<WebinarOperations["discovery"]>;
      return {...operations, discovery, worker: value.worker};
    },
  };
}
