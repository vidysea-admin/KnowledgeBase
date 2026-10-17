/** Saved automatic jobs must retain source identity and pass current tenant-bound rules before capture. */
import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AutoRecordItem } from "@lkb/core";
import { readScheduledJob, scheduledJobFilePath, type DispatchPolicyV1 } from "./state/schedule-dedup-state.js";
import { requireStateTenant } from "./state/state-tenant-tag.js";
import { deriveJobKey } from "./task-scheduler.js";
import { normalizeEmail } from "./join-rules/join-rules-normalize.js";
import { enforceJoinRules, type JoinRulesEnforceIo } from "./join-rules/join-rules-enforce.js";
import { createKeyTenantLoader } from "./join-rules-wiring/key-tenant.js";
import { planSendNow } from "../send-now.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const refusal = () => new Error("Scheduled dispatch refused: authorization unavailable");
const id = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\s\x00-\x1f\x7f]/u.test(v);
const stamp = (v: unknown): v is string => {
  if (typeof v !== "string" || v.length > 40 || !Number.isFinite(Date.parse(v))) return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!parts || +parts[4]! > 23 || +parts[5]! > 59 || +parts[6]! > 59) return false;
  const date = new Date(Date.UTC(+parts[1]!, +parts[2]! - 1, +parts[3]!));
  return date.getUTCFullYear() === +parts[1]! && date.getUTCMonth() + 1 === +parts[2]! && date.getUTCDate() === +parts[3]!;
};

/** Producer and consumer share the same closed transport validator. No guessed aliases or organizer. */
export function scheduledDispatchIdentity(item: AutoRecordItem): DispatchPolicyV1 {
  const sender = normalizeEmail(item.sender);
  const value = {source: item.source, sourceId: item.sourceId, sessionKey: item.sessionKey,
    sender, meetingUrl: item.meetingUrl, startTime: item.startTime, endTime: item.endTime};
  return validateIdentity(value);
}

function validateIdentity(raw: unknown): DispatchPolicyV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw refusal();
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== "endTime,meetingUrl,sender,sessionKey,source,sourceId,startTime" ||
    !["calendar", "gmail"].includes(v.source as string) || !id(v.sourceId, 1024) || !id(v.sessionKey, 196) ||
    !id(v.sender, 256) || normalizeEmail(v.sender) !== v.sender ||
    typeof v.meetingUrl !== "string" || v.meetingUrl.length > 2048 || !stamp(v.startTime) || !stamp(v.endTime) ||
    Date.parse(v.endTime) <= Date.parse(v.startTime)) throw refusal();
  try { const u = new URL(v.meetingUrl); if (u.protocol !== "https:" || u.username || u.password) throw refusal(); }
  catch { throw refusal(); }
  return v as unknown as DispatchPolicyV1;
}

export interface ScheduledDispatchDeps {
  stateDir: string;
  tenantId?: string;
  mode?: string;
  loadKeyTenant: () => Promise<string | null>;
  now: () => string;
  log: (message: string) => void;
  record: (args: string[]) => Promise<void>;
  io?: JoinRulesEnforceIo;
}

export async function runScheduledDispatch(rest: string[], injected?: ScheduledDispatchDeps): Promise<void> {
  if (rest.length !== 1 || !/^[a-z0-9-]{1,64}$/.test(rest[0] ?? "")) throw refusal();
  const d = injected ?? await defaults();
  if (d.mode !== "last-valid" && d.mode !== "fail-closed") throw new Error("automatic_dispatch_rule_mode_unsupported");
  let tenant: string;
  try { tenant = requireStateTenant(d.tenantId); } catch { throw refusal(); }
  const keyTenant = await d.loadKeyTenant().catch(() => null);
  if (keyTenant !== tenant) throw refusal();
  let job, identity: DispatchPolicyV1;
  try {
    const file = scheduledJobFilePath(d.stateDir, rest[0]!);
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw refusal();
    job = readScheduledJob(d.stateDir, rest[0]!, tenant);
    if (!job) throw refusal();
    identity = validateIdentity(job.dispatchPolicyV1);
    if (identity.sessionKey !== job.sessionId || identity.meetingUrl !== job.url || identity.endTime !== job.until ||
      deriveJobKey(identity.sessionKey) !== rest[0] || (job.startTime !== undefined && job.startTime !== identity.startTime)) throw refusal();
  } catch { throw refusal(); }
  const now = d.now();
  if (!stamp(now) || Date.parse(identity.endTime) <= Date.parse(now) || !planSendNow(identity.meetingUrl, new Date(now), []).ok) throw refusal();
  const item: AutoRecordItem = {...identity, title: typeof job.title === "string" ? job.title.slice(0, 300) : "Scheduled webinar"};
  let selection;
  try { selection = await enforceJoinRules({toSchedule: [item], skipped: []}, {mode: d.mode, tenantId: tenant,
    keyTenantId: keyTenant, stateDir: d.stateDir, log: () => d.log("Scheduled dispatch: current rule policy evaluated"),
    now: () => Date.parse(now), readOnly: true, io: d.io}); } catch { throw refusal(); }
  if (selection.toSchedule.length !== 1 || selection.toSchedule[0] !== item) throw refusal();
  await d.record([identity.meetingUrl, "--until", identity.endTime, "--session-id", identity.sessionKey,
    "--title", item.title, "--tenant", tenant]);
}

async function defaults(): Promise<ScheduledDispatchDeps> {
  const envFile = path.join(ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const {claimedRecordWithDefaults} = await import("../live-recording/claimed-record.js");
  const {runRecord} = await import("../capture/record-commands.js");
  const log = (message: string) => console.error(message);
  return {stateDir: path.join(ROOT, "raw", "webinars"), tenantId: process.env.LKB_TENANT_ID,
    mode: process.env.LKB_JOIN_RULES_ENFORCE, loadKeyTenant: createKeyTenantLoader(
      (process.env.LKB_API_URL ?? "http://localhost:3300").replace(/\/$/, ""), process.env.LKB_API_KEY, log),
    now: () => new Date().toISOString(), log, record: args => claimedRecordWithDefaults(args, runRecord)};
}
