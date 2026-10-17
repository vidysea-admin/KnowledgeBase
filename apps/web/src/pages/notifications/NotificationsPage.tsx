/**
 * T-057 D5 Notification center (read-only list). Failures from the upload queue, provider jobs and watcher
 * runs for the caller own tenant, newest first, from GET /notifications. Read/unread is remembered in this
 * browser only (no server store exists); that is stated on the page. Source outages are shown, never hidden.
 * Everything from the API renders as React text.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { loadNotifications, loadReadIds, saveReadIds, type NotificationsResponse } from "./notificationsClient.js";

type View = { state: "loading" } | { state: "error"; message: string } | { state: "ok"; data: NotificationsResponse };

function describe(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Notifications unavailable: your API key was not accepted.";
  if (error instanceof ApiError && error.status === 403) return "Notifications unavailable: this API key is not permitted to read them.";
  if (error instanceof ApiError && error.status === 503) return "Notifications unavailable: the service could not read them right now.";
  return "Notifications unavailable: unable to load them.";
}
const SOURCE_LABEL = { uploadQueue: "Upload queue", providerJobs: "Provider jobs", watcher: "Watcher runs", fileQueue: "File job queue" } as const;

export function NotificationsPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  return apiKey ? <NotificationsSnapshot key={`${sessionVersion}:${apiKey}`} apiKey={apiKey} />
    : <><div className="page-header"><h1>Notifications</h1></div><div className="card empty-note">Sign in with an API key to view notifications.</div></>;
}
function NotificationsSnapshot({ apiKey }: { apiKey: string }): React.ReactElement {
  const [generation, setGeneration] = useState(0);
  const [stored, setStored] = useState<{ generation: number; view: View }>({ generation: 0, view: { state: "loading" } });
  const view: View = stored.generation === generation ? stored.view : { state: "loading" };
  const setView = (value: View) => setStored({ generation, view: value });
  const [read, setRead] = useState<Set<string>>(() => loadReadIds());

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    setView({ state: "loading" });
    loadNotifications(apiKey, 50).then(
      (data) => { if (!cancelled) setView({ state: "ok", data }); },
      (e: unknown) => { if (!cancelled) setView({ state: "error", message: describe(e) }); });
    return () => { cancelled = true; };
  }, [apiKey, generation]);
  const refresh = useCallback(() => setGeneration((g) => g + 1), []);
  const markRead = (ids: string[]) => setRead((prev) => saveReadIds(new Set([...prev, ...ids])));

  const items = view.state === "ok" ? view.data.notifications : [];
  const unread = items.filter((n) => !read.has(n.id));
  const down = view.state === "ok" ? (Object.entries(view.data.sources) as [keyof typeof SOURCE_LABEL, string][]).filter(([, s]) => s === "unavailable") : [];

  return (
    <>
      <div className="page-header">
        <h1>Notifications</h1>
        <p>Recent failures for your own tenant, from the upload queue, provider jobs and watcher runs. Read marks are kept in this browser only.</p>
      </div>
      {!apiKey && <div className="card empty-note">Sign in with an API key to view notifications.</div>}
      {apiKey && (<>
        {view.state === "loading" && <p role="status" className="empty-note">Loading&hellip;</p>}
        {view.state === "error" && <p role="alert" className="error-note">{view.message}</p>}
        {view.state === "ok" && (<>
          {down.map(([k]) => <p key={k} role="alert" className="error-note">{SOURCE_LABEL[k]} unavailable: its failures are not shown below.</p>)}
          <p aria-live="polite">{unread.length} unread of {items.length}</p>
          {items.length === 0
            ? <div className="card empty-note">{down.length ? "No failures found in the sources that could be read." : "No failures in the recent window."}</div>
            : (<ul aria-label="Notifications">{items.map((n) => (
              <li key={n.id} className="card" data-read={read.has(n.id)}>
                <strong>{n.title}</strong>{!read.has(n.id) && <span> (unread)</span>}
                <div className="row-meta">{n.occurredAt} &middot; {n.source}</div>
                {n.detail && <div>{n.detail}</div>}
                {!read.has(n.id) && <button type="button" onClick={() => markRead([n.id])}>Mark as read</button>}
              </li>))}</ul>)}
          {view.data.truncated && <p className="row-meta">Older failures are not included.</p>}
          {unread.length > 0 && <button type="button" onClick={() => markRead(unread.map((n) => n.id))}>Mark all as read</button>}
        </>)}
        <button type="button" onClick={refresh}>Refresh</button>
      </>)}
    </>
  );
}
