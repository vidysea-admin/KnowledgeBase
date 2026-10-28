import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client.js";
import { loadConfiguration, loadPreview, reconcileSchedule, runSchedule, saveSchedule, type Configuration, type Schedule } from "./client.js";
const title = (kind: Schedule["kind"]) => kind === "digest" ? "Email digest" : "Google Sheets sync";
function message(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "This action needs the configured operations role and scopes.";
  if (error instanceof ApiError && error.status === 409) return "The configuration changed, execution is disabled, or delivery needs reconciliation. Refresh before trying again.";
  return "Unable to complete this integration request. No successful delivery is established.";
}
function ScheduleEditor({ apiKey, initial, available }: { apiKey: string; initial: Schedule; available: boolean }) {
  const [schedule, setSchedule] = useState(initial), [enabled, setEnabled] = useState(initial.enabled), [interval, setInterval] = useState(initial.intervalHours);
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const [confirmRun, setConfirmRun] = useState(false), alive = useRef(true);
  const [confirmReceipt, setConfirmReceipt] = useState(false), [receiptNotice, setReceiptNotice] = useState<string | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const perform = async (action: "save" | "run" | "reconcile") => {
    if (pending || action === "run" && !confirmRun || action === "reconcile" && !confirmReceipt) return;
    setPending(true); setError(null);
    try { const next = action === "run" ? await runSchedule(apiKey, schedule) : action === "reconcile" ? await reconcileSchedule(apiKey, schedule) : await saveSchedule(apiKey, schedule, enabled, interval); if (alive.current) { setSchedule(next); setEnabled(next.enabled); setInterval(next.intervalHours); setConfirmRun(false); setConfirmReceipt(false); setReceiptNotice(action === "reconcile" ? next.lastResult === "succeeded" ? "The prior receipt was verified. The schedule remains disabled until you explicitly save it as enabled." : "No matching verified receipt was established. No delivery was retried." : null); } }
    catch (failure) { if (alive.current) setError(message(failure)); }
    finally { if (alive.current) setPending(false); }
  };
  return <section className="card" aria-label={title(schedule.kind)}><h3>{title(schedule.kind)}</h3>
    <p>{available ? "Operator-configured target and credentials are present; live delivery is verified only by a successful run." : "Approved target, credentials or external execution permission are unavailable; no delivery can run."}</p>
    <label><input type="checkbox" checked={enabled} disabled={pending || !available || schedule.lastResult === "uncertain"} onChange={event => setEnabled(event.target.checked)} /> Enable {title(schedule.kind)} schedule</label>
    <label>{title(schedule.kind)} frequency <select value={interval} disabled={pending} onChange={event => setInterval(Number(event.target.value) as 24 | 168)}><option value={24}>Daily</option><option value={168}>Weekly</option></select></label>
    <button type="button" disabled={pending || schedule.lastResult === "running"} onClick={() => void perform("save")}>Save {title(schedule.kind)} settings</button>
    <p>Status: {schedule.lastResult}; next run: {schedule.nextRunAt ?? "Not scheduled"}; last attempt: {schedule.lastAttemptAt ?? "Never"}; last verified success: {schedule.lastSuccessAt ?? "None"}.</p>
    {schedule.lastErrorCode && <p>Result code: {schedule.lastErrorCode}.</p>}
    {schedule.lastResult === "uncertain" && <p role="alert">Delivery may have happened. This schedule is disabled and cannot be retried automatically; an operator must reconcile the external receipt.</p>}
    {schedule.lastResult === "uncertain" && <><label><input type="checkbox" checked={confirmReceipt} disabled={pending || !available} onChange={event => setConfirmReceipt(event.target.checked)} /> I confirm checking the prior {title(schedule.kind)} receipt without resending.</label><button type="button" disabled={pending || !available || !confirmReceipt} onClick={() => void perform("reconcile")}>Check {title(schedule.kind)} receipt</button></>}
    <label><input type="checkbox" checked={confirmRun} disabled={pending || !available || !schedule.enabled || schedule.lastResult === "uncertain" || schedule.lastResult === "running"} onChange={event => setConfirmRun(event.target.checked)} /> I confirm running {title(schedule.kind)} now against the operator-approved destination.</label>
    <button type="button" disabled={pending || !confirmRun || !available || !schedule.enabled || schedule.lastResult === "uncertain" || schedule.lastResult === "running"} onClick={() => void perform("run")}>Run {title(schedule.kind)} now</button>
    {receiptNotice && <p role="status">{receiptNotice}</p>}
    {pending && <p role="status">Processing integration request…</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
export function OperationsIntegrationsPanel({ apiKey }: { apiKey: string }): React.ReactElement {
  const [config, setConfig] = useState<Configuration | null>(null), [configError, setConfigError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof loadPreview>> | null>(null), [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadConfiguration(apiKey).then(data => { if (!cancelled) setConfig(data); }, error => { if (!cancelled) setConfigError(message(error)); });
    void loadPreview(apiKey).then(data => { if (!cancelled) setPreview(data); }, error => { if (!cancelled) setPreviewError(message(error)); });
    return () => { cancelled = true; };
  }, [apiKey]);
  return <section aria-label="Digests and Sheets"><h2>Digests and Sheets</h2>
    <p>Server-stored schedules use exact operator-approved destinations. Email contains bounded session counts. Sheets writes session IDs, titles, dates and stage statuses to its dedicated export tab; transcripts, speaker details and raw source locations are excluded.</p>
    <p>Saving a schedule does not deliver it. The host's one-shot scheduler must be configured; the last verified success is reported separately from configuration.</p>
    {previewError ? <p role="alert">Export preview: {previewError}</p> : !preview ? <p role="status">Loading export preview…</p> : <p>{preview.returned} returned sessions in export preview; {preview.ready} with transcription and index done.{preview.truncated ? " Older sessions are excluded from this bounded window." : ""}</p>}
    {configError ? <p role="alert">Integration configuration: {configError}</p> : !config ? <p role="status">Loading integration configuration…</p> : config.schedules.map(schedule => <ScheduleEditor key={schedule.kind} apiKey={apiKey} initial={schedule} available={schedule.available} />)}
  </section>;
}
