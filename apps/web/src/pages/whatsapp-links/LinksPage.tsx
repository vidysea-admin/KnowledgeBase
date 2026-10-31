/** apps/web/src/pages/whatsapp-links/LinksPage.tsx -- unit wa-web (W10; outcomes 1, 2, 4). A member sees only their own link(s) (the server scopes the list); an admin sees every link in the tenant. A viewer gets the read-only note and no request is made. */
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { describeLinkError, listLinks, type LinkState, type LinkView } from "../../api/whatsapp-links.js";
import { useAuth } from "../../auth/AuthContext.js";

export const LIVE_STATES: readonly LinkState[] = ["requested", "approved", "active", "suspended"];
const BADGE: Record<LinkState, string> = { active: "badge badge-good", requested: "badge badge-warn", approved: "badge badge-warn", suspended: "badge badge-warn", rejected: "badge badge-bad", revoked: "badge badge-bad", unlinked: "badge" };

export function StateBadge({ state }: { state: LinkState }): ReactNode {
  return <span className={BADGE[state] ?? "badge"}>{state}</span>;
}

export function LinksPage(): ReactNode {
  const { apiKey, sessionVersion, user } = useAuth();
  return <LinksState key={`${sessionVersion}:${apiKey}`} apiKey={apiKey} role={user?.role ?? null} userId={user?.id ?? null} />;
}

function LinksState({ apiKey, role, userId }: { apiKey: string | null; role: string | null; userId: string | null }): ReactNode {
  const viewer = role === "viewer";
  const [links, setLinks] = useState<LinkView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (viewer) return;
    let cancelled = false;
    listLinks(apiKey).then((r) => { if (!cancelled) setLinks(r.links); }).catch((e: unknown) => { if (!cancelled) setError(describeLinkError(e)); });
    return () => { cancelled = true; };
  }, [apiKey, viewer]);

  if (viewer) return (
    <div>
      <div className="page-header"><h1>WhatsApp links</h1></div>
      <section className="card"><p role="status" className="empty-note">Your role is read-only, so there is nothing to link or choose here. Approved knowledge from WhatsApp appears in Search and Ask.</p></section>
    </div>
  );

  const isAdmin = role === "admin";
  const canRequest = (role === "member" || isAdmin) && links !== null && !links.some((l) => l.userId === userId && LIVE_STATES.includes(l.state));
  const waiting = links?.filter((l) => l.state === "requested").length ?? 0;
  return (
    <div>
      <div className="page-header">
        <h1>WhatsApp links</h1>
        <p>{isAdmin ? `${waiting} request(s) waiting for approval.` : "Link your own WhatsApp account, then choose which groups are captured."}</p>
      </div>
      <section className="card">
        {error && <p role="alert" className="error-note">{error}</p>}
        {links === null && !error && <p className="empty-note">Loading…</p>}
        {links?.length === 0 && <p className="empty-note">No WhatsApp links yet.</p>}
        {links?.map((l) => (
          <div key={l.id} className="row-card">
            <div className="row-title"><Link to={`/whatsapp/links/${encodeURIComponent(l.id)}`}>{l.label}</Link> <StateBadge state={l.state} /></div>
            <div className="row-meta">
              {isAdmin ? (l.legacy ? "Legacy link (no owner yet)" : `Owner ${l.userId}`) : "Your link"}
              {l.health?.flags?.includes("needs-relink") ? " · needs re-linking" : ""}
            </div>
          </div>
        ))}
        {canRequest && <p><Link to="/whatsapp/links/new">Request a WhatsApp link</Link></p>}
      </section>
    </div>
  );
}
