export function MeetingBotPage(): React.ReactElement {
  return (
    <>
      <div className="page-header">
        <h1>Meeting Bot</h1>
        <p>
          One real joiner is live (a local browser on Windows, recorded with OBS) &mdash; here's exactly
          what's real today and what isn't.
        </p>
      </div>

      <div className="card">
        <div className="section-title">Real and tested today</div>
        <div className="row-card">
          <div className="row-title">Platform detection</div>
          <div className="row-meta">Meet / Teams / Zoom / Webex / Zoho (webinar &amp; meeting) / Google Cloud OnAir correctly identified from a real meeting URL.</div>
        </div>
        <div className="row-card">
          <div className="row-title">Consent gate</div>
          <div className="row-meta">D-008 provided-first ordering enforced before any capture path runs.</div>
        </div>
        <div className="row-card">
          <div className="row-title">Join-strategy selection</div>
          <div className="row-meta">Routes to the right joiner (Vexa / browser-profile / system-audio) per platform.</div>
        </div>
        <div className="row-card">
          <div className="row-title">Private-segment exclusion</div>
          <div className="row-meta">A marked-private time window is dropped from the transcript before it's ever stored.</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Live since 2026-09-24</div>
        <div className="row-card">
          <div className="row-title">Browser joiner + OBS capture</div>
          <div className="row-meta">
            A headed Chrome on the bot's own signed-in profile joins the webinar (Zoho, Cloud OnAir), and OBS
            records only that window and that browser's audio. First live run: a Zoho webinar on
            2026-09-24, transcribed into 80 turns and indexed into the knowledge base.
          </div>
        </div>
      </div>

      <div className="card empty-note">
        <strong>Known gaps:</strong> no auto-reconnect yet (T-029) &mdash; when the platform drops the
        bot, the recording keeps running but the webinar audio is lost until someone reloads the
        page; the first live run lost roughly 5&ndash;8 minutes this way, so its capture is not
        complete. The captured window video is sometimes black (audio is unaffected). It runs on
        one Windows machine, started by hand or by a scheduled task. The Vexa and system-audio
        joiners are still tested-against-fakes stubs: no real Vexa instance is configured.
      </div>
    </>
  );
}
