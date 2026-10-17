export const emptyConfiguration = { exportScope: "session-metadata-only", schedules: (["digest", "sheets"] as const).map(kind => ({ kind, revision: 0, enabled: false, intervalHours: 24, nextRunAt: null, lastAttemptAt: null, lastSuccessAt: null, lastResult: "never", lastErrorCode: null, runId: null, available: false })) };
export function integrationPayload(url: string): unknown | null {
  return url.endsWith("/operations-integrations/preview") ? { exportScope: "session-metadata-only", returned: 0, ready: 0, truncated: false } : url.endsWith("/operations-integrations") ? emptyConfiguration : null;
}
