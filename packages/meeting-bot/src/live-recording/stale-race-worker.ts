/** Child of live-recording-stale-race.test.ts: waits for a barrier time, claims, prints one JSON line, holds the claim briefly. */
import { claimLiveRecording } from "./live-recording.js";
const [dir, url, sid, at] = process.argv.slice(2) as [string, string, string, string];
while (Date.now() < Number(at)) { /* spin to the barrier */ }
let out: unknown;
try {
  const r = claimLiveRecording({ dir, tenantId: "t1", meetingUrl: url, sessionId: sid, until: new Date(Date.now() + 3_600_000) }, new Date());
  out = { sid, ok: r.ok };
} catch (e) { out = { sid, ok: false, error: String((e as Error).message) }; }
console.log(JSON.stringify(out));
setTimeout(() => process.exit(0), 1500); // keep the winner alive past the others' decisions (its entry must read live)
