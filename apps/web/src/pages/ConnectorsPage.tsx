import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../api/client.js";
import {
  intakeConnectorUrl, loadConnectorOverview, openRecordingRequest, receiveRecordingUrl, updateRecordingRequest,
  verifyConnectorWatched, checkConnectorJob, type ConnectorJob, type ConnectorOverview, type ConnectorWatchReport,
} from "../api/connector-workflow.js";

export function ConnectorsPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  const [query] = useSearchParams();
  const resumeJob = query.get("job") ?? "";
  const resumeRequest = query.get("recordingRequest") ?? "";
  const [overviewData, setOverview] = useState<ConnectorOverview | null>(null);
  const [overviewOwner, setOverviewOwner] = useState<object | null>(null);
  const authOwner = useMemo(() => ({}), [apiKey, sessionVersion]);
  const overview = overviewOwner === authOwner ? overviewData : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [sourceRefs, setSourceRefs] = useState<Record<string, string>>({});
  const [recordingUrls, setRecordingUrls] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [watchReport, setWatchReport] = useState<ConnectorWatchReport | null>(null);
  const [jobs, setJobs] = useState<{ job: ConnectorJob; recordingRequestId?: string; verified: boolean }[]>([]);
  const [recoveryJobId, setRecoveryJobId] = useState("");
  const [recoveryRequestId, setRecoveryRequestId] = useState("");
  const generation = useRef(0);
  const requestId = useRef<string | null>(null);
  const intakeRequestId = useRef<string | null>(null);
  const recordingRequestIds = useRef<Record<string, string>>({});
  const nonce = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  // Results from a previous authenticated session cannot replace a newer tenant's state.
  useEffect(() => {
    const revision = ++generation.current;
    setOverview(null); setError(null); setSessionId(null); setWatchReport(null); setSourceRefs({});
    setOverviewOwner(null);
    setBusy(false); setDescription(""); setOwner(""); setUrl(""); setRecordingUrls({});
    requestId.current = null;
    intakeRequestId.current = null; recordingRequestIds.current = {}; setJobs([]);
    void loadConnectorOverview(apiKey).then((data) => {
      if (generation.current === revision) { setOverview(data); setOverviewOwner(authOwner); }
    }).catch((err: unknown) => {
      if (generation.current === revision) setError(err instanceof ApiError ? err.message : "Could not load connectors.");
    });
    return () => { generation.current++; };
  }, [apiKey, sessionVersion, authOwner]);
  useEffect(() => { setRecoveryJobId(resumeJob); setRecoveryRequestId(resumeRequest); }, [resumeJob, resumeRequest, authOwner]);

  async function act(work: () => Promise<void>, refresh = true) {
    const revision = generation.current;
    setBusy(true); setError(null);
    try {
      await work();
      if (refresh) {
        const next = await loadConnectorOverview(apiKey);
        if (generation.current === revision) { setOverview(next); setOverviewOwner(authOwner); }
      }
    } catch (err) {
      if (generation.current === revision) setError(err instanceof ApiError ? err.message : "Action failed; no success has been confirmed.");
    } finally { if (generation.current === revision) setBusy(false); }
  }
  function submitUrl(event: FormEvent) {
    event.preventDefault();
    const revision = generation.current;
    setSessionId(null);
    void act(async () => {
      intakeRequestId.current ??= nonce();
      const result = await intakeConnectorUrl(apiKey, url, intakeRequestId.current);
      if (generation.current === revision) {
        if (result.job) setJobs(current => [...current.filter(item => item.job.jobId !== result.job!.jobId), { job: result.job!, verified: false }]);
        else if (result.sessionId) setSessionId(result.sessionId);
        setUrl(""); intakeRequestId.current = null;
      }
    });
  }
  function submitRequest(event: FormEvent) {
    event.preventDefault();
    const revision = generation.current;
    requestId.current ??= nonce();
    const id = requestId.current;
    void act(async () => {
      await openRecordingRequest(apiKey, { description, requestedFrom: owner, slaDays: 3, requestId: id });
      if (generation.current === revision) { setDescription(""); setOwner(""); requestId.current = null; }
    });
  }
  return <>
    <div className="page-header"><h1>Connectors and recordings</h1><p>Bring in public content, track recording requests, and verify watched changes.</p></div>
    {error && <div role="alert" className="error-note">{error}</div>}
    {!overview && !error && <p>Loading connectors…</p>}
    {overview && <>
      <div className="card"><h2>Available connectors</h2>
        {overview.capabilities.length === 0 && <p>Connector readiness has not been configured for this deployment.</p>}
        {overview.capabilities.map((c) => <p key={c.id}><strong>{c.label}</strong>: {c.state === "configured" ? "Configured" : "Action required"}. {c.detail}</p>)}
        <p>Configured access still needs verification against your source.</p>
        <form onSubmit={submitUrl}><label htmlFor="connector-url">Public or on-demand URL</label>
          <input id="connector-url" type="url" required value={url} onChange={(e) => { setUrl(e.target.value); intakeRequestId.current = null; }} />
          <button disabled={busy} type="submit">Ingest and index</button>
        </form>
        {overview.intakeMode === "durable-jobs" && <>
          <p>Supported recording URLs are queued for the worker. Check the job before confirming consumption. Other sources need a supported worker adapter.</p>
          <form onSubmit={event => {
            event.preventDefault(); const revision = generation.current;
            void act(async () => {
              const recordingRequestId = recoveryRequestId.trim() || undefined;
              const result = await checkConnectorJob(apiKey, recoveryJobId.trim(), recordingRequestId);
              if (generation.current === revision) setJobs(current => [...current.filter(item => item.job.jobId !== result.job.jobId), {
                job: result.job, recordingRequestId, verified: result.job.state === "succeeded" && (!recordingRequestId || result.receipt?.status === "received"),
              }]);
            });
          }}>
            <label htmlFor="resume-source-job">Saved source job ID</label>
            <input id="resume-source-job" required pattern="[a-f0-9]{64}" value={recoveryJobId} onChange={e => setRecoveryJobId(e.target.value)} />
            <label htmlFor="resume-recording-request">Recording request ID, if applicable</label>
            <input id="resume-recording-request" value={recoveryRequestId} onChange={e => setRecoveryRequestId(e.target.value)} />
            <button type="submit" disabled={busy}>Resume source job</button>
          </form>
        </>}
        {sessionId && <p>Content consumed. <Link to={`/sessions/${encodeURIComponent(sessionId)}`}>View session</Link></p>}
        {jobs.map(item => <article key={item.job.jobId}>
          <p>Source job: {item.job.state === "succeeded" && !item.verified ? "awaiting consumption confirmation" : item.job.state}</p>
          <Link to={`/connectors?job=${encodeURIComponent(item.job.jobId)}${item.recordingRequestId ? `&recordingRequest=${encodeURIComponent(item.recordingRequestId)}` : ""}`}>Save or reopen this job</Link>
          {item.job.state === "uncertain" && <p>Action required: {item.job.reason ?? "execution unconfirmed"}. Review the source gap before retrying.</p>}
          {item.verified && item.job.state === "succeeded" && item.job.result && <Link to={`/sessions/${encodeURIComponent(item.job.result.sessionId)}`}>View consumed session</Link>}
          {!item.verified && item.job.state !== "uncertain" && <button disabled={busy} onClick={() => {
            const revision = generation.current;
            void act(async () => {
              const result = await checkConnectorJob(apiKey, item.job.jobId, item.recordingRequestId);
              if (generation.current === revision) setJobs(current => current.map(old => old.job.jobId === item.job.jobId
                ? { ...old, job: result.job, verified: result.job.state === "succeeded" && (!old.recordingRequestId || result.receipt?.status === "received") } : old));
            });
          }}>Check source job</button>}
        </article>)}
      </div>
      <div className="card"><h2>Missing recording requests</h2>
        <form onSubmit={submitRequest}>
          <label htmlFor="recording-description">Session or missing recording</label>
          <input id="recording-description" required maxLength={1000} value={description} onChange={(e) => { setDescription(e.target.value); requestId.current = null; }} />
          <label htmlFor="recording-owner">Owner reference</label>
          <input id="recording-owner" required maxLength={200} placeholder="org:toc-bhakti" value={owner} onChange={(e) => { setOwner(e.target.value); requestId.current = null; }} />
          <p>Requests are due in three days. Creating a request records the standing ask; it does not send a message.</p>
          <button disabled={busy} type="submit">Track recording request</button>
        </form>
        {overview.gaps.length === 0 && <p>No recording requests or connector gaps are recorded.</p>}
        {overview.gapsTruncated && <p>More requests exist.</p>}
        {overview.gaps.map((gap) => <article key={gap._id} className="card">
          <p><strong>{gap.description ?? gap._id}</strong> — {gap.status}</p>
          <p>Owner: {gap.requestedFrom ?? "Unassigned"}. Due: {gap.sla?.dueAt ?? "Not recorded"}</p>
          {gap.kind === "source-pending" && gap.status === "open" && <p>Action required. Resolve source access or intake and retry.</p>}
          {gap.kind === "recording-pending" && gap.status === "open" && <>
            <label htmlFor={`recording-url-${gap._id}`}>Recording URL</label>
            <input id={`recording-url-${gap._id}`} type="url" value={recordingUrls[gap._id] ?? ""} onChange={(e) => { setRecordingUrls({ ...recordingUrls, [gap._id]: e.target.value }); delete recordingRequestIds.current[gap._id]; }} />
            <button disabled={busy || !recordingUrls[gap._id]} onClick={() => {
              const revision = generation.current;
              void act(async () => {
                recordingRequestIds.current[gap._id] ??= nonce();
                const result = await receiveRecordingUrl(apiKey, gap._id, recordingUrls[gap._id]!, recordingRequestIds.current[gap._id]);
                if (generation.current === revision && result.job) setJobs(current => [...current.filter(item => item.job.jobId !== result.job!.jobId),
                  { job: result.job!, recordingRequestId: gap._id, verified: false }]);
              });
            }}>Ingest and receive recording</button>
            <label htmlFor={`receipt-${gap._id}`}>Ingested recording source ID</label>
            <input id={`receipt-${gap._id}`} value={sourceRefs[gap._id] ?? ""} onChange={(e) => setSourceRefs({ ...sourceRefs, [gap._id]: e.target.value })} />
            <p>Existing recordings are checked and indexed before confirmation.</p>
            <button disabled={busy || !sourceRefs[gap._id]} onClick={() => void act(async () => { await updateRecordingRequest(apiKey, gap._id, "received", sourceRefs[gap._id]); })}>Confirm consumed recording</button>
            <button disabled={busy || !gap.sla || Date.parse(gap.sla.dueAt) > Date.now()} onClick={() => void act(async () => { await updateRecordingRequest(apiKey, gap._id, "expired"); })}>Expire overdue request</button>
          </>}
        </article>)}
        {overview.nextGapCursor && <button disabled={busy} onClick={() => {
          const revision = generation.current;
          void act(async () => {
            const next = await loadConnectorOverview(apiKey, overview.nextGapCursor!);
            if (generation.current === revision) { setOverview((current) => current ? { ...next, gaps: [...current.gaps, ...next.gaps] } : next); setOverviewOwner(authOwner); }
          }, false);
        }}>Load more recording requests</button>}
      </div>
      <div className="card"><h2>Watched source verification</h2>
        <p>Changed snapshots are ingested and indexed before the verified hash is saved. This is a manual verification run.</p>
        {!overview.watchedConfigured && <p>Watched verification needs deployment configuration.</p>}
        <button disabled={busy || !overview.watchedConfigured} onClick={() => {
          const revision = generation.current;
          setWatchReport(null);
          void act(async () => { const report = await verifyConnectorWatched(apiKey); if (generation.current === revision) setWatchReport(report); });
        }}>Verify due watched sources</button>
        {watchReport && <div role="status"><p>{watchReport.remaining} source(s) remain untouched.</p>
          {watchReport.outcomes.map((outcome) => <p key={outcome.id}>{outcome.id}: {outcome.status}
            {outcome.sessionId && <> — <Link to={`/sessions/${encodeURIComponent(outcome.sessionId)}`}>View session</Link></>}
            {outcome.code && <> — action required ({outcome.code})</>}
          </p>)}
        </div>}
      </div>
    </>}
  </>;
}
