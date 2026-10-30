import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  DashboardIcon, SessionsIcon, AskIcon, BrainIcon, CalendarIcon, SourcesIcon,
  IngestIcon, MeetingBotIcon, WhatsAppIcon, SettingsIcon, ExternalLinkIcon, DocsIcon, GapIcon,
} from "../components/icons.js";
import { API_BASE_URL } from "../api/client.js";
import { useOptionalAuth } from "../auth/AuthContext.js";

// apps/api serves /compete and /docs-ui itself, not apps/web -- in dev these run on different
// ports, so links need to target the API origin.

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

// Only pages that exist today link internally; Compete stays a link-out to the already-working,
// checker-PASSed server-rendered page rather than being reimplemented here (plan §8b non-goals).
const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <DashboardIcon /> },
  { to: "/operations", label: "Operations workspace", icon: <DashboardIcon /> },
  { to: "/counsellor", label: "AI counsellor", icon: <AskIcon /> },
  { to: "/calibration-review", label: "Calibration review", icon: <DocsIcon /> },
  { to: "/extraction-review", label: "Extraction review", icon: <DocsIcon /> },
  { to: "/label-review", label: "Label review", icon: <DocsIcon /> },
  { to: "/championship", label: "Championship", icon: <AskIcon /> },
  { to: "/sessions", label: "Sessions", icon: <SessionsIcon /> },
  { to: "/ask", label: "Ask", icon: <AskIcon /> },
  { to: "/answer-policy", label: "Answer policy", icon: <AskIcon /> },
  { to: "/answer-review", label: "Answer review", icon: <AskIcon /> },
  { to: "/knowledge/documents", label: "Documents", icon: <DocsIcon /> },
  { to: "/knowledge/collections", label: "Saved collections", icon: <DocsIcon /> },
  { to: "/knowledge/topics", label: "Topics", icon: <DocsIcon /> },
  { to: "/knowledge/resources", label: "Resources", icon: <SourcesIcon /> },
  { to: "/knowledge/speakers", label: "Speaker profiles", icon: <SessionsIcon /> },
  { to: "/knowledge-outputs", label: "Knowledge outputs", icon: <DocsIcon /> },
  { to: "/transcript-review", label: "Transcript review", icon: <SessionsIcon /> },
  { to: "/accounts", label: "Counsellor accounts", icon: <SettingsIcon /> },
  { to: "/automation", label: "Application automation", icon: <SettingsIcon /> },
  { to: "/connectors", label: "Connectors", icon: <SourcesIcon /> },
  { to: "/search", label: "Search", icon: <DocsIcon /> },
  { to: "/knowledge", label: "Knowledge directory", icon: <DocsIcon /> },
  { to: "/brain", label: "Brain", icon: <BrainIcon /> },
  { to: "/explorer", label: "Knowledge explorer", icon: <SessionsIcon /> },
  { to: "/graph-confidence", label: "Confidence graph", icon: <BrainIcon /> },
  { to: "/gaps", label: "Knowledge gaps", icon: <GapIcon /> },
  { to: "/activity-health", label: "Activity & Health", icon: <DocsIcon /> },
  { to: "/analytics", label: "Analytics", icon: <DashboardIcon /> },
  { to: "/calendar", label: "Calendar", icon: <CalendarIcon /> },
  { to: "/join-rules", label: "Join rules", icon: <MeetingBotIcon /> },
  { to: "/watch", label: "Watch", icon: <GapIcon /> },
  { to: "/sources", label: "Sources", icon: <SourcesIcon /> },
  { to: "/ingest", label: "Ingest", icon: <IngestIcon /> },
  { to: "/meeting-bot", label: "Meeting Bot", icon: <MeetingBotIcon /> },
  { to: "/whatsapp", label: "WhatsApp", icon: <WhatsAppIcon /> },
  { to: "/settings", label: "Settings", icon: <SettingsIcon /> },
  { to: "/jobs", label: "Provider jobs", icon: <DocsIcon /> },
  { to: "/claims", label: "Claims", icon: <DocsIcon /> },
  { to: "/status", label: "System status", icon: <SettingsIcon /> },
  { to: "/setup", label: "Setup wizard", icon: <SettingsIcon /> },
  { to: "/ops-health", label: "Operations health", icon: <SettingsIcon /> },
  { to: "/notifications", label: "Notifications", icon: <SettingsIcon /> },
];

// Shown only to an account session (an API-key operator has no account); the admin pair only to role admin. The server enforces both.
const ACCOUNT_ITEMS: NavItem[] = [{ to: "/account", label: "Your account", icon: <SettingsIcon /> }];
const ADMIN_ITEMS: NavItem[] = [
  { to: "/admin/users", label: "Users", icon: <SettingsIcon /> },
  { to: "/admin/audit", label: "Account audit", icon: <DocsIcon /> },
];

export function NavSidebar(): React.ReactElement {
  const auth = useOptionalAuth();
  const items = [...NAV_ITEMS, ...(auth?.user ? ACCOUNT_ITEMS : []), ...(auth?.user?.role === "admin" ? ADMIN_ITEMS : [])];
  // Below 640px the sidebar becomes a top bar; the links sit behind this menu button.
  // On desktop the button is display:none and the link list is always shown (see styles.css).
  const [open, setOpen] = useState(false);
  return (
    <nav className="nav-sidebar" data-open={open ? "true" : "false"} aria-label="Main">
      <div className="nav-topbar">
        <div className="brand">Vidysea &middot; LKB</div>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="nav-links"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close menu" : "Menu"}
        </button>
      </div>
      <div id="nav-links" className="nav-links" onClick={() => setOpen(false)}>
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
        <div className="nav-divider" />
        {auth?.user && (
          <div className="nav-account">
            <span>{auth.user.displayName} ({auth.user.role ?? "pending"})</span>
            <button type="button" onClick={() => void auth.signOut()}>Sign out</button>
          </div>
        )}
        <a href={`${API_BASE_URL}/compete`}><ExternalLinkIcon /><span>Compete</span></a>
        <a href={`${API_BASE_URL}/docs-ui`}><DocsIcon /><span>API Docs</span></a>
      </div>
    </nav>
  );
}
