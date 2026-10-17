import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.js";
import { LoginGate } from "./auth/LoginGate.js";
import { AppShell } from "./layout/AppShell.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SourcesPage } from "./pages/SourcesPage.js";
import { SessionsListPage } from "./pages/sessions/SessionsListPage.js";
import { SessionDetailPage } from "./pages/sessions/SessionDetailPage.js";
import { PolicyAskPage } from "./pages/answer-policy/PolicyAskPage.js";
import { PolicyManager } from "./pages/answer-policy/PolicyManager.js";
import { AnswerReviewPage } from "./pages/answer-policy/AnswerReviewPage.js";
import { KnowledgeDocumentsPage } from "./pages/knowledge/KnowledgeDocumentsPage.js";
import { CuratedCollections } from "./pages/knowledge/CuratedCollections.js";
import { KnowledgeTopicsPage } from "./pages/knowledge/catalog/KnowledgeTopicsPage.js";
import { KnowledgeResourcesPage } from "./pages/knowledge/catalog/KnowledgeResourcesPage.js";
import { KnowledgeSpeakerProfilePage } from "./pages/knowledge/speakers/KnowledgeSpeakerProfilePage.js";
import { KnowledgeOutputsPage } from "./pages/knowledge-outputs/KnowledgeOutputsPage.js";
import { CounsellorAccountsPage } from "./pages/accounts/CounsellorAccountsPage.js";
import { AutomationPage } from "./pages/automation/AutomationPage.js";
import { ApplicationFormsPage } from './pages/automation/ApplicationFormsPage.js';
import { TranscriptReviewPage } from "./pages/transcript-review/TranscriptReviewPage.js";
import { SearchPage } from "./pages/search/SearchPage.js";
import { KnowledgeDirectoryPage } from "./pages/knowledge/KnowledgeDirectoryPage.js";
import { BrainPage } from "./pages/BrainPage.js";
import { CalendarPage } from "./pages/CalendarPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { IngestPage } from "./pages/IngestPage.js";
import { MeetingBotPage } from "./pages/MeetingBotPage.js";
import { WhatsAppPage } from "./pages/WhatsAppPage.js";
import ReviewSourcePage from './pages/whatsapp-review/ReviewSourcePage.js';
import { WatchPage } from "./pages/WatchPage.js";
import { JobsPage } from "./pages/jobs/JobsPage.js";
import { ClaimsPage } from "./pages/claims/ClaimsPage.js";
import { KnowledgeExplorerPage } from "./pages/explorer/KnowledgeExplorerPage.js";
import { ConfidenceGraphPage } from "./pages/graph-confidence/ConfidenceGraphPage.js";
import { KnowledgeGapsPage } from "./pages/gaps/KnowledgeGapsPage.js";
import { ActivityHealthPage } from "./pages/activity-health/ActivityHealthPage.js";
import { AnalyticsPage } from "./pages/analytics/AnalyticsPage.js";
import { JoinRulesPage } from "./pages/join-rules/JoinRulesPage.js";
import { SetupWizardPage } from "./pages/setup-wizard/SetupWizardPage.js";
import { SystemStatusPage } from "./pages/system-status/SystemStatusPage.js";
import { OpsHealthPage } from "./pages/ops-health/OpsHealthPage.js";
import { NotificationsPage } from "./pages/notifications/NotificationsPage.js";
import { OperationsPage } from "./pages/operations/OperationsPage.js";
import { CounsellorPage } from "./pages/counsellor/CounsellorPage.js";
import { CalibrationReviewPage } from "./pages/calibration-review/CalibrationReviewPage.js";
import { ExtractionReviewPage } from "./pages/extraction-review/ExtractionReviewPage.js";
import { ChampionshipPage } from "./pages/championship/ChampionshipPage.js";
import { ConnectorsPage } from "./pages/ConnectorsPage.js";

export function App(): React.ReactElement {
  return (
    <AuthProvider>
      <LoginGate>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/operations" element={<OperationsPage />} />
              <Route path="/counsellor" element={<CounsellorPage />} />
              <Route path="/calibration-review" element={<CalibrationReviewPage />} />
              <Route path="/extraction-review" element={<ExtractionReviewPage />} />
              <Route path="/championship" element={<ChampionshipPage />} />
              <Route path="/automation/forms" element={<ApplicationFormsPage />} />
              <Route path="/sessions" element={<SessionsListPage enableFilters={import.meta.env.VITE_SESSIONS_FILTERS === "1"} />} />
              <Route path="/sessions/:id" element={<SessionDetailPage />} />
              <Route path="/ask" element={<PolicyAskPage />} />
              <Route path="/answer-policy" element={<PolicyManager />} />
              <Route path="/answer-policies" element={<PolicyManager />} />
              <Route path="/answer-review" element={<AnswerReviewPage />} />
              <Route path="/knowledge/documents" element={<KnowledgeDocumentsPage />} />
              <Route path="/knowledge/documents/:id" element={<KnowledgeDocumentsPage />} />
              <Route path="/knowledge/documents/:id/pages/:page" element={<KnowledgeDocumentsPage />} />
              <Route path="/knowledge/collections" element={<CuratedCollections />} />
              <Route path="/knowledge/topics" element={<KnowledgeTopicsPage />} />
              <Route path="/knowledge/topics/:id" element={<KnowledgeTopicsPage />} />
              <Route path="/knowledge/resources" element={<KnowledgeResourcesPage />} />
              <Route path="/knowledge/speakers" element={<KnowledgeSpeakerProfilePage />} />
              <Route path="/knowledge/speakers/:personId" element={<KnowledgeSpeakerProfilePage />} />
              <Route path="/knowledge-outputs" element={<KnowledgeOutputsPage />} />
              <Route path="/accounts" element={<CounsellorAccountsPage />} />
              <Route path="/automation" element={<AutomationPage />} />
              <Route path="/connectors" element={<ConnectorsPage />} />
              <Route path="/transcript-review" element={<TranscriptReviewPage />} />
              <Route path="/transcript-review/:id" element={<TranscriptReviewPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/knowledge" element={<KnowledgeDirectoryPage />} />
              <Route path="/brain" element={<BrainPage />} />
              <Route path="/explorer" element={<KnowledgeExplorerPage />} />
              <Route path="/graph-confidence" element={<ConfidenceGraphPage />} />
              <Route path="/gaps" element={<KnowledgeGapsPage />} />
              <Route path="/activity-health" element={<ActivityHealthPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/join-rules" element={<JoinRulesPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/watch" element={<WatchPage />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/claims" element={<ClaimsPage />} />
              <Route path="/status" element={<SystemStatusPage />} />
              <Route path="/setup" element={<SetupWizardPage />} />
              <Route path="/ops-health" element={<OpsHealthPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/ingest" element={<IngestPage />} />
              <Route path="/meeting-bot" element={<MeetingBotPage />} />
              <Route path="/whatsapp" element={<WhatsAppPage />} />
              <Route path="/whatsapp/review/:id/source" element={<ReviewSourcePage />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </LoginGate>
    </AuthProvider>
  );
}
