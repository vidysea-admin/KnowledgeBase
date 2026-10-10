/**
 * apps/web/src/auth/AuthContext.tsx — React-ified version of the fast pages' own mechanism
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
import { AUTH_INVALIDATED_EVENT, AUTH_KEY_STORAGE_KEY, type AuthInvalidationEventDetail } from "../api/client.js";

export interface AuthContextValue {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
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

  // This tab's CURRENT key, updated synchronously with every state change (never in an effect),
  // so the 401 handler never compares against a stale render closure.
  const keyRef = useRef<string | null>(apiKey);

  const setApiKey = useCallback((key: string) => {
    try {
      window.localStorage.setItem(AUTH_KEY_STORAGE_KEY, key);
    } catch {
      // non-fatal: the key still works for this tab's session from memory
    }
    keyRef.current = key;
    setApiKeyState(key);
  }, []);

  // Explicit sign-out: the user chose to clear, so storage is cleared unconditionally.
  const clearApiKey = useCallback(() => {
    removeStoredKey();
    keyRef.current = null;
    setApiKeyState(null);
  }, []);

  // Two independent decisions, both keyed on the key the failed request was SENT with
  // (detail.apiKey, captured at send time), never on a value re-read later:
  //  1. drop this tab's in-memory key only if it equals the failed key (storage plays no part);
  //  2. remove the stored key only if it equals the failed key (compare-and-clear).
  // A tab never adopts a stored key it did not itself receive from the user.
  const handleAuthInvalidated = useCallback((event: Event) => {
    const failed = (event as CustomEvent<AuthInvalidationEventDetail | null>).detail?.apiKey;
    // No usable key on the event: relevance cannot be established, so ignore it.
    if (typeof failed !== "string" || failed === "") return;
    if (readStoredKey() === failed) removeStoredKey();
    if (keyRef.current === failed) {
      keyRef.current = null;
      setApiKeyState(null);
    }
  }, []);

  useEffect(() => {
    window.addEventListener(AUTH_INVALIDATED_EVENT, handleAuthInvalidated);
    return () => {
      window.removeEventListener(AUTH_INVALIDATED_EVENT, handleAuthInvalidated);
    };
  }, [handleAuthInvalidated]);

  const value = useMemo(() => ({ apiKey, setApiKey, clearApiKey }), [apiKey, setApiKey, clearApiKey]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
