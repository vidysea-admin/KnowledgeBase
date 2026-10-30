/** apps/web/src/pages/user-accounts/ResetPage.tsx -- unit ua-web, UA-21. Token from the URL fragment; a successful reset ends every session of the account, so the person signs in again. */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { describeAuthError, resetPassword } from "../../api/user-accounts.js";
import { AuthCard, Field } from "./LoginPage.js";
import { useFragmentToken } from "./VerifyPage.js";

export function ResetPage(): ReactNode {
  const token = useFragmentToken();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setBusy(true); setError(null);
    try { await resetPassword(token, password); setPassword(""); setConfirm(""); setDone(true); } catch (err) { setError(describeAuthError(err)); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <AuthCard title="Password changed" intro="You were signed out everywhere.">
        <p className="auth-links"><Link to="/login">Go to sign in</Link></p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" intro="At least 12 characters.">
      {token === "" && <p role="alert" className="error-note">This link is missing its code. Ask an admin for a new one.</p>}
      {error && <p role="alert" className="error-note">{error}</p>}
      <form onSubmit={(e) => void submit(e)}>
        <Field label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Field label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <button type="submit" disabled={busy || token === ""}>{busy ? "Saving…" : "Set password"}</button>
      </form>
    </AuthCard>
  );
}
