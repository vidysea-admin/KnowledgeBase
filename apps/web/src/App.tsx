import { useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { routerBasename } from "./config/runtime.js";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { accountsEnabled } from "./api/user-accounts.js";
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
import { KnowledgeProfilesPage } from "./pages/knowledge/KnowledgeProfilesPage.js";
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
import { LabelReviewPage } from "./pages/label-review/LabelReviewPage.js";
import { ChampionshipPage } from "./pages/championship/ChampionshipPage.js";
import { ConnectorsPage } from "./pages/ConnectorsPage.js";
import { LoginPage } from "./pages/user-accounts/LoginPage.js";
import { SignupPage } from "./pages/user-accounts/SignupPage.js";
import { CheckEmailPage } from "./pages/user-accounts/CheckEmailPage.js";
import { VerifyPage } from "./pages/user-accounts/VerifyPage.js";
import { ForgotPage } from "./pages/user-accounts/ForgotPage.js";
import { ResetPage } from "./pages/user-accounts/ResetPage.js";
import { PendingPage } from "./pages/user-accounts/PendingPage.js";
import { AccountPage } from "./pages/user-accounts/AccountPage.js";
import { UsersAdminPage } from "./pages/user-accounts/UsersAdminPage.js";
import { UserDetailPage } from "./pages/user-accounts/UserDetailPage.js";
import { AuditPage } from "./pages/user-accounts/AuditPage.js";

/** The signed-in app: shell + every page route (unchanged API-key pages plus the account pages). */
function Shell(): React.ReactElement {
  return (
    <AppShell>
      <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/operations" element={<OperationsPage />} />
              <Route path="/counsellor" element={<CounsellorPage />} />
              <Route path="/calibration-review" element={<CalibrationReviewPage />} />
              <Route path="/extraction-review" element={<ExtractionReviewPage />} />
              <Route path="/label-review" element={<LabelReviewPage />} />
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
              <Route path="/knowledge/profiles" element={<KnowledgeProfilesPage />} />
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
              <Route path="/account" element={<AccountPage />} />
              <Route path="/admin/users" element={<UsersAdminPage />} />
              <Route path="/admin/users/:id" element={<UserDetailPage />} />
              <Route path="/admin/audit" element={<AuditPage />} />
            </Routes>
    </AppShell>
  );
}

/** Signed-out visitors go to /login (remembering where they were); a pending account waits on /pending. */
function AccountGate({ children }: { children: ReactNode }): ReactNode {
  const { apiKey, accountState, restoring } = useAuth();
  const location = useLocation();
  if (restoring) return <p className="empty-note" role="status">Checking your session…</p>;
  if (apiKey === null) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (accountState === "pending") return <Navigate to="/pending" replace />;
  return children;
}

/** Account sign-in on (config.js `userAccounts: true`): public auth pages, then the gated app. The cookie session is restored once per page load. */
function AccountRoutes(): React.ReactElement {
  const { restoreSession } = useAuth();
  useEffect(() => { void restoreSession(); }, [restoreSession]);
  return (
    <Routes>
      <Route path="/login/key" element={<LoginGate><Navigate to="/" replace /></LoginGate>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/signup/check-email" element={<CheckEmailPage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/forgot" element={<ForgotPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route path="/pending" element={<PendingPage />} />
      <Route path="*" element={<AccountGate><Shell /></AccountGate>} />
    </Routes>
  );
}

export function App(): React.ReactElement {
  return (
    <AuthProvider>
      <BrowserRouter basename={routerBasename}>
        {accountsEnabled() ? <AccountRoutes /> : <LoginGate><Shell /></LoginGate>}
      </BrowserRouter>
    </AuthProvider>
  );
}
