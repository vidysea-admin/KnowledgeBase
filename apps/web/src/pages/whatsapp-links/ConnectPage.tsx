/**
 * apps/web/src/pages/whatsapp-links/ConnectPage.tsx -- unit wa-web (W10; R-11..R-14, outcome 2). The link owner scans the pairing QR here.
 * Owner-only in the client as well as on the server: the link is read first, and `/connect` is never requested unless the signed-in
 * account IS the link's owner (an administrator opening someone else's link, an API-key operator and a viewer never trigger it).
 * The QR lives in this component's state only: never storage, a URL, a log or a ref outside the render; the poll stops on unmount,
 * on `connected` and on any terminal answer, and the QR is dropped at that moment (ISS-WALINKS-009: at most one request per
 * `QR_POLL_MIN_MS`, scheduled after the previous answer arrives, with a longer wait after a failure or a 429).
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import { connectLink, describeLinkError, getLink, QR_POLL_MIN_MS, type LinkView } from "../../api/whatsapp-links.js";
import { useAuth } from "../../auth/AuthContext.js";
import { QrCode } from "./QrCode.js";

type Phase = "loading" | "not-owner" | "not-connectable" | "polling" | "connected" | "stopped";
const TERMINAL_LINK_STATES: readonly string[] = ["suspended", "rejected", "unlinked", "revoked"];
const MAX_BACKOFF_MS = 30_000;

export function ConnectPage(): ReactNode {
  const { apiKey, sessionVersion, user } = useAuth();
  const { id = "" } = useParams<{ id: string }>();
  return <ConnectState key={`${sessionVersion}:${apiKey}:${id}`} apiKey={apiKey} id={id} userId={user?.id ?? null} />;
}

function ConnectState({ apiKey, id, userId }: { apiKey: string | null; id: string; userId: string | null }): ReactNode {
  const [link, setLink] = useState<LinkView | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const stop = (next: Phase, message: string | null): void => { setQr(null); setError(message); setPhase(next); };

    const tick = async (): Promise<void> => {
      let wait = QR_POLL_MIN_MS;
      try {
        const v = await connectLink(apiKey, id);
        if (cancelled) return;
        failures = 0; setError(null); setStatus(v.state);
        if (v.state === "connected") { stop("connected", null); return; }
        if (TERMINAL_LINK_STATES.includes(v.linkState)) { stop("stopped", "This link is no longer open for connecting."); return; }
        setQr(v.qr);
      } catch (e) {
        if (cancelled) return;
        const terminal = e instanceof ApiError && [400, 401, 403, 404, 409].includes(e.status);
        if (terminal) { stop("stopped", describeLinkError(e)); return; }
        setQr(null); setError(describeLinkError(e)); failures += 1;
        wait = Math.min(MAX_BACKOFF_MS, QR_POLL_MIN_MS * 2 ** failures);
        if (e instanceof ApiError && e.retryAfterSeconds !== undefined) wait = Math.max(wait, e.retryAfterSeconds * 1000);
      }
      if (!cancelled) timer = setTimeout(() => { void tick(); }, wait);
    };

    void (async () => {
      let l: LinkView;
      try { l = (await getLink(apiKey, id)).link; } catch (e) { if (!cancelled) stop("stopped", describeLinkError(e)); return; }
      if (cancelled) return;
      setLink(l);
      if (userId === null || l.userId !== userId) { setPhase("not-owner"); return; }
      const relink = l.state === "active" && (l.health?.flags ?? []).includes("needs-relink");
      if (l.state !== "approved" && !relink) { setPhase("not-connectable"); return; }
      setPhase("polling");
      await tick();
    })();

    return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer); };
  }, [apiKey, id, userId]);

  const back = <p><Link to={`/whatsapp/links/${encodeURIComponent(id)}`}>Back to the link</Link></p>;
  return (
    <div>
      <div className="page-header"><h1>Connect WhatsApp{link ? `: ${link.label}` : ""}</h1><p>Scan the code with the phone that holds the WhatsApp account you are linking.</p></div>
      <section className="card">
        {phase === "loading" && <p className="empty-note">Loading…</p>}
        {phase === "not-owner" && <p role="status" className="empty-note">Only the person who requested this link can connect it. An administrator cannot scan on their behalf.</p>}
        {phase === "not-connectable" && <p role="status" className="empty-note">This link is not waiting to be connected{link ? ` (it is ${link.state})` : ""}.</p>}
        {phase === "polling" && (
          <>
            <ol>
              <li>Open WhatsApp on your phone.</li>
              <li>Go to Settings, then Linked devices, then Link a device.</li>
              <li>Point the camera at this code. It refreshes by itself.</li>
            </ol>
            {qr ? <QrCode value={qr} /> : <p role="status" className="empty-note">{status === "awaiting_qr" || status === null ? "Waiting for a code…" : `Preparing the connection (${status})…`}</p>}
          </>
        )}
        {phase === "connected" && (
          <p role="status">Connected. Next, <Link to={`/whatsapp/links/${encodeURIComponent(id)}/choose`}>choose which groups to capture</Link>.</p>
        )}
        {error && <p role="alert" className="error-note">{error}</p>}
      </section>
      {back}
    </div>
  );
}
