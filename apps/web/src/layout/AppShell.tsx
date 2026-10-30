import type { ReactNode } from "react";
import { GlobalSearchBar } from "../components/GlobalSearchBar.js";
import { NavSidebar } from "./NavSidebar.js";
import { useOptionalAuth } from "../auth/AuthContext.js";

export function AppShell({ children }: { children: ReactNode }): React.ReactElement {
  const readOnly = useOptionalAuth()?.readOnly === true;
  return (
    <div className="app-shell">
      <NavSidebar />
      <main className="app-main">
        {readOnly && <div className="readonly-banner" role="status">Read-only account: you can look things up and ask questions, but not change anything.</div>}
        <GlobalSearchBar />
        {children}
      </main>
    </div>
  );
}
