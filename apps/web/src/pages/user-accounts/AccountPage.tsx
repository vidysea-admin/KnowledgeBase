/** apps/web/src/pages/user-accounts/AccountPage.tsx -- unit ua-web, UA-18 / UA-20 / UA-22. Own profile, password change, own sessions, sign out (this device / everywhere). */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { changePassword, describeAuthError, listMySessions, logoutAll, revokeMySession, type MySession } from "../../api/user-accounts.js";

export function AccountPage(): ReactNode {
  const { user, signOut, signOutError, clearApiKey } = useAuth();
  const [sessions, setSessions] = useState<MySession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwNote, setPwNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try { setSessions((await listMySessions()).sessions); setError(null); } catch (err) { setError(describeAuthError(err)); }
  }, []);
  useEffect(() => { if (user) void load(); }, [load, user]);

  if (!user) return <section className="card"><p className="empty-note">Account pages are for signed-in accounts. You are using an API key.</p></section>;

  async function submitPassword(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (next !== confirm) { setPwNote({ ok: false, text: "The two new passwords do not match." }); return; }
    try {
      await changePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      setPwNote({ ok: true, text: "Password changed. Your other devices were signed out." });
      await load();
    } catch (err) { setPwNote({ ok: false, text: describeAuthError(err) }); }
  }

  async function revoke(id: string): Promise<void> {
    try { await revokeMySession(id); await load(); } catch (err) { setError(describeAuthError(err)); }
  }

  async function signOutEverywhere(): Promise<void> {
    try { await logoutAll(); clearApiKey(); } catch (err) { setError(describeAuthError(err)); }
  }

  return (
    <div>
      <div className="page-header"><h1>Your account</h1><p>{user.displayName} · role: {user.role ?? "none"}</p></div>
      <section className="card">
        <h2 className="section-title">Change password</h2>
        <form onSubmit={(e) => void submitPassword(e)}>
          <label>Current password <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>{" "}
          <label>New password <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required /></label>{" "}
          <label>Confirm new password <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>{" "}
          <button type="submit">Change password</button>
        </form>
        {pwNote && <p role={pwNote.ok ? "status" : "alert"} className={pwNote.ok ? undefined : "error-note"}>{pwNote.text}</p>}
      </section>
      <section className="card">
        <h2 className="section-title">Signed-in devices</h2>
        {error && <p role="alert" className="error-note">{error}</p>}
        {sessions === null && !error && <p className="empty-note">Loading…</p>}
        {sessions?.map((s) => (
          <div key={s.id} className="row-card">
            <div className="row-title">{s.userAgentSummary ?? "Unknown device"}{s.current ? " (this device)" : ""}</div>
            <div className="row-meta">Last used {new Date(s.lastUsedAt).toLocaleString()}{s.ipPrefix ? ` · ${s.ipPrefix}` : ""}</div>
            {!s.current && <button type="button" onClick={() => void revoke(s.id)}>Sign out this device</button>}
          </div>
        ))}
        <p>
          <button type="button" onClick={() => void signOut()}>Sign out</button>{" "}
          <button type="button" onClick={() => void signOutEverywhere()}>Sign out everywhere</button>
        </p>
        {signOutError && <p role="alert" className="error-note">{signOutError}</p>}
      </section>
    </div>
  );
}
