import type { Gaps, Sources, WatchedSources } from "@lkb/core";
import type { IntakeSink, GuardedFetcher } from "@lkb/ingest";
import type { SourceIntakeDeps } from "../source-intake/store.js";
import type { BoundIndexer } from "../indexing/session.js";
import type { IndexSessionResult } from "../indexing/types.js";
import type { SourceJobStore } from "../source-intake/jobs/types.js";

export interface ConnectorCapability {
  id: string;
  label: string;
  state: "configured" | "action-required";
  detail: string;
}
export interface ConnectorWorkflowStore {
  assertWritableTenant(tenantId: string): void;
  listGaps(tenantId: string, afterId?: string): Promise<Gaps[]>;
  findGap(tenantId: string, id: string): Promise<Gaps | null>;
  createGap(tenantId: string, doc: Omit<Gaps, "tenantId">): Promise<void>;
  transitionGap(tenantId: string, id: string, from: Gaps["status"], to: Gaps["status"], sourceRef?: string): Promise<boolean>;
  findSource(tenantId: string, id: string): Promise<Sources | null>;
  hasConsumedSource(tenantId: string, sourceId: string, sessionId?: string): Promise<boolean>;
  recordConsumedSource(tenantId: string, sourceId: string, sessionId: string, result: IndexSessionResult): Promise<boolean>;
  hasConsumedRecording(tenantId: string, sourceId: string): Promise<boolean>;
  recordingSession(tenantId: string, sourceId: string): Promise<string | null>;
  resolveWatchedFailures(tenantId: string, watchedSourceId: string, sourceRef: string): Promise<void>;
  resolveIntakeFailures(tenantId: string, sourceUrlHash: string, sourceRef: string): Promise<void>;
  resolveRecordingFailures(tenantId: string, sourceRef: string): Promise<void>;
  resolveSourceJobFailure(tenantId: string, jobId: string, sourceRef: string): Promise<boolean>;
  reopenSourceJobFailure(tenantId: string, jobId: string): Promise<boolean>;
  listWatched(tenantId: string): Promise<WatchedSources[]>;
  recordFetch(tenantId: string, id: string, previousHash: string | null, lastFetch: NonNullable<WatchedSources["lastFetch"]>): Promise<boolean>;
}
export interface ConnectorWorkflowDeps {
  store: ConnectorWorkflowStore;
  capabilities: ConnectorCapability[];
  sourceIntake?: SourceIntakeDeps;
  sourceJobs?: SourceJobStore;
  indexSession?: BoundIndexer;
  watched?: { fetcher: GuardedFetcher; sink: IntakeSink; indexSession: BoundIndexer };
  now(): string;
  newId(): string;
}
export class ConnectorWorkflowError extends Error {
  constructor(readonly status: number, readonly code: string, readonly sourceRef?: string) { super(code); }
}
export function connectorPublicUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096) throw new ConnectorWorkflowError(400, "invalid_url");
  let u: URL;
  try { u = new URL(value); } catch { throw new ConnectorWorkflowError(400, "invalid_url"); }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new ConnectorWorkflowError(400, "invalid_url");
  return u.href;
}
export function connectorText(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    throw new ConnectorWorkflowError(400, "invalid_input");
  }
  return value.trim();
}
export function isConnectorRecordingSource(source: Sources): boolean {
  if (source.kind === "recording") return true;
  const metadata = source.sourceMeta;
  const platform = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).platform : undefined;
  return source.kind === "url" && typeof source.path === "string" && Boolean(source.path) &&
    typeof platform === "string" && ["youtube", "cloudonair", "zoom-recording"].includes(platform);
}
export function assertConnectorIndexConsumed(result: IndexSessionResult, sessionId: string): void {
  const receipt = result.completion;
  if (result.sessionId !== sessionId || result.summary?.degraded !== null || result.claims?.degraded !== null ||
      receipt?.version !== 2 || receipt.complete !== true || receipt.treeWritten !== true ||
      typeof receipt.strict !== "boolean" ||
      !Number.isInteger(receipt.turnCount) || receipt.turnCount < 1 || typeof receipt.generation !== "string" || !receipt.generation ||
      result.chunks.skipped !== null || !Number.isInteger(result.chunks.written) || result.chunks.written < 1 || result.entities?.skipped) {
    throw new ConnectorWorkflowError(502, "indexing_incomplete");
  }
}
