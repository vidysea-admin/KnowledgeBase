import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "./AuthContext.js";

/** Blocks rendering `children` until a key is set. Real auth still happens server-side on every
 * request (a wrong key still 401s from apps/api) -- this just avoids showing empty-shell pages
 * before the user has pasted a key at all. */
export function LoginGate({ children }: { children: ReactNode }): ReactNode {
  const { apiKey, authError, setApiKey } = useAuth();
  const [draft, setDraft] = useState("");

  if (apiKey) return children;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft.trim()) setApiKey(draft.trim());
  }

  return (
    <div className="login-gate">
      <div className="login-card">
        <h1>Living Knowledge Base</h1>
        <p>Paste your API key to continue.</p>
        {authError && <p role="alert" className="error-note">{authError}</p>}
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="paste your API key"
            aria-label="API key"
          />
          <button type="submit">Continue</button>
        </form>
      </div>
    </div>
  );
}
