import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { listWebinarOperations } from "../api/sessions.js";
import type { WebinarOperation, WebinarDiscoveryHealth } from "../api/types.js";
const DISCOVERY_STALE_MS = 15 * 60 * 1000;

export function MeetingBotPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [rows, setRows] = useState<WebinarOperation[]>([]);
  const [omitted, setOmitted] = useState(0);
  const [discovery, setDiscovery] = useState<Record<"calendar" | "gmail", WebinarDiscoveryHealth> | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true, busy = false;
    setRows([]); setDiscovery(undefined); setLoading(true); setError(null);
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const result = await listWebinarOperations(apiKey);
        if (active) { setRows(result.operations); setDiscovery(result.discovery); setOmitted(result.omitted); setError(null); }
      } catch { if (active) setError("Webinar status unavailable. Check the runner and connection."); }
      finally { busy = false; if (active) setLoading(false); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => { active = false; clearInterval(timer); };
  }, [apiKey]);
  return <>
    <div className="page-header"><h1>Webinar operations</h1>
      <p>Track capture, processing and coverage gaps for your connected webinars.</p></div>
    {error && <p role="alert">{error} Previously loaded statuses may be stale.</p>}
    {loading && <p>Loading webinar status…</p>}
    {!loading && !error && !discovery && <p role="alert">Connected source discovery is unverified. Run a successful discovery check before relying on coverage.</p>}
    {!loading && discovery && (["calendar", "gmail"] as const).map(feed => {
      const row = discovery[feed], age = Date.now() - Date.parse(row.checkedAt);
      const stale = !Number.isFinite(age) || age > DISCOVERY_STALE_MS || age < -60000;
      return <p key={feed} role={row.status === "failed" || stale ? "alert" : undefined}>
        {feed === "gmail" ? "Gmail" : "Calendar"} discovery: {row.status === "failed" ? "unavailable; webinar coverage requires attention" : stale ? "stale; no fresh check within 15 minutes" : "healthy"}.
        {row.lastSuccessAt && <> Last successful check: {new Date(row.lastSuccessAt).toLocaleString()}.</>}
      </p>;
    })}
    {!loading && !error && !rows.length && <div className="card empty-note">No webinar operations recorded for this tenant yet. Check source discovery status above.</div>}
    {omitted > 0 && <p>Showing the latest 200 operations; {omitted} older operations remain in the runner history.</p>}
    {rows.map(row => <div className="card" key={row.id}>
      <h2>{row.title}</h2><p><strong>{row.status.replaceAll("_", " ")}</strong> · Attempts: {row.attempts}</p>
      {row.reason && <p>Reason: {row.reason.replaceAll("-", " ")}</p>}
      {row.startTime && <p>Starts: {new Date(row.startTime).toLocaleString()}</p>}
      {row.updatedAt && <p>Last update: {new Date(row.updatedAt).toLocaleString()}</p>}
      {row.status === "ready" && <Link to={`/sessions/${encodeURIComponent(row.id)}`}>Open recording and knowledge</Link>}
    </div>)}
    <div className="card"><p>Portable audio/video capture is undergoing local validation. Unattended recording requires a verified real webinar on this machine. Windows OBS remains the fallback; Ubuntu support requires independent capture and restart proof.</p></div>
  </>;
}
