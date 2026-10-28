import { useEffect, useRef, useState } from "react";
import { cancelManualJob, listManualJobs, type ManualJob } from "../../api/send-now.js";
import { ApiError } from "../../api/client.js";

const terminal = (job: ManualJob) => ["cancelled", "completed", "failed"].includes(job.state);
/** Persistent server history survives navigation/reload. Cancel is intent until the owner acknowledges and exits. */
export function ManualJobsSection({ apiKey, refresh }: { apiKey: string | null; refresh: number }): React.ReactElement {
  const [jobs, setJobs] = useState<ManualJob[]>([]), [message, setMessage] = useState("");
  const [jobOwner, setJobOwner] = useState(apiKey);
  const [busy, setBusy] = useState(false), [tick, setTick] = useState(0);
  const owner = useRef({ key: apiKey, generation: 0 });
  if (owner.current.key !== apiKey) owner.current = { key: apiKey, generation: owner.current.generation + 1 };
  useEffect(() => {
    const generation = ++owner.current.generation;
    setJobOwner(apiKey); setJobs([]); setMessage(""); setBusy(false);
    if (!apiKey) return;
    setBusy(true);
    void listManualJobs(apiKey).then(values => {
      if (generation === owner.current.generation) setJobs(values);
    }).catch(error => {
      if (generation !== owner.current.generation) return;
      setMessage(error instanceof ApiError && error.status === 404
        ? "Durable manual job controls are not available on this server."
        : "Could not read manual jobs. Recorder state and meeting admission are unknown.");
    }).finally(() => { if (generation === owner.current.generation) setBusy(false); });
    return () => { owner.current.generation++; };
  }, [apiKey, refresh, tick]);
  const visibleJobs = jobOwner === apiKey ? jobs : [];
  const visibleMessage = jobOwner === apiKey ? message : "";
  async function cancel(jobId: string): Promise<void> {
    if (!apiKey || busy) return;
    const generation = owner.current.generation;
    setBusy(true); setMessage("");
    try {
      const job = await cancelManualJob(apiKey, jobId);
      if (generation !== owner.current.generation) return;
      setJobs(values => values.map(value => value.jobId === jobId ? job : value));
      setMessage(terminal(job) ? "The job is already terminal. Refresh to read its final state."
        : "Cancellation was requested. Recorder shutdown is confirmed only when the job becomes cancelled.");
    } catch {
      if (generation === owner.current.generation) setMessage("Cancellation could not be confirmed. Refresh before retrying; the recorder may still be running.");
    } finally { if (generation === owner.current.generation) setBusy(false); }
  }
  return <div aria-label="Manual bot jobs">
    <h3>Manual jobs</h3>
    <p>Recorder status is shown here. Meeting admission remains unknown. A requested cancellation can wait while the recorder starts.</p>
    <button type="button" disabled={!apiKey || busy} onClick={() => setTick(value => value + 1)}>{busy ? "Loading jobs..." : "Refresh jobs"}</button>
    {visibleMessage && <p role="status">{visibleMessage}</p>}
    {!busy && !visibleMessage && visibleJobs.length === 0 && <p>No manual jobs were returned.</p>}
    {visibleJobs.map(job => <div key={job.jobId}>
      <p>{job.platform} — {job.state} — {job.jobId}</p>
      {!terminal(job) && <button type="button" disabled={busy || !apiKey || job.state === "cancel-requested" || job.state === "cancel-acknowledged"}
        onClick={() => void cancel(job.jobId)}>Cancel job</button>}
    </div>)}
  </div>;
}
