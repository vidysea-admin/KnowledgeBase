/**
 * apps/web/src/auth/WriteScope.tsx -- unit ua-web fix cycle 1 (A7 acceptance 2: "write controls absent" for a viewer).
 * The one shared read-only guard. AuthProvider publishes `readOnly` (role viewer) through this module's own context, so a page that issues
 * POST/PUT/PATCH/DELETE needs nothing from AuthContext itself and renders unchanged (writable) when no provider is present (API-key
 * operators, isolated page tests). The server stays the authority: it refuses a viewer's write with 403 `read_only_role`.
 */
import { createContext, useContext, type ReactNode } from "react";

export const ReadOnlyContext = createContext(false);

/** False for a viewer account; true for members, admins and API-key principals. */
export function useCanWrite(): boolean {
  return !useContext(ReadOnlyContext);
}

/** Wraps write controls: for a viewer the block is a disabled fieldset (no enabled button, input or select inside), otherwise a pass-through. */
export function WriteScope({ children }: { children: ReactNode }): ReactNode {
  if (useCanWrite()) return <>{children}</>;
  return <fieldset className="write-scope" disabled data-read-only="true">{children}</fieldset>;
}
