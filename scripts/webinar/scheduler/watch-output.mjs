/** Public CLI projection; private durable state is never serialized wholesale. */
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STATUSES = ['queued', 'recording', 'processing', 'failed', 'ready', 'action_required'];
const PHASES = ['submitting', 'awaiting-confirmation', 'uncertain', 'action_required', 'confirmed'];
export function projectWatchResult(result, reasons, safeText, registrationReasons = []) {
  const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value ? safeText(value) : undefined;
  const rows = result?.operations && typeof result.operations === 'object' && !Array.isArray(result.operations)
    ? Object.entries(result.operations) : [];
  const items = rows.slice(0, 200).flatMap(([id, row]) => !ID.test(id) || !row || typeof row !== 'object' ? [] : [{
    id: safeText(id), status: STATUSES.includes(row.status) ? safeText(row.status) : undefined,
    registrationPhase: PHASES.includes(row.registration?.phase) ? safeText(row.registration.phase) : undefined,
    registrationReason: registrationReasons.includes(row.registrationReason) ? row.registrationReason : undefined,
    reason: row.reason === undefined ? undefined : reasons.includes(row.reason) ? safeText(row.reason) : 'details-private',
    updatedAt: stamp(row.updatedAt), startTime: stamp(row.startTime), endTime: stamp(row.endTime), completedAt: stamp(row.completedAt),
  }]);
  return {status: ['preview', 'running'].includes(result?.status) ? result.status : 'unavailable',
    toRecord: Array.isArray(result?.toRecord) ? result.toRecord.length : 0,
    skipped: Array.isArray(result?.skipped) ? result.skipped.length : 0,
    operations: {total: rows.length, omitted: rows.length - items.length, items}};
}
