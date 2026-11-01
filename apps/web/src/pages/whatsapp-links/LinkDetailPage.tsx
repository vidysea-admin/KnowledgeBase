/**
 * apps/web/src/pages/whatsapp-links/LinkDetailPage.tsx -- unit wa-web (W10; outcomes 1, 2, 4; R-3, R-5, R-7, R-14, R-34, R-35).
 * One link: its state and health, the owner's controls (connect, choose groups, unlink) and the admin's controls (approve with the
 * student-data class, reject, suspend, resume, revoke). The server is the authority for every action; the client only decides what
 * to offer, and offers owner controls to the owner alone (an admin looking at someone else's link sees no connect control).
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { approveLink, describeLinkError, getLink, linkAction, type LinkAction, type LinkView, type StudentData } from "../../api/whatsapp-links.js";
import { useAuth } from "../../auth/AuthContext.js";
import { LIVE_STATES, StateBadge } from "./LinksPage.js";

/** A link whose last archiver status is older than this (or absent) shows "liveness unknown" instead of a stale "connected" (R-34). */
export const LIVENESS_STALE_MS = 15 * 60 * 1000;
const when = (iso?: string): string => (iso ? new Date(iso).toLocaleString() : "never");

export function LinkDetailPage(): ReactNode {
  const { apiKey, sessionVersion, user } = useAuth();
  const { id = "" } = useParams<{ id: string }>();
  return <DetailState key={`${sessionVersion}:${apiKey}:${id}`} apiKey={apiKey} id={id} userId={user?.id ?? null} role={user?.role ?? null} />;
}

function DetailState({ apiKey, id, userId, role }: { apiKey: string | null; id: string; userId: string | null; role: string | null }): ReactNode {
  const [link, setLink] = useState<LinkView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [studentData, setStudentData] = useState<StudentData>("no");
  const [confirm, setConfirm] = useState<LinkAction | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLink(apiKey, id).then((r) => { if (!cancelled) { setLink(r.link); if (r.link.studentData) setStudentData(r.link.studentData); } }).catch((e: unknown) => { if (!cancelled) setError(describeLinkError(e)); });
    return () => { cancelled = true; };
  }, [apiKey, id]);

  async function run(label: string, fn: () => Promise<{ link: LinkView }>): Promise<void> {
    if (busy) return;
    setBusy(true); setError(null); setNote(null); setConfirm(null);
    try { const r = await fn(); setLink(r.link); setNote(label); } catch (e) { setError(describeLinkError(e)); } finally { setBusy(false); }
  }

  if (!link) return (
    <div><div className="page-header"><h1>WhatsApp link</h1></div><section className="card">
      {error ? <p role="alert" className="error-note">{error}</p> : <p className="empty-note">Loading…</p>}
      <p><Link to="/whatsapp/links">All links</Link></p>
    </section></div>
  );

  const isOwner = userId !== null && link.userId === userId;
  const isAdmin = role === "admin";
  const live = LIVE_STATES.includes(link.state);
  const flags = link.health?.flags ?? [];
  const needsRelink = flags.includes("needs-relink");
  const expired = link.state === "approved" && link.approvalExpiresAt !== undefined && Date.parse(link.approvalExpiresAt) <= Date.now();
  const statusAt = link.health?.lastStatusAt ? Date.parse(link.health.lastStatusAt) : NaN;
  const livenessUnknown = link.state === "active" && (!Number.isFinite(statusAt) || Date.now() - statusAt > LIVENESS_STALE_MS);
  const sendAction = (a: LinkAction, label: string) => (): Promise<void> => run(label, () => linkAction(apiKey, link.id, a));
  const armed = (a: LinkAction, text: string, done: string): ReactNode => (
    confirm === a
      ? <><button type="button" disabled={busy} onClick={() => void sendAction(a, done)()}>Confirm: {text}</button>{" "}<button type="button" onClick={() => setConfirm(null)}>Cancel</button></>
      : <button type="button" disabled={busy} onClick={() => setConfirm(a)}>{text}</button>
  );

  return (
    <div>
      <div className="page-header"><h1>{link.label} <StateBadge state={link.state} /></h1><p>{link.legacy ? "Legacy link, not yet tied to a person." : isOwner ? "Your WhatsApp link." : `Owner ${link.userId}`}</p></div>
      {error && <p role="alert" className="error-note">{error}</p>}
      {note && <p role="status">{note}</p>}
      <section className="card">
        <h2 className="section-title">Status</h2>
        <div className="row-meta">Requested {when(link.requestedAt)} · notice version {link.noticeVersion ? link.noticeVersion.slice(0, 12) : "unknown"}</div>
        {link.state === "approved" && link.approvalExpiresAt && (expired
          ? <p role="alert" className="error-note">The approval expired on {when(link.approvalExpiresAt)}. Request a new link.</p>
          : <p>Approved. Connect before {when(link.approvalExpiresAt)}; after that the approval lapses.</p>)}
        {link.state === "requested" && <p>Waiting for an administrator to approve this request.</p>}
        {link.state === "suspended" && <p role="status">Suspended by an administrator{link.suspendedReason ? ` (${link.suspendedReason})` : ""}. Nothing is captured until it is resumed.</p>}
        {(link.state === "rejected" || link.state === "revoked" || link.state === "unlinked") && <p role="status">This link is closed ({link.state}). Capture has stopped.</p>}
        {link.state === "active" && (
          <>
            <div>Last archiver status: {link.health?.lastStatus ?? "none yet"}{livenessUnknown ? " (liveness unknown)" : ""}</div>
            <div className="row-meta">Checked {when(link.health?.lastStatusAt)} · last successful sync {when(link.health?.lastSuccessAt)} · last message {when(link.health?.lastMessageAt)}</div>
            {flags.length > 0 && <div className="row-meta">Flags: {flags.join(", ")}</div>}
          </>
        )}
        {needsRelink && (
          <p role="alert" className="error-note">WhatsApp signed this link out (a ban or a removed device are the usual causes). {isOwner ? "Scan the code again to continue capture." : "Only the owner can re-link it."}</p>
        )}
        {isAdmin && link.studentData && <div className="row-meta">Student-data class: {link.studentData}</div>}
      </section>

      {isOwner && (
        <section className="card">
          <h2 className="section-title">Your controls</h2>
          {(link.state === "approved" && !expired || (link.state === "active" && needsRelink)) && <p><Link to={`/whatsapp/links/${encodeURIComponent(link.id)}/connect`}>{needsRelink ? "Re-link WhatsApp" : "Connect WhatsApp"}</Link></p>}
          {link.state === "active" && <p><Link to={`/whatsapp/links/${encodeURIComponent(link.id)}/choose`}>Choose groups and people</Link></p>}
          {live && <p>{armed("unlink", "Unlink WhatsApp", "Unlinked. Capture has stopped.")}</p>}
        </section>
      )}

      {isAdmin && (
        <section className="card">
          <h2 className="section-title">Administrator</h2>
          {link.state === "requested" && (
            <p>
              <label>Student-data class{" "}
                <select value={studentData} onChange={(e) => setStudentData(e.target.value as StudentData)}>
                  <option value="no">no</option><option value="yes">yes</option><option value="unknown">unknown</option>
                </select>
              </label>{" "}
              <button type="button" disabled={busy} onClick={() => void run("Approved. The owner has 14 days to connect.", () => approveLink(apiKey, link.id, studentData))}>Approve</button>{" "}
              <button type="button" disabled={busy} onClick={() => void sendAction("reject", "Rejected.")()}>Reject</button>
            </p>
          )}
          {link.state === "active" && <p><button type="button" disabled={busy} onClick={() => void sendAction("suspend", "Suspended.")()}>Suspend</button>{" "}<Link to={`/whatsapp/links/${encodeURIComponent(link.id)}/choose`}>Marked groups</Link></p>}
          {link.state === "suspended" && <p><button type="button" disabled={busy} onClick={() => void sendAction("resume", "Resumed.")()}>Resume</button></p>}
          {live && <p>{armed("revoke", "Revoke link", "Revoked. Capture has stopped.")}</p>}
          {!live && <p className="empty-note">No administrator action applies to a closed link.</p>}
        </section>
      )}
      <p><Link to="/whatsapp/links">All links</Link></p>
    </div>
  );
}
