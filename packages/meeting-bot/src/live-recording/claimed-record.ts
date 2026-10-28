/**
 * packages/meeting-bot/src/live-recording/claimed-record.ts - the `record` chokepoint (ISS-T039CMD-001/-002). `cli.ts record` and the
 * in-process `lkb send-now` both run `runRecord` through this: it claims (tenant, meeting) in the live-recording view first, refuses
 * when another LIVE recorder holds it, and releases on every exit path. Anything it cannot compute (no URL, unknown platform,
 * bad flags) is left to `runRecord`'s own validation: no claim is invented for a link with no meeting identity.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claimLiveRecording, liveRecordingDir, type LiveProbes } from "./live-recording.js";
import { meetingIdentity } from "../send-now.js";

export interface ClaimedRecordDeps {
  dir?: string; now?: () => Date; probes?: LiveProbes; pid?: number; warn?: (m: string) => void;
  /** `captureTenant` and `todayAt` of record-commands (injected so tests need no capture module). */
  tenant: (rest: string[]) => string; until: (v: string) => Date;
}
const flag = (rest: string[], name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export async function runClaimedRecord(rest: string[], runRecord: (rest: string[]) => Promise<void>, deps: ClaimedRecordDeps): Promise<void> {
  const url = rest[0];
  let release: (() => void) | undefined;
  if (url && !url.startsWith("--") && meetingIdentity(url)) {
    let tenantId: string | undefined, until: Date | null = null;
    try { tenantId = deps.tenant(rest); } catch { tenantId = undefined; } // runRecord throws the same error itself
    try { const u = flag(rest, "--until"); until = u ? deps.until(u) : null; } catch { until = null; }
    if (tenantId) {
      const now = (deps.now ?? (() => new Date()))();
      const sessionId = flag(rest, "--session-id") ?? "manual";
      let claim: ReturnType<typeof claimLiveRecording> | undefined;
      try { claim = claimLiveRecording({ dir: deps.dir ?? liveRecordingDir(REPO_ROOT), tenantId, meetingUrl: url, sessionId, until }, now, deps.probes, deps.pid); }
      catch (e) {
        // Bookkeeping failure must not cost a recording; the conflict case below is the only refusal. send-now's READER still fails closed.
        (deps.warn ?? console.warn)(`[bot] live-recording view not updated (${e instanceof Error ? e.message : String(e)}); recording anyway`);
      }
      if (claim && !claim.ok) {
        throw new Error(`a recorder is already queued, joining or recording this meeting (session ${claim.heldBy.sessionId}, pid ${claim.heldBy.pid}); not starting a second recording`);
      }
      release = claim?.ok ? claim.release : undefined;
    }
  }
  try { await runRecord(rest); }
  finally { release?.(); }
}

/** Real wiring (dynamic import keeps tests free of the OBS/browser graph). */
export async function claimedRecordWithDefaults(rest: string[], runRecord: (rest: string[]) => Promise<void>): Promise<void> {
  const { captureTenant, todayAt } = await import("../capture/record-commands.js");
  return runClaimedRecord(rest, runRecord, { tenant: captureTenant, until: todayAt });
}
