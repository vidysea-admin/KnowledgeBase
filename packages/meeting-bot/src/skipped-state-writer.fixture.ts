/** Child process for alert-who-skipped-state.test.ts: records 4 distinct skipped keys (argv: stateDir prefix). */
import { recordSkipped } from "./calendar/skipped-state.js";

const [dir, prefix] = process.argv.slice(2) as [string, string];
for (let i = 0; i < 4; i++) {
  const key = `${prefix}${i}`;
  recordSkipped(dir, "A", [{ sessionKey: `cal:${key}`, source: "calendar", sourceId: key, title: "t", reason: "no-join-link" }], "2026-10-10T10:00:00.000Z", () => undefined);
}
