import { validateRecordConsent, type RecordConsentReceipt } from "./context.js";
import type { TimeWindow } from "../../live-monitor.js";

/** Completeness expects speech only in public intervals from a validated durable receipt. */
export function publicRecordCaptureIntervals(receipt: RecordConsentReceipt,
  owner: {tenantId: string; sessionId: string; meetingHash?: string}, range: TimeWindow, medium: "source" | "audio" | "video" = "source"): TimeWindow[] {
  const checked = validateRecordConsent(receipt, owner);
  if (!Number.isFinite(range.tStart) || !Number.isFinite(range.tEnd) || range.tStart < 0 || range.tEnd <= range.tStart) {
    throw new Error("Invalid capture coverage range");
  }
  if (checked.privateWindows.length && (checked.mediaStartedAt === undefined || checked.generation === undefined)) return [];
  const guard = privateCaptureGuard(medium);
  const privateWindows = checked.privateWindows.map(window => ({tStart: Math.max(0, window.tStart - guard), tEnd: window.tEnd + guard}))
    .filter(window => window.tEnd > range.tStart && window.tStart < range.tEnd)
    .sort((a, b) => a.tStart - b.tStart);
  const publicWindows: TimeWindow[] = []; let cursor = range.tStart;
  for (const window of privateWindows) {
    const start = Math.max(range.tStart, window.tStart), end = Math.min(range.tEnd, window.tEnd);
    if (start > cursor) publicWindows.push({tStart: cursor, tEnd: start});
    cursor = Math.max(cursor, end);
  }
  if (cursor < range.tEnd) publicWindows.push({tStart: cursor, tEnd: range.tEnd});
  return publicWindows;
}

/** Matches the verified T035 encoder's boundary protection; originals remain unchanged for audit. */
export function privateCaptureGuard(medium: "source" | "audio" | "video"): number {
  if (!["source", "audio", "video"].includes(medium)) throw new Error("Invalid privacy mask medium");
  return medium === "audio" ? 0.100001 : medium === "video" ? 0.200001 : 0;
}
export function recordGuardedPrivacyMaskIntervals(receipt: RecordConsentReceipt,
  owner: {tenantId: string; sessionId: string; meetingHash?: string}, duration: number, medium: "audio" | "video") {
  const guard = privateCaptureGuard(medium);
  return recordPrivacyMaskIntervals(receipt, owner, duration).map(window => ({start: Math.max(0, window.start - guard), end: Math.min(duration, window.end + guard)}))
    .reduce<{start:number;end:number}[]>((merged,window)=>{const prior=merged.at(-1);if(prior&&window.start<=prior.end)prior.end=Math.max(prior.end,window.end);else merged.push(window);return merged;},[]);
}

/** Typed numeric intervals for the video encoder; never accept operator-supplied filter strings. */
export function recordPrivacyMaskIntervals(receipt: RecordConsentReceipt,
  owner: {tenantId: string; sessionId: string; meetingHash?: string}, duration: number): {start: number; end: number}[] {
  const checked = validateRecordConsent(receipt, owner);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid capture masking duration");
  if (checked.privateWindows.length && (checked.mediaStartedAt === undefined || checked.generation === undefined)) return [{start:0,end:duration}];
  const windows = checked.privateWindows.filter(window => window.tStart < duration)
    .map(window => ({start: window.tStart, end: Math.min(window.tEnd, duration)})).sort((a, b) => a.start - b.start);
  const merged: {start: number; end: number}[] = [];
  for (const window of windows) {
    const prior = merged.at(-1);
    if (prior && window.start <= prior.end) prior.end = Math.max(prior.end, window.end);
    else merged.push({...window});
  }
  return merged;
}
