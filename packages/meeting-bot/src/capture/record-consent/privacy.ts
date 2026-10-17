import { timingSafeEqual } from "node:crypto";
import type { Turn } from "@lkb/ingest";
import { excludePrivateSegments } from "../../live-monitor.js";
import { validatePrivateCaptureWindows, type RecordConsentReceipt } from "./context.js";
import { privateCaptureGuard } from "./coverage.js";

/** Reject invalid windows BEFORE any transcript is published or downstream consumer runs. */
export function privateCaptureTurns(turns: Turn[], receipt: RecordConsentReceipt, medium: "source" | "audio" | "video" = "source"): Turn[] {
  const guard = privateCaptureGuard(medium);
  const windows = validatePrivateCaptureWindows(receipt.privateWindows);
  if (windows.length && (receipt.mediaStartedAt === undefined || receipt.generation === undefined)) return [];
  return excludePrivateSegments(turns, windows
    .map(window => ({tStart: Math.max(0, window.tStart - guard), tEnd: window.tEnd + guard})));
}
type PrivacyProcess = Pick<NodeJS.Process, "env" | "connected" | "on" | "off" | "send">;
/** Only the inherited, private parent IPC capability can mark live private segments. */
export function installPrivateCaptureControl(receipt: RecordConsentReceipt, startedAt: number,
  persist: (receipt: RecordConsentReceipt) => void, processLike: PrivacyProcess = process, now: () => number = Date.now,
  monotonicNow: () => number = now === Date.now ? () => performance.now() : now) {
  const token = processLike.env.LKB_CAPTURE_CONTROL_TOKEN, generation = processLike.env.LKB_CAPTURE_CONTROL_GENERATION;
  const managed = token !== undefined || generation !== undefined;
  if (!Number.isFinite(startedAt) || (managed && (!token || !/^[a-f0-9]{64}$/.test(token) ||
    !generation || !/^[a-f0-9-]{36}$/.test(generation) || receipt.generation!==generation || !processLike.connected || !processLike.send))) {
    throw new Error("Invalid private capture control context");
  }
  let openedAt: number | undefined, disposed = false, mediaStartedAt = receipt.mediaStartedAt, failure: string | undefined;
  const installedEpoch = now(), installedMonotonic = monotonicNow();
  let mediaMonotonicOrigin = mediaStartedAt === undefined ? undefined : monotonicNow() - (now() - mediaStartedAt);
  const acceptedRequests = new Map<string, {action: string; ack: Record<string, unknown>}>();
  const elapsed = () => mediaMonotonicOrigin === undefined ? undefined : Math.max(0, (monotonicNow() - mediaMonotonicOrigin) / 1000);
  const close = () => {
    if (openedAt === undefined) return;
    const end = Math.max(elapsed() ?? Number.MAX_SAFE_INTEGER, openedAt + 0.001);
    const privateWindows = validatePrivateCaptureWindows([...receipt.privateWindows, {tStart: openedAt, tEnd: end}]);
    persist({...receipt, privateWindows, ...(mediaStartedAt === undefined ? {} : {mediaStartedAt})});
    receipt.privateWindows = privateWindows;
    if (mediaStartedAt !== undefined) receipt.mediaStartedAt = mediaStartedAt;
    openedAt = undefined;
  };
  // An asynchronous send failure (parent already disconnected, EPIPE) must not become an unhandled process error
  // that turns an orderly worker shutdown into exit 1. The callback consumes it; the receipt governs exclusion.
  const deliver = (value: unknown) => {try {processLike.send!(value, () => {});} catch {}};
  const message = (value: unknown) => {
    if (!managed || disposed || failure || !value || typeof value !== "object" || Array.isArray(value)) return;
    const row = value as Record<string, unknown>;
    if (Object.keys(row).length !== 8 || Object.keys(row).some(key => !["version", "type", "tenantId", "sessionId", "generation", "token", "action", "requestId"].includes(key)) ||
      row.version !== 1 || row.type !== "privacy" || row.tenantId !== receipt.tenantId || row.sessionId !== receipt.sessionId || row.generation !== generation ||
      typeof row.token !== "string" || !/^[a-f0-9]{64}$/.test(row.token) || !timingSafeEqual(Buffer.from(row.token), Buffer.from(token!)) ||
      !["private-start", "private-end", "status"].includes(row.action as string) || typeof row.requestId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.requestId)) return;
    const state = () => {
      const excluded = receipt.privateWindows.length > 0 && mediaStartedAt === undefined ||
        receipt.privateWindows.some(window => window.tStart === 0 && window.tEnd === Number.MAX_SAFE_INTEGER);
      return {status: mediaStartedAt === undefined ? "joining" : "recording",
        privacy: excluded || openedAt !== undefined && mediaStartedAt === undefined ? "conservative" : openedAt === undefined ? "public" : "private"};
    };
    if (row.action === "status") {
      deliver({...row, type: "privacy-ack", timing: mediaStartedAt === undefined ? "conservative" : "media-clock", ...state()});
      return;
    }
    const prior = acceptedRequests.get(row.requestId);
    if (prior !== undefined) {if (prior.action === row.action) {deliver(prior.ack);} return;}
    if (acceptedRequests.size >= 512) {failure = "Private capture request limit reached; stop capture before processing"; return;}
    try { if (row.action === "private-start") {
      if (openedAt === undefined) {
        const start = elapsed() ?? 0;
        // Persist the open interval conservatively; a controller death must never expose it.
        const draft = {...receipt, privateWindows: [...receipt.privateWindows, {tStart: start, tEnd: Number.MAX_SAFE_INTEGER}],
          ...(mediaStartedAt === undefined ? {} : {mediaStartedAt})};
        persist(draft);
        if (mediaStartedAt !== undefined) receipt.mediaStartedAt = mediaStartedAt;
        openedAt = start;
      }
    } else close(); } catch { failure = "Private capture receipt could not be persisted; stop capture and recover before processing"; return; }
    const ack = {...row, type: "privacy-ack", timing: mediaStartedAt === undefined ? "conservative" : "media-clock", ...state()};
    acceptedRequests.set(row.requestId, {action: row.action as string, ack});
    try { deliver(ack); }
    catch { /* Receipt, not ACK delivery, governs exclusion. */ }
  };
  if (managed) processLike.on("message", message);
  return {close, failure: () => failure,
    // The capture producer supplies its actual media start, never controller launch/admission time.
    onCaptureEvent: (event: {event: string; mediaStartedAt?: unknown}) => {
      if (disposed || failure || event.event !== "capture-started" || mediaStartedAt !== undefined) return;
      const receivedAt = now(), receivedMonotonic = monotonicNow();
      // A wall-clock discontinuity before origin delivery makes the producer epoch ambiguous.
      // Never map it into a late, out-of-media exclusion; keep whole-capture conservative behavior.
      if (Math.abs((receivedAt - installedEpoch) - (receivedMonotonic - installedMonotonic)) > privateCaptureGuard("audio") * 1000) return;
      if (typeof event.mediaStartedAt === "number" && Number.isSafeInteger(event.mediaStartedAt) &&
        event.mediaStartedAt >= startedAt && event.mediaStartedAt <= receivedAt) {
        // Preserve an already accepted open exclusion while checkpointing the actual media origin.
        const privateWindows = openedAt === undefined ? receipt.privateWindows :
          [...receipt.privateWindows, {tStart: openedAt, tEnd: Number.MAX_SAFE_INTEGER}];
        try {
          persist({...receipt, privateWindows, mediaStartedAt: event.mediaStartedAt});
          mediaStartedAt = event.mediaStartedAt; receipt.mediaStartedAt = mediaStartedAt;
          mediaMonotonicOrigin = receivedMonotonic - (receivedAt - mediaStartedAt);
        } catch {failure = "Capture media origin could not be persisted; stop capture before processing";}
      }
    },
    dispose: () => {if (disposed) return; try {close();} finally {disposed = true; if (managed) processLike.off("message", message);}}};
}
