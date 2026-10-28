import { randomUUID, timingSafeEqual } from "node:crypto";
import type { ChildProcess } from "node:child_process";
export type CapturePrivacyState = {status: "joining" | "recording" | "interrupted"; privacy: "public" | "private" | "conservative" | "unavailable"};
export interface PrivateRecordingControl {
  generation: string;
  privacy(action: "private-start" | "private-end"): Promise<"accepted" | "unavailable">;
  privacyStatus(): Promise<CapturePrivacyState | undefined>;
}
/** Parent-owned sealed IPC. A handle's existence is never proof of child readiness. */
export function createRecordingPrivacyControl(child: ChildProcess, owner: {tenantId: string; sessionId: string; generation: string; token: string}) {
  let disposed = false;
  const pending = new Map<string, {action: string; resolve(value: CapturePrivacyState | undefined): void; timer: ReturnType<typeof setTimeout>}>();
  const message = (value: unknown) => {
    if (disposed || !value || typeof value !== "object" || Array.isArray(value)) return;
    const row = value as Record<string, unknown>, wait = pending.get(String(row.requestId));
    if (!wait || Object.keys(row).length !== 11 || row.version !== 1 || row.type !== "privacy-ack" || row.tenantId !== owner.tenantId || row.sessionId !== owner.sessionId ||
      row.generation !== owner.generation || row.action !== wait.action || typeof row.token !== "string" || !/^[a-f0-9]{64}$/.test(row.token) ||
      !timingSafeEqual(Buffer.from(row.token), Buffer.from(owner.token)) || !["conservative", "media-clock"].includes(String(row.timing)) ||
      !["joining", "recording", "interrupted"].includes(String(row.status)) || !["public", "private", "conservative", "unavailable"].includes(String(row.privacy))) return;
    clearTimeout(wait.timer); pending.delete(String(row.requestId)); wait.resolve({status: row.status, privacy: row.privacy} as CapturePrivacyState);
  };
  child.on("message", message);
  const dispose = () => {disposed = true; child.off("message", message); for (const wait of pending.values()) {clearTimeout(wait.timer); wait.resolve(undefined);} pending.clear();};
  child.once("disconnect", dispose); child.once("close", dispose);
  const request = (action: string, timeout = 5000): Promise<CapturePrivacyState | undefined> => {
    if (disposed || !child.connected || pending.size >= 32) return Promise.resolve(undefined);
    return new Promise(resolve => {
      const requestId = randomUUID(), timer = setTimeout(() => {pending.delete(requestId); resolve(undefined);}, timeout);
      pending.set(requestId, {action, resolve, timer});
      try {child.send({version:1,type:"privacy",...owner,requestId,action}, error => {if (error) {clearTimeout(timer); pending.delete(requestId); resolve(undefined);}});}
      catch {clearTimeout(timer); pending.delete(requestId); resolve(undefined);}
    });
  };
  return {dispose, privacy: async (action: "private-start" | "private-end"): Promise<"accepted" | "unavailable"> => {
    if (!["private-start", "private-end"].includes(action)) return "unavailable";
    return await request(action) ? "accepted" : "unavailable";
  }, privacyStatus: async (): Promise<CapturePrivacyState | undefined> => {
    // Initial parent callback precedes child listener installation; bounded challenges wait for actual readiness.
    for (let attempt = 0; attempt < 20 && !disposed; attempt++) {const state = await request("status", 250); if (state) return state;}
    return undefined;
  }};
}
