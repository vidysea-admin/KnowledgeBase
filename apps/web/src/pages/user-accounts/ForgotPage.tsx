/** apps/web/src/pages/user-accounts/ForgotPage.tsx -- unit ua-web, UA-21. Always the same answer; v1 sends no mail, an admin issues the reset link. */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { describeAuthError, forgotPassword } from "../../api/user-accounts.js";
import { AuthCard, Field } from "./LoginPage.js";

export function ForgotPage(): ReactNode {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try { await forgotPassword(email.trim()); setSent(true); } catch (err) { setError(describeAuthError(err)); } finally { setBusy(false); }
  }

  return (
    <AuthCard title="Forgot password" intro="This server does not send email yet.">
      {sent ? (
        <p role="status">Request noted. Ask an admin for a password reset link; it works once and expires.</p>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          {error && <p role="alert" className="error-note">{error}</p>}
          <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button type="submit" disabled={busy}>{busy ? "Sending…" : "Request a reset"}</button>
        </form>
      )}
      <p className="auth-links"><Link to="/login">Back to sign in</Link></p>
    </AuthCard>
  );
}
