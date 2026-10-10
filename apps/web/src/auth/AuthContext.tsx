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

  const setApiKey = useCallback((key: string) => {
    try {
      window.localStorage.setItem(AUTH_KEY_STORAGE_KEY, key);
    } catch {
      // non-fatal: the key still works for this tab's session from memory
    }
    setApiKeyState(key);
  }, []);

  // Explicit sign-out: the user chose to clear, so storage is cleared unconditionally.
  const clearApiKey = useCallback(() => {
    removeStoredKey();
    setApiKeyState(null);
  }, []);

  const handleAuthInvalidated = useCallback((event: Event) => {
    const detail = (event as CustomEvent<AuthInvalidationEventDetail>).detail;
    if (!detail) return;
    const storageKey = readStoredKey();
    if (detail.apiKey !== apiKey && detail.apiKey !== storageKey && storageKey !== null) return;
    // Compare-and-clear (same guard as client.ts): a late 401 for an old key must not delete a
    // newer key another tab stored. This tab always drops its in-memory key and shows the prompt;
    // it never adopts a stored key it did not itself receive from the user.
    if (storageKey === null || storageKey === detail.apiKey) removeStoredKey();
    setApiKeyState(null);
  }, [apiKey]);

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
