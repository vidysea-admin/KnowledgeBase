import type { ReactNode } from "react";
import { GlobalSearchBar } from "../components/GlobalSearchBar.js";
import { NavSidebar } from "./NavSidebar.js";

export function AppShell({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <div className="app-shell">
      <NavSidebar />
      <main className="app-main">
        <GlobalSearchBar />
        {children}
      </main>
    </div>
  );
}
