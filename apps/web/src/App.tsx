import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.js";
import { LoginGate } from "./auth/LoginGate.js";
import { AppShell } from "./layout/AppShell.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SourcesPage } from "./pages/SourcesPage.js";
import { SessionsListPage } from "./pages/sessions/SessionsListPage.js";
import { SessionDetailPage } from "./pages/sessions/SessionDetailPage.js";
import { AskPage } from "./pages/AskPage.js";
import { SearchPage } from "./pages/search/SearchPage.js";
import { BrainPage } from "./pages/BrainPage.js";
import { CalendarPage } from "./pages/CalendarPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { IngestPage } from "./pages/IngestPage.js";
import { MeetingBotPage } from "./pages/MeetingBotPage.js";
import { WhatsAppPage } from "./pages/WhatsAppPage.js";
import { WatchPage } from "./pages/WatchPage.js";
import { JobsPage } from "./pages/jobs/JobsPage.js";
import { KnowledgeExplorerPage } from "./pages/explorer/KnowledgeExplorerPage.js";
import { ConfidenceGraphPage } from "./pages/graph-confidence/ConfidenceGraphPage.js";
import { KnowledgeGapsPage } from "./pages/gaps/KnowledgeGapsPage.js";
import { ActivityHealthPage } from "./pages/activity-health/ActivityHealthPage.js";
import { AnalyticsPage } from "./pages/analytics/AnalyticsPage.js";

export function App(): React.ReactElement {
  return (
    <AuthProvider>
      <LoginGate>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/sessions" element={<SessionsListPage />} />
              <Route path="/sessions/:id" element={<SessionDetailPage />} />
              <Route path="/ask" element={<AskPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/brain" element={<BrainPage />} />
              <Route path="/explorer" element={<KnowledgeExplorerPage />} />
              <Route path="/graph-confidence" element={<ConfidenceGraphPage />} />
              <Route path="/gaps" element={<KnowledgeGapsPage />} />
              <Route path="/activity-health" element={<ActivityHealthPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/watch" element={<WatchPage />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/ingest" element={<IngestPage />} />
              <Route path="/meeting-bot" element={<MeetingBotPage />} />
              <Route path="/whatsapp" element={<WhatsAppPage />} />
              <Route path="/ask" element={<DashboardPage />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </LoginGate>
    </AuthProvider>
  );
}
