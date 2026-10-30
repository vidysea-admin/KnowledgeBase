/** apps/web/src/pages/user-accounts/LoginPage.tsx -- unit ua-web, UA-12 / UA-30. Email + password sign-in; the cookie arrives as Set-Cookie and is never readable here. */
import { useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { describeAuthError, fetchSession, login, type SessionInfo } from "../../api/user-accounts.js";

/** The centred card every signed-out account page shares (reuses the existing login-gate styling). */
export function AuthCard({ title, intro, children }: { title: string; intro?: string | undefined; children: ReactNode }): ReactNode {
  return (
    <div className="login-gate">
      <div className="login-card">
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
        {children}
      </div>
    </div>
  );
}

export function Field({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>): ReactNode {
  const id = useId();
  return (<><label htmlFor={id}>{label}</label><input id={id} {...input} /></>);
}

/** A router-state `from` is honoured only when it is an in-app absolute path (never a scheme or protocol-relative URL). */
export function safeFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && /^\/(?![/\\])/.test(from) ? from : "/";
}

export function LoginPage(): ReactNode {
  const { apiKey, accountState, authError, restoring, adoptSession } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<"rejected" | "disabled" | null>(null);

  if (restoring) return <AuthCard title="Living Knowledge Base"><p role="status">Checking your session…</p></AuthCard>;
  if (apiKey) return <Navigate to={accountState === "pending" ? "/pending" : safeFrom(location.state)} replace />;

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setBlocked(null);
    try {
      const out = await login(email.trim(), password);
      if (out.kind === "blocked") { setBlocked(out.state); return; }
      // Cookies blocked? The login set one; if the very next request does not carry it there is no fallback (no token in JS).
      let confirmed: SessionInfo | null;
      try { confirmed = await fetchSession(); } catch { confirmed = null; }
      if (!confirmed) { setError("Your browser did not keep the sign-in cookie. Allow cookies for this site and try again."); return; }
      setPassword("");
      adoptSession(confirmed);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Living Knowledge Base" intro="Sign in with your account.">
      {authError && <p role="alert" className="error-note">{authError}</p>}
      {error && <p role="alert" className="error-note">{error}</p>}
      {blocked && <p role="alert" className="error-note">{blocked === "rejected" ? "This account was not approved. Contact an admin." : "This account is disabled. Contact an admin."}</p>}
      <form onSubmit={(e) => void submit(e)}>
        <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="auth-links"><Link to="/signup">Create an account</Link> · <Link to="/forgot">Forgot password</Link></p>
      <p className="auth-links"><Link to="/login/key">Use an API key (advanced)</Link></p>
    </AuthCard>
  );
}
