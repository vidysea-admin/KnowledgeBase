/** Child process for calendar/state/schedule-state-safety.test.ts: records 4 distinct sessions (argv: stateDir prefix). */
import { recordScheduled } from "./calendar/state/schedule-state.js";

const [dir, prefix] = process.argv.slice(2) as [string, string];
for (let i = 0; i < 4; i++) recordScheduled(dir, { sessionKey: `cal:${prefix}${i}`, title: "t", scheduledAt: "2026-10-10T10:00:00.000Z" }, "A");
