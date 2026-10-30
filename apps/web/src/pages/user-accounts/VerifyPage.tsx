/** apps/web/src/pages/user-accounts/VerifyPage.tsx -- unit ua-web, UA-4. The admin-issued link carries the token in the URL FRAGMENT (`#token=...`), so it never reaches a server log or Referer. */
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { describeAuthError, verifyEmail } from "../../api/user-accounts.js";
import { AuthCard } from "./LoginPage.js";

/** Reads `#token=<value>` and removes the fragment from the address bar so the token is not left in history / shared screenshots. */
export function takeFragmentToken(): string {
  const raw = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ?? "";
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return raw;
}

export function VerifyPage(): ReactNode {
  const [token] = useState(takeFragmentToken);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // An explicit click, not a call on load: the token is single-use and a link previewer or a StrictMode remount must not burn it.
  async function confirm(): Promise<void> {
    setState("busy"); setError(null);
    try { await verifyEmail(token); setState("done"); } catch (err) { setError(describeAuthError(err)); setState("idle"); }
  }

  if (state === "done") {
    return (
      <AuthCard title="Email confirmed" intro="Your account now waits for an admin to approve it.">
        <p className="auth-links"><Link to="/login">Go to sign in</Link></p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Confirm your email">
      {token === "" ? <p role="alert" className="error-note">This link is missing its code. Ask an admin for a new one.</p> : <button type="button" disabled={state === "busy"} onClick={() => void confirm()}>Confirm my email</button>}
      {error && <p role="alert" className="error-note">{error}</p>}
    </AuthCard>
  );
}
