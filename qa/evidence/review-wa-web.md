# Senior review: wa-web (80073a37..c772be75), 2026-10-30
VERDICT: Warning (no critical or high defect)
- medium: api/whatsapp-links.ts:63-66 + ChoosePage.tsx:34-38,52-60. If restrictToPeople commits step 1 (trackAllSenders:false) and then step 2 setPeople fails, the page does not reload and keeps showing "captures everyone" (the ISS-WASEL-002 class, failure path). Fix: load() in the catch/finally path and clear capture[jid].
- low: ChoosePage.tsx:27,42,56,82. The capture override map is never cleared on reload or unmark.
- low: ConnectPage.tsx:33-72. Polling does not pause on a hidden tab (still within the rate limit).
Held: no QR leakage; no-store cache; sequential 3 s poll floor with backoff; owner/admin gating; code-mapped errors; exact pin 2.0.4, integrity matches npm, MIT, no transitive deps (H-9 met).
