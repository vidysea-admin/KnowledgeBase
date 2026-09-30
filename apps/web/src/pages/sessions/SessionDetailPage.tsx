import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { getSession, getSessionMedia, streamSessionMedia } from "../../api/sessions.js";
import { ApiError } from "../../api/client.js";
import type { SessionDetail } from "../../api/types.js";

const MAX_TURNS_SHOWN = 200;

// U-BRAIN [C3]: /brain's evidence links are `/sessions/<id>#turn-<turnId>`. Every turn therefore
// needs a real DOM id, and arriving with that hash must scroll to it and mark it — otherwise the
// "graph -> the exact turn that proves it" path dead-ends at the top of a 200-turn transcript.
function turnDomId(turnId: string): string {
  return `turn-${turnId}`;
}

// Real gap found live (2026-09-04) testing Ingest end-to-end: `tStart`/`tEnd` mean different
// units depending on how a turn was produced -- real seconds for an audio transcript, but a
// character OFFSET into the extracted text for a document/URL ingestion
// (packages/ingest/src/sources/document.ts's own `splitIntoParagraphTurns` docs this). Labeling
// both as "s" made an ingested Wikipedia page's turns read as "0s-28s" when that's actually
// characters 0-28, not seconds. `speakerRef` is the only signal available here to tell which.
function timeUnitLabel(speakerRef: string): string {
  return speakerRef === "url" || speakerRef === "document" ? "chars" : "s";
}

function formatOccurredAt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

// A palette of distinct, low-saturation colors so each speaker gets a stable, readable name
// color (WhatsApp's own convention) without needing a real color-per-person assignment service.
const SPEAKER_COLORS = ["#d17a00", "#0a7f5f", "#1a6fbf", "#a23b8f", "#a23636", "#5c6bc0", "#00838f"];
function speakerColor(ref: string): string {
  let hash = 0;
  for (let i = 0; i < ref.length; i++) hash = (hash * 31 + ref.charCodeAt(i)) >>> 0;
  return SPEAKER_COLORS[hash % SPEAKER_COLORS.length]!;
}

export function SessionDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const { hash } = useLocation();
  const { apiKey } = useAuth();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const streamController = useRef<ReturnType<typeof streamSessionMedia>>(null);
  const pendingSeek = useRef<number | null>(null);
  const assetGeneration = useRef(0);
  useEffect(() => () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl); }, [mediaUrl]);
  useEffect(() => () => { if (frameUrl) URL.revokeObjectURL(frameUrl); }, [frameUrl]);
  useEffect(() => { assetGeneration.current++; pendingSeek.current = null; setMediaUrl(null); setStreaming(false); setFrameUrl(null); setMediaError(null); return () => { assetGeneration.current++; }; }, [apiKey, id]);
  useEffect(() => {
    if (!streaming || !video.current || !detail?.media) return;
    const stop = streamSessionMedia(apiKey, id!, detail.media.mime, video.current, setMediaError);
    streamController.current = stop;
    if (stop && pendingSeek.current !== null) { stop.seek(pendingSeek.current); pendingSeek.current = null; }
    if (!stop) { setStreaming(false); setMediaError("Streaming unsupported in this browser; playback limited to 200 MB"); }
    return () => { stop?.(); streamController.current = null; };
  }, [streaming, detail, apiKey, id]);
  async function loadAsset(frameId?: string) {
    const generation = assetGeneration.current;
    const boundedRecording = detail?.media && Number.isFinite(detail.media.bytes) &&
      detail.media.bytes > 0 && detail.media.bytes <= 200 * 1024 * 1024;
    if (!frameId && !boundedRecording && detail?.media?.mime === "video/webm" && typeof MediaSource !== "undefined" &&
      ['video/webm; codecs="vp8,opus"', 'video/webm; codecs="vp9,opus"'].some((mime) => MediaSource.isTypeSupported(mime))) {
      setStreaming(true); return;
    }
    try {
      const blob = await getSessionMedia(apiKey, id!, frameId);
      if (generation !== assetGeneration.current) return;
      const url = URL.createObjectURL(blob);
      if (frameId) setFrameUrl(url); else setMediaUrl(url);
    } catch (error) { if (generation === assetGeneration.current) setMediaError(error instanceof Error ? error.message : "Recording unavailable"); }
  }
  function seekTo(seconds: number) {
    setMediaError(null); pendingSeek.current = seconds;
    if (streamController.current) { streamController.current.seek(seconds); pendingSeek.current = null; }
    else if (mediaUrl && video.current) {
      video.current.currentTime = seconds;
      if (video.current.readyState > 0) pendingSeek.current = null;
    } else void loadAsset();
  }
  const [error, setError] = useState<string | null>(null);
  const highlightedTurn = hash.startsWith("#turn-") ? decodeURIComponent(hash.slice("#turn-".length)) : null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    getSession(apiKey, id)
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "failed to load session"); });
    return () => { cancelled = true; };
  }, [apiKey, id]);

  // Runs after the transcript has rendered, which is why it depends on `detail`: the anchor does
  // not exist at mount time, so a browser's own hash handling lands on nothing.
  useEffect(() => {
    if (!detail || !highlightedTurn) return;
    document.getElementById(turnDomId(highlightedTurn))?.scrollIntoView({ block: "center" });
    const turn = detail.turns.find((turn) => turn._id === highlightedTurn);
    if (detail.media && turn && timeUnitLabel(turn.speakerRef) === "s") seekTo(turn.tStart);
  }, [detail, highlightedTurn]);

  if (error) return <div className="card error-note">{error}</div>;
  if (!detail) return <div className="card empty-note">Loading&hellip;</div>;

  return (
    <>
      <div className="page-header">
        <h1>{detail.session.title}</h1>
        <p>{detail.session.date}{detail.session.org ? ` · ${detail.session.org}` : ""}</p>
        <p>Transcript: {detail.session.status.transcribe} · Index: {detail.session.status.index}</p>
      </div>

      <div className="card">
        <div className="section-title">Overview</div>
        <p>{detail.page ? detail.page.summary : "(no summary yet)"}</p>
      </div>

      {detail.media && <div className="card">
        <div className="section-title">Recording</div>
        {!mediaUrl && !streaming && <button onClick={() => void loadAsset()}>Load recording</button>}
        <video ref={video} src={mediaUrl ?? undefined} controls onError={() => setMediaError("Recording format cannot be played by this browser")}
          onLoadedMetadata={() => { if (mediaUrl && video.current && pendingSeek.current !== null) { video.current.currentTime = pendingSeek.current; pendingSeek.current = null; } }}
          style={{ width: "100%", display: mediaUrl || streaming ? "block" : "none" }} />
        {streaming && <p>Evidence navigation loads the requested timestamp automatically.</p>}
        {!streaming && detail.media.bytes > 200 * 1024 * 1024 && <p>Browsers without WebM streaming support have a 200 MB playback limit.</p>}
      </div>}
      {mediaError && <p role="alert">{mediaError}</p>}
      {detail.notes && <div className="card">
        <div className="section-title">Evidence notes</div>
        {detail.notes.map((note, i) => <div className="row-card" key={i}>
          <p>{note.text}</p><small>{note.kind} · source statement, unverified</small>
          <button onClick={() => seekTo(note.tStart)}>Seek to {note.tStart}s</button>
          {note.turnId && <a href={`#${turnDomId(note.turnId)}`} onClick={() => seekTo(note.tStart)}>Transcript evidence</a>}
          {note.frameId && <button onClick={() => void loadAsset(note.frameId)}>View screen evidence</button>}
        </div>)}
      </div>}
      {detail.frames && <div className="card">
        <div className="section-title">Screen evidence</div>
        {detail.frames.map((frame) => <button key={frame.id} onClick={() => { void loadAsset(frame.id); seekTo(frame.tStart); }}>{frame.tStart}s · {frame.text || "Screen frame"}</button>)}
        {frameUrl && <img src={frameUrl} alt="Selected screen evidence" style={{ maxWidth: "100%" }} />}
      </div>}

      <div className="card">
        <div className="section-title">Claims ({detail.claims.length})</div>
        {detail.claims.length === 0 && <div className="empty-note">No claims extracted yet.</div>}
        {detail.claims.map((c) => (
          <div key={c._id} className="row-card">
            <div className="row-title">{c.text}</div>
            <div className="row-meta">status: {c.status}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title">Transcript ({detail.turns.length} turns)</div>
        {detail.turns.length === 0 && <div className="empty-note">No turns for this session.</div>}
        {/* Real turns with a resolved speakerLabel (currently: WhatsApp) get a chat-style
            rendering -- real sender name + real send time, closer to how the source itself
            looks, instead of a raw personId hash and a relative-offset timestamp. */}
        {detail.turns.slice(0, MAX_TURNS_SHOWN).some((t) => t.speakerLabel) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {detail.turns.slice(0, MAX_TURNS_SHOWN).map((t) => (
              <div
                key={t._id}
                id={turnDomId(t._id)}
                data-turn-id={t._id}
                style={{
                  background: t._id === highlightedTurn ? "var(--warn-bg)" : "var(--card-bg, #f7f7f5)",
                  border: `1px solid ${t._id === highlightedTurn ? "var(--warn)" : "var(--border, #e5e5e0)"}`,
                  borderRadius: "8px",
                  padding: "0.5rem 0.75rem",
                  maxWidth: "70%",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.85rem", color: speakerColor(t.speakerRef) }}>
                  {t.speakerLabel ?? t.speakerRef}
                </div>
                <div>{t.text}</div>
                {t.occurredAt && (
                  <div className="row-meta" style={{ textAlign: "right", marginTop: "0.15rem" }}>
                    {formatOccurredAt(t.occurredAt)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          detail.turns.slice(0, MAX_TURNS_SHOWN).map((t) => {
            const unit = timeUnitLabel(t.speakerRef);
            return (
              <div
                key={t._id}
                id={turnDomId(t._id)}
                data-turn-id={t._id}
                className="row-card"
                style={t._id === highlightedTurn ? { borderColor: "var(--warn)", background: "var(--warn-bg)" } : undefined}
              >
                <div className="row-title">{t.speakerRef} &middot; {t.tStart}{unit}&ndash;{t.tEnd}{unit}</div>
                <div>{t.text}</div>
              </div>
            );
          })
        )}
        {detail.turns.length > MAX_TURNS_SHOWN && (
          <div className="empty-note">&hellip; and {detail.turns.length - MAX_TURNS_SHOWN} more turns (truncated for this view).</div>
        )}
      </div>
    </>
  );
}
