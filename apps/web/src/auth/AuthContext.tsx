/**
 * apps/web/src/auth/AuthContext.tsx — (unit ua-web adds the account session beside the key: while a person is signed in with an
 * account, `apiKey` holds the non-secret SESSION_CREDENTIAL marker so every existing `apiFetch(path, apiKey)` caller authenticates
 * with the httpOnly cookie; the CSRF proof is kept in client.ts memory only and nothing session-related touches storage.)
 * React-ified version of the fast pages' own mechanism
 * (paste an API key once, store in localStorage, attach as `Authorization: Bearer <key>` on
 * every fetch). Not a new auth model, a new UI for the same real one apps/api already enforces.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { advanceAuthSession, AUTH_INVALIDATED_EVENT, AUTH_KEY_STORAGE_KEY, SESSION_CREDENTIAL, setCsrfToken, type AuthInvalidationEventDetail } from "../api/client.js";
import { accountsEnabled, fetchSession, logout as logoutRequest, type SessionInfo, type SessionUser } from "../api/user-accounts.js";

export interface AuthContextValue {
  apiKey: string | null;
  /** Changes on explicit login/logout, including when the credential string is reused. */
  sessionVersion: number;
  /** Why the last key was rejected (the server's 401 message), shown on the login form; null otherwise. */
  authError: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  /** The signed-in account (null for an API-key operator or signed out). */
  user: SessionUser | null;
  /** "active" | "pending" for an account session, null otherwise. */
  accountState: SessionInfo["state"] | null;
  /** True while the first `GET /auth/session` of a page load is in flight. */
  restoring: boolean;
  /** A viewer account: the UI shows a read-only banner (the server enforces it with 403 read_only_role). */
  readOnly: boolean;
  /** Called once by the gate on mount: re-establishes the account session from the cookie (no-op with a stored key or accounts off). */
  restoreSession: () => Promise<void>;
  /** After a successful login response. */
  adoptSession: (session: SessionInfo) => void;
  /** POST /auth/logout, then forget the session locally whatever the server said. Resolves true when the server confirmed. */
  signOut: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Storage can throw (private mode, blocked site data): a provider must never crash on it.
function readStoredKey(): string | null {
  try {
    return window.localStorage.getItem(AUTH_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function removeStoredKey(): void {
  try {
    window.localStorage.removeItem(AUTH_KEY_STORAGE_KEY);
  } catch {
    // non-fatal: in-memory state still resets
  }
}

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [apiKey, setApiKeyState] = useState<string | null>(readStoredKey);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [restoring, setRestoring] = useState<boolean>(() => accountsEnabled() && readStoredKey() === null);
  const versionRef = useRef(0);

  // This tab's CURRENT key, updated synchronously with every state change (never in an effect),
  // so the 401 handler never compares against a stale render closure.
  const keyRef = useRef<string | null>(apiKey);

  const setApiKey = useCallback((key: string) => {
    advanceAuthSession();
    versionRef.current += 1;
    setCsrfToken(null);
    setSession(null);
    setRestoring(false);
    setSessionVersion((version) => version + 1);
    try {
      window.localStorage.setItem(AUTH_KEY_STORAGE_KEY, key);
    } catch {
      // non-fatal: the key still works for this tab's session from memory
    }
    keyRef.current = key;
    setAuthError(null);
    setApiKeyState(key);
  }, []);

  // Explicit sign-out: the user chose to clear, so storage is cleared unconditionally.
  const clearApiKey = useCallback(() => {
    advanceAuthSession();
    versionRef.current += 1;
    setCsrfToken(null);
    setSession(null);
    setRestoring(false);
    setSessionVersion((version) => version + 1);
    removeStoredKey();
    keyRef.current = null;
    setAuthError(null);
    setApiKeyState(null);
  }, []);

  // Two independent decisions, both keyed on the key the failed request was SENT with
  // (detail.apiKey, captured at send time), never on a value re-read later:
  //  1. drop this tab's in-memory key only if it equals the failed key (storage plays no part);
  //  2. remove the stored key only if it equals the failed key (compare-and-clear).
  // A tab never adopts a stored key it did not itself receive from the user.
  const handleAuthInvalidated = useCallback((event: Event) => {
    const detail = (event as CustomEvent<AuthInvalidationEventDetail | null>).detail;
    const failed = detail?.apiKey;
    // No usable key on the event: relevance cannot be established, so ignore it.
    if (typeof failed !== "string" || failed === "") return;
    if (readStoredKey() === failed) removeStoredKey();
    if (keyRef.current === failed) {
      keyRef.current = null;
      const fallback = failed === SESSION_CREDENTIAL ? "You were signed out. Sign in again." : "That API key was not accepted.";
      setAuthError(typeof detail?.message === "string" && detail.message !== "" ? detail.message : fallback);
      if (failed === SESSION_CREDENTIAL) { setCsrfToken(null); setSession(null); }
      setApiKeyState(null);
    }
  }, []);

  // The cookie session (UA-30). Results apply only if no explicit login/logout happened meanwhile (versionRef), so a slow
  // restore probe can never overwrite a newer sign-in or resurrect a signed-out session.
  const adoptSession = useCallback((next: SessionInfo) => {
    advanceAuthSession();
    versionRef.current += 1;
    removeStoredKey();
    setCsrfToken(next.csrfToken);
    keyRef.current = SESSION_CREDENTIAL;
    setSession(next);
    setRestoring(false);
    setAuthError(null);
    setSessionVersion((version) => version + 1);
    setApiKeyState(SESSION_CREDENTIAL);
  }, []);

  const restoreSession = useCallback(async () => {
    if (!accountsEnabled() || keyRef.current !== null) { setRestoring(false); return; }
    const started = versionRef.current;
    let restored: SessionInfo | null = null;
    try { restored = await fetchSession(); } catch { restored = null; } // 401 = signed out; an unreachable API shows the login page, whose submit reports it
    if (versionRef.current !== started) return;
    if (restored) adoptSession(restored); else setRestoring(false);
  }, [adoptSession]);

  const signOut = useCallback(async (): Promise<boolean> => {
    const wasSession = keyRef.current === SESSION_CREDENTIAL;
    let confirmed = false;
    if (wasSession) {
      try { await logoutRequest(); confirmed = true; } catch { confirmed = false; }
    }
    // Local state resets either way: the person asked to leave. (A failed call leaves the cookie; the next page load would restore it.)
    advanceAuthSession();
    versionRef.current += 1;
    setCsrfToken(null);
    keyRef.current = null;
    setSession(null);
    setRestoring(false);
    setAuthError(null);
    setSessionVersion((version) => version + 1);
    setApiKeyState(null);
    return confirmed;
  }, []);

  useEffect(() => {
    window.addEventListener(AUTH_INVALIDATED_EVENT, handleAuthInvalidated);
    return () => {
      window.removeEventListener(AUTH_INVALIDATED_EVENT, handleAuthInvalidated);
    };
  }, [handleAuthInvalidated]);

  const user = session?.user ?? null;
  const accountState = session?.state ?? null;
  const readOnly = user?.role === "viewer";
  const value = useMemo(
    () => ({ apiKey, sessionVersion, authError, setApiKey, clearApiKey, user, accountState, restoring, readOnly, restoreSession, adoptSession, signOut }),
    [apiKey, sessionVersion, authError, setApiKey, clearApiKey, user, accountState, restoring, readOnly, restoreSession, adoptSession, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}

/** For shell pieces that also render in isolation (no provider): null instead of throwing. */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
