/** apps/web/src/pages/user-accounts/SignupPage.tsx -- unit ua-web, UA-1. Open signup; an admin approves afterwards. The response is the same for new and existing emails. */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { describeAuthError, signup } from "../../api/user-accounts.js";
import { AuthCard, Field } from "./LoginPage.js";

export function SignupPage(): ReactNode {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setBusy(true); setError(null);
    try {
      await signup({ email: email.trim(), password, displayName: displayName.trim() });
      navigate("/signup/check-email", { replace: true });
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Create an account" intro="Use at least 12 characters; a phrase with spaces is fine. An admin approves new accounts.">
      {error && <p role="alert" className="error-note">{error}</p>}
      <form onSubmit={(e) => void submit(e)}>
        <Field label="Your name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={200} required />
        <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
        <Field label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Field label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
      <p className="auth-links"><Link to="/login">Back to sign in</Link></p>
    </AuthCard>
  );
}
