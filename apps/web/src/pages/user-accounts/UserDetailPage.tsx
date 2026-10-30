/** apps/web/src/pages/user-accounts/UserDetailPage.tsx -- unit ua-web, UA-5..UA-8 / UA-19 / UA-24. One user: state-dependent actions, and the one-time issue-link (no mail in v1). */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { describeAuthError, getUser, ROLES, userAction, type AdminUser, type IssuedLink, type Role, type UserAction } from "../../api/user-accounts.js";

const DESTRUCTIVE = new Set(["reject", "disable", "revoke-sessions"]);

export function UserDetailPage(): ReactNode {
  const { id = "" } = useParams();
  const { user: me } = useAuth();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [sessions, setSessions] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("member");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [link, setLink] = useState<IssuedLink | null>(null);

  const load = useCallback(async () => {
    try { const r = await getUser(id); setUser(r.user); setSessions(r.activeSessionCount); if (r.user.role) setRole(r.user.role); setError(null); } catch (err) { setError(describeAuthError(err)); }
  }, [id]);
  useEffect(() => { setLink(null); void load(); }, [load]);

  async function run(a: UserAction): Promise<void> {
    if (DESTRUCTIVE.has(a.action) && confirming !== a.action) { setConfirming(a.action); return; }
    setConfirming(null); setNote(null); setError(null);
    try {
      const out = await userAction(id, a);
      if (a.action === "issue-link") setLink(out as unknown as IssuedLink); // shown once, kept only in memory
      else setNote(`Done: ${a.action}.`);
      await load();
    } catch (err) { setError(describeAuthError(err)); }
  }

  if (!user) return <section className="card">{error ? <p role="alert" className="error-note">{error}</p> : <p className="empty-note">Loading…</p>}</section>;
  const self = me?.id === user.id;
  const s = user.status;

  return (
    <div>
      <div className="page-header"><h1>{user.displayName}</h1><p>{user.email} · {s}{user.role ? ` · ${user.role}` : ""} · {sessions} active session(s)</p></div>
      <section className="card">
        {error && <p role="alert" className="error-note">{error}</p>}
        {note && <p role="status">{note}</p>}
        {(s === "pending" || s === "rejected" || (s === "active" && !self)) && (
          <p>
            <label>Role <select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>{" "}
            {s !== "active" ? <button type="button" onClick={() => void run({ action: "approve", role })}>Approve</button> : <button type="button" onClick={() => void run({ action: "role", role })}>Set role</button>}
          </p>
        )}
        <p>
          {s === "pending" && <button type="button" onClick={() => void run({ action: "reject" })}>{confirming === "reject" ? "Confirm reject" : "Reject"}</button>}{" "}
          {s === "active" && !self && <button type="button" onClick={() => void run({ action: "disable" })}>{confirming === "disable" ? "Confirm disable" : "Disable"}</button>}{" "}
          {s === "disabled" && <button type="button" onClick={() => void run({ action: "enable" })}>Enable</button>}{" "}
          {(s === "active" || s === "pending" || s === "disabled") && <button type="button" onClick={() => void run({ action: "revoke-sessions" })}>{confirming === "revoke-sessions" ? "Confirm sign-out of all sessions" : "Sign out all sessions"}</button>}{" "}
          <button type="button" onClick={() => void run({ action: "unlock" })}>Clear sign-in lock</button>
        </p>
        <p>
          {s === "unverified" && <button type="button" onClick={() => void run({ action: "issue-link", purpose: "verify_email" })}>Issue verification link</button>}{" "}
          {(s === "pending" || s === "active") && <button type="button" onClick={() => void run({ action: "issue-link", purpose: "password_reset" })}>Issue password reset link</button>}
        </p>
        {link && (
          <div className="link-once" role="status">
            <p>Give this link to {user.displayName} now. It is shown once and works once (expires {new Date(link.expiresAt).toLocaleString()}).</p>
            <input readOnly aria-label="One-time link" value={link.link} onFocus={(e) => e.currentTarget.select()} />{" "}
            <button type="button" onClick={() => setLink(null)}>Done, hide it</button>
          </div>
        )}
        <p><Link to={`/admin/audit?user=${encodeURIComponent(user.id)}`}>History for this user</Link> · <Link to="/admin/users">Back to users</Link></p>
      </section>
    </div>
  );
}
