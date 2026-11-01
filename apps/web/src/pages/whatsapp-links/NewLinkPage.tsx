/** apps/web/src/pages/whatsapp-links/NewLinkPage.tsx -- unit wa-web (W10; R-1..R-3). The request screen: the fixed archiving notice (with its version) and a label. No attestation form. The tenant and owner are never sent. */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { describeLinkError, getNotice, requestLink, type Notice } from "../../api/whatsapp-links.js";
import { useAuth } from "../../auth/AuthContext.js";

export function NewLinkPage(): ReactNode {
  const { apiKey, sessionVersion, user } = useAuth();
  return <NewLinkState key={`${sessionVersion}:${apiKey}`} apiKey={apiKey} role={user?.role ?? null} />;
}

function NewLinkState({ apiKey, role }: { apiKey: string | null; role: string | null }): ReactNode {
  const navigate = useNavigate();
  const canRequest = role === "member" || role === "admin";
  const [notice, setNotice] = useState<Notice | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRequest) return;
    let cancelled = false;
    getNotice(apiKey).then((n) => { if (!cancelled) setNotice(n); }).catch((e: unknown) => { if (!cancelled) setError(describeLinkError(e)); });
    return () => { cancelled = true; };
  }, [apiKey, canRequest]);

  if (!canRequest) return <section className="card"><p role="status" className="empty-note">Requesting a WhatsApp link is for member and admin accounts.</p></section>;

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!notice || busy) return;
    setBusy(true); setError(null);
    try {
      const { link } = await requestLink(apiKey, { label: label.trim(), noticeVersion: notice.version });
      navigate(`/whatsapp/links/${encodeURIComponent(link.id)}`);
    } catch (err) { setError(describeLinkError(err)); setBusy(false); }
  }

  return (
    <div>
      <div className="page-header"><h1>Request a WhatsApp link</h1><p>An administrator approves the request. After that you scan a QR code and choose which groups to capture.</p></div>
      <section className="card">
        <h2 className="section-title">Please read first</h2>
        {notice === null && !error && <p className="empty-note">Loading the notice…</p>}
        {notice && (
          <>
            <div style={{ whiteSpace: "pre-wrap" }}>{notice.text}</div>
            <p className="row-meta">Notice version {notice.version.slice(0, 12)}</p>
          </>
        )}
        <form onSubmit={(e) => void submit(e)}>
          <label>Name for this link <input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} required /></label>{" "}
          <button type="submit" disabled={!notice || busy || label.trim() === ""}>Request link</button>
        </form>
        {error && <p role="alert" className="error-note">{error}</p>}
      </section>
    </div>
  );
}
