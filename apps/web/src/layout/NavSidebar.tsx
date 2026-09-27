import { NavLink } from "react-router-dom";
import {
  DashboardIcon, SessionsIcon, AskIcon, BrainIcon, CalendarIcon, SourcesIcon,
  IngestIcon, MeetingBotIcon, WhatsAppIcon, SettingsIcon, ExternalLinkIcon, DocsIcon, GapIcon,
} from "../components/icons.js";
import { API_BASE_URL } from "../api/client.js";

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
  { to: "/sessions", label: "Sessions", icon: <SessionsIcon /> },
  { to: "/ask", label: "Ask", icon: <AskIcon /> },
  { to: "/brain", label: "Brain", icon: <BrainIcon /> },
  { to: "/calendar", label: "Calendar", icon: <CalendarIcon /> },
  { to: "/watch", label: "Watch", icon: <GapIcon /> },
  { to: "/sources", label: "Sources", icon: <SourcesIcon /> },
  { to: "/ingest", label: "Ingest", icon: <IngestIcon /> },
  { to: "/meeting-bot", label: "Meeting Bot", icon: <MeetingBotIcon /> },
  { to: "/whatsapp", label: "WhatsApp", icon: <WhatsAppIcon /> },
  { to: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

export function NavSidebar(): React.ReactElement {
  return (
    <nav className="nav-sidebar">
      <div className="brand">Vidysea &middot; LKB</div>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
      <div className="nav-divider" />
      <a href={`${API_BASE_URL}/compete`}><ExternalLinkIcon /><span>Compete</span></a>
      <a href={`${API_BASE_URL}/docs-ui`}><DocsIcon /><span>API Docs</span></a>
    </nav>
  );
}
