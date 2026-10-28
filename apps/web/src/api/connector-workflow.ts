import { apiFetch } from "./client.js";

export interface ConnectorCapability {
  id: string;
  label: string;
  state: "configured" | "action-required";
  detail: string;
}
export interface RecordingRequest {
  _id: string;
  kind: "recording-pending" | "source-pending";
  description?: string;
  requestedFrom?: string;
  requestedAt?: string;
  status: "open" | "received" | "expired";
  sourceRef?: string;
  sla?: { dueAt: string };
}
export interface ConnectorOverview {
  capabilities: ConnectorCapability[];
  gaps: RecordingRequest[];
  gapsTruncated: boolean;
  nextGapCursor?: string | null;
  watchedConfigured: boolean;
  intakeMode?: "durable-jobs" | "direct";
}
export interface ConnectorJob {
  jobId: string;
  state: "queued" | "running" | "succeeded" | "uncertain";
  revision: number;
  createdAt: string;
  updatedAt: string;
  result?: { sessionId: string; sourceId: string; turnCount?: number };
  reason?: string;
}
export interface ConnectorIntakeResponse { status?: string; sessionId?: string; job?: ConnectorJob }
export interface ConnectorJobResponse { job: ConnectorJob; gapId?: string; receipt?: { status: string; repeated: boolean } }
export interface ConnectorWatchReport {
  outcomes: { id: string; status: "changed" | "unchanged" | "not-due" | "failed"; sessionId?: string; gapId?: string; code?: string }[];
  remaining: number;
}
export function loadConnectorOverview(apiKey: string | null, after?: string): Promise<ConnectorOverview> {
  return apiFetch(`/connector-workflow${after ? `?after=${encodeURIComponent(after)}` : ""}`, apiKey);
}
export function openRecordingRequest(apiKey: string | null, input: { description: string; requestedFrom: string; slaDays: number; requestId?: string }): Promise<{ gap: RecordingRequest }> {
  return apiFetch("/connector-workflow/recording-requests", apiKey, { method: "POST", body: input });
}
export function updateRecordingRequest(apiKey: string | null, id: string, status: "received" | "expired", sourceRef?: string): Promise<{ status: string; repeated: boolean }> {
  return apiFetch(`/connector-workflow/recording-requests/${encodeURIComponent(id)}`, apiKey, { method: "PUT", body: { status, ...(sourceRef ? { sourceRef } : {}) } });
}
export function receiveRecordingUrl(apiKey: string | null, id: string, url: string, requestId?: string): Promise<ConnectorIntakeResponse> {
  return apiFetch(`/connector-workflow/recording-requests/${encodeURIComponent(id)}/receive`, apiKey, { method: "POST", body: { url, requestId } });
}
export function intakeConnectorUrl(apiKey: string | null, url: string, requestId?: string): Promise<ConnectorIntakeResponse> {
  return apiFetch("/connector-workflow/intake", apiKey, { method: "POST", body: { url, requestId } });
}
export function checkConnectorJob(apiKey: string | null, jobId: string, recordingRequestId?: string): Promise<ConnectorJobResponse> {
  return apiFetch(recordingRequestId
    ? `/connector-workflow/recording-requests/${encodeURIComponent(recordingRequestId)}/receive-job`
    : `/connector-workflow/jobs/${encodeURIComponent(jobId)}/check`, apiKey, { method: "POST", ...(recordingRequestId ? { body: { jobId } } : {}) });
}
export function verifyConnectorWatched(apiKey: string | null): Promise<ConnectorWatchReport> {
  return apiFetch("/connector-workflow/watched/verify", apiKey, { method: "POST" });
}
