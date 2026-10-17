import { createHash } from "node:crypto";
import type { NotificationWindow } from "./notification-window.js";
import type { exportSnapshot } from "./snapshot.js";
export type OperationPayload = ReturnType<typeof exportSnapshot> & { notificationWindow?: NotificationWindow; attemptAt?: string; attemptRevision?: number };
export function digestText(snapshot: OperationPayload, runId: string): string {
  const failures = snapshot.notificationWindow;
  const failureText = failures ? `Recent failure notifications: ${failures.returned} (limit 50)\n${Object.entries(failures.bySource).map(([source, count]) => `${source}: ${count}`).join("\n")}\nUnavailable sources (omitted): ${failures.unavailable.join(", ") || "none"}\nOlder failure rows excluded: ${failures.truncated ? "yes" : "no"}\n` : "Failure source snapshot unavailable.\n";
  return `Knowledge Base operations digest\nRun: ${runId}\nAttempt: ${snapshot.attemptAt}\nIntent revision: ${snapshot.attemptRevision}\nReturned sessions: ${snapshot.returned}\nReady (transcription and index done): ${snapshot.ready}\nOlder rows excluded: ${snapshot.truncated ? "yes" : "no"}\n${failureText}This is a bounded metadata snapshot, not a coverage or health score.\n`;
}
export function sheetRows(snapshot: OperationPayload, runId: string): string[][] {
  return [[`Operations run #${snapshot.attemptRevision} at ${snapshot.attemptAt}`, runId, "Scope", "session-metadata-only", snapshot.truncated ? "TRUNCATED" : "RETURNED WINDOW"], ...snapshot.rows];
}
export function contentFingerprint(kind: "digest" | "sheets", tenant: string, content: string, targetBinding = ""): string {
  return createHash("sha256").update(`${tenant}\0${kind}\0${targetBinding}\0${content}`).digest("hex");
}
export function operationFingerprint(kind: "digest" | "sheets", tenant: string, snapshot: OperationPayload, targetBinding = ""): string {
  if (typeof snapshot.attemptAt !== "string" || !Number.isSafeInteger(snapshot.attemptRevision) || Number(snapshot.attemptRevision) < 1) throw new Error("Unbound operation payload");
  return contentFingerprint(kind, tenant, kind === "digest" ? digestText(snapshot, "") : JSON.stringify(sheetRows(snapshot, "")), targetBinding);
}
