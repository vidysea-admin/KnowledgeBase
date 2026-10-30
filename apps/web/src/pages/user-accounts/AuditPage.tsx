/** apps/web/src/pages/user-accounts/AuditPage.tsx -- unit ua-web, UA-25. Read-only view of the append-only account audit log (closed-vocabulary rows only). */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { describeAuthError, listAudit, type AuditEvent } from "../../api/user-accounts.js";

export function AuditPage(): ReactNode {
  const [params] = useSearchParams();
  const targetUserId = params.get("user") ?? undefined;
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    try {
      const page = await listAudit({ ...(cursor ? { cursor } : {}), ...(targetUserId ? { targetUserId } : {}) });
      setEvents((prev) => (cursor && prev ? [...prev, ...page.events] : page.events));
      setNext(page.next); setError(null);
    } catch (err) { setError(describeAuthError(err)); }
  }, [targetUserId]);
  useEffect(() => { setEvents(null); void load(); }, [load]);

  return (
    <div>
      <div className="page-header"><h1>Account audit</h1><p>{targetUserId ? <>Events for one user · <Link to="/admin/audit">show all</Link></> : "Sign-ins, approvals, role and session changes."}</p></div>
      <section className="card">
        {error && <p role="alert" className="error-note">{error}</p>}
        {events === null && !error && <p className="empty-note">Loading…</p>}
        {events?.length === 0 && <p className="empty-note">No events.</p>}
        {events && events.length > 0 && (
          <table>
            <thead><tr><th>When</th><th>Event</th><th>Outcome</th><th>Detail</th><th>Actor</th><th>Target</th><th>Network</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString()}</td><td>{e.type}</td><td>{e.outcome}</td><td>{e.detail}</td>
                  <td>{e.actorUserId ?? ""}</td><td>{e.targetUserId ?? ""}</td><td>{e.ipPrefix ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {next && <button type="button" onClick={() => void load(next)}>Load more</button>}
      </section>
    </div>
  );
}
