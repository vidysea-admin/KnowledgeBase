/** apps/web/src/pages/user-accounts/PendingPage.tsx -- unit ua-web, UA-5 / UA-12. A pending account holds a zero-scope session: it can only wait, re-check, or sign out. */
import { useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { describeAuthError, fetchSession } from "../../api/user-accounts.js";
import { AuthCard } from "./LoginPage.js";

export function PendingPage(): ReactNode {
  const { apiKey, accountState, user, restoring, adoptSession, signOut } = useAuth();
  const [note, setNote] = useState<string | null>(null);
  if (restoring) return <AuthCard title="Living Knowledge Base"><p role="status">Checking your session…</p></AuthCard>;
  if (!apiKey) return <Navigate to="/login" replace />;
  if (accountState !== "pending") return <Navigate to="/" replace />;

  async function recheck(): Promise<void> {
    setNote(null);
    try {
      const s = await fetchSession();
      if (s?.state === "active") adoptSession(s); else setNote("Still waiting for approval.");
    } catch (err) { setNote(describeAuthError(err)); }
  }

  return (
    <AuthCard title="Waiting for approval" intro={user ? `Signed in as ${user.displayName}.` : undefined}>
      <p>An admin has to approve your account and choose your role before you can use the knowledge base.</p>
      {note && <p role="status">{note}</p>}
      <button type="button" onClick={() => void recheck()}>Check again</button>
      <p className="auth-links"><button type="button" className="link-button" onClick={() => void signOut()}>Sign out</button></p>
    </AuthCard>
  );
}
